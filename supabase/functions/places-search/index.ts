/**
 * places-search - proxy per Google Places Autocomplete (New) e Nearby Search.
 *
 * Perche' un proxy e non una chiamata diretta dall'app:
 *  1. la chiave GOOGLE_PLACES_KEY non e' restrittibile per bundle-id o per
 *     SHA1 come le chiavi Maps: e' una chiave server. Metterla nel bundle
 *     significa regalarla.
 *  2. qui si possono imporre limiti che il client non puo' aggirare
 *     disinstallando la validazione lato UI.
 *
 * Costi (SKU Autocomplete Requests, prezzi Places API New):
 * 10.000 richieste gratuite al mese, poi circa 2,83 USD ogni 1.000. La
 * fatturazione e' PER RICHIESTA: una sessione abbandonata a meta' digitazione
 * costa esattamente come una conclusa. Per questo il filtro sui 3 caratteri
 * qui sotto e' un controllo di COSTO, non una validazione di input, e sta sul
 * server: nel client sarebbe un suggerimento.
 *
 * LA LOCALITA' NON E' TESTO DA CERCARE, E' UN FILTRO GEOGRAFICO.
 * La prima versione di questa funzione riceveva "nome localita'" gia'
 * concatenato in un'unica stringa dal client e lo mandava cosi' com'e' a
 * Autocomplete: Google lo trattava come testo da far combaciare con l'inizio
 * del NOME del locale, non come un'area in cui restringere la ricerca. Un
 * utente che cercava "Bari" (solo la localita', senza nome) si vedeva
 * tornare "Barista's", "Barino" -- locali il cui nome comincia per "Bari",
 * ovunque nel mondo, invece dei ristoranti che stanno DENTRO Bari.
 *
 * La correzione risolve la localita' in coordinate PRIMA di cercare, con due
 * chiamate aggiuntive alla stessa Places API (niente Geocoding API separata
 * da abilitare/fatturare a parte):
 *   1. Autocomplete con includedPrimaryTypes ristretto a localita'/quartieri,
 *      per trovare il place_id della localita' scritta dall'utente.
 *   2. Place Details su quel place_id, chiedendo SOLO il campo `location`
 *      (il piu' economico: SKU "Location Only", non "Pro"/"Enterprise").
 * Le coordinate ottenute diventano un `locationRestriction` (non solo un
 * bias): un filtro duro, perche' l'utente ha scritto esplicitamente "cerca
 * QUI", non "preferibilmente qui". Con un nome di locale digitato insieme
 * alla localita' si resta su Autocomplete (serve testo libero); senza nome
 * (ricerca "solo per luogo") si passa a Nearby Search, che restituisce
 * direttamente locali reali in quell'area senza bisogno di testo da
 * abbinare.
 *
 * Il risultato di ogni risoluzione di localita' resta in una cache in
 * memoria per istanza (stessa logica, e stessi limiti, del token bucket piu'
 * sotto: si azzera a ogni cold start, non e' condivisa fra istanze): tante
 * persone cercano "Bari" o "Milano", non ha senso ri-risolverle a ogni
 * battuta.
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import { requireUser, toErrorResponse, HttpError } from '../_shared/auth.ts';
import { consumeToken } from '../_shared/rateLimit.ts';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const detailsUrl = (placeId: string) => `https://places.googleapis.com/v1/places/${placeId}`;

/**
 * Field mask minima: serve solo il placeId (per il dettaglio) e il testo
 * formattato (per la lista). Chiedere di piu' qui non cambia lo SKU
 * dell'autocomplete, ma allarga inutilmente la risposta.
 */
const FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';

/** Solo il place_id, per la seconda chiamata di risoluzione localita'. */
const LOCALITY_FIELD_MASK = 'suggestions.placePrediction.placeId';

/** SKU "Location Only": il campo piu' economico che Place Details offra. */
const LOCATION_FIELD_MASK = 'location';

/** Per Nearby Search: quanto basta per costruire la stessa forma di riga
 *  che il client gia' conosce dall'autocomplete (placeId, testo, indirizzo). */
const NEARBY_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress';

/** Sotto i 3 caratteri non si cerca: vedi nota sui costi in testa al file. */
const MIN_INPUT_LENGTH = 3;

/** Raggio del bias/restrizione di posizione, in metri. Una citta' media
 *  italiana ci sta comodamente; per una localita' molto piccola (una
 *  frazione) resta comunque un margine ragionevole piuttosto che uno stretto
 *  che rischia di escludere il locale che si sta cercando. */
const LOCATION_RADIUS_M = 20000;

/** Tipi ammessi per la RISOLUZIONE della localita' (non per i risultati). */
// "(regions)" e' la COLLEZIONE di tipi che Google documenta apposta per
// questo caso (locality, sublocality, postal_code, administrative_area_*,
// country...): un elenco scritto a mano di tipi singoli (la versione
// precedente aveva ['locality','sublocality','postal_code',
// 'administrative_area_level_3']) rischia di includere un valore non
// valido per questo campo -- 'administrative_area_level_3' non e' detto lo
// sia -- e Google risponde con un 400 alla PRIMA chiamata di risoluzione:
// resolveLocality lo interpreta (correttamente) come "non risolta" e la
// ricerca per sola localita' tornava vuota invece di restituire un errore
// visibile. La collezione e' un singolo valore documentato, non un elenco
// da indovinare tipo per tipo.

const INCLUDED_TYPES = ['restaurant', 'pizza_restaurant', 'bar', 'cafe'] as const;

type SearchRequest = {
  input?: unknown;
  sessionToken?: unknown;
  /** Centro opzionale per il bias: di norma la posizione dell'utente. */
  lat?: unknown;
  lng?: unknown;
  /** Testo libero di localita' scritto dall'utente: va risolto in
   *  coordinate, MAI concatenato al nome come se fosse altro testo da
   *  cercare (vedi il commento in cima al file). */
  locality?: unknown;
};

type Suggestion = {
  placePrediction?: {
    placeId?: string;
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

type AutocompleteResponse = { suggestions?: Suggestion[] };
type DetailsLocationResponse = { location?: { latitude?: number; longitude?: number } };
type NearbyPlace = { id?: string; displayName?: { text?: string }; formattedAddress?: string };
type NearbyResponse = { places?: NearbyPlace[] };

export type SearchResult = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

type LatLng = { latitude: number; longitude: number };

/* Rate limit: vedi supabase/functions/_shared/rateLimit.ts per l'implementazione
 * e i suoi limiti noti (bucket per istanza, non un limite globale). */

/* ------------------------------------------------------------------
 * Cache di risoluzione localita': stesso profilo di rischio del bucket qui
 * sopra (per istanza, si azzera a ogni cold start). Chiave = testo digitato,
 * minuscolo e senza spazi ai bordi -- non ha bisogno di essere piu' furba di
 * cosi', tanto un miss costa solo due chiamate in piu'.
 * ------------------------------------------------------------------ */
const LOCALITY_CACHE_TTL_MS = 60 * 60 * 1000; // un'ora
const localityCache = new Map<string, { coords: LatLng | null; expiresAtMs: number }>();

function getCachedLocality(key: string): LatLng | null | undefined {
  const hit = localityCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAtMs < Date.now()) {
    localityCache.delete(key);
    return undefined;
  }
  return hit.coords;
}

function setCachedLocality(key: string, coords: LatLng | null): void {
  localityCache.set(key, { coords, expiresAtMs: Date.now() + LOCALITY_CACHE_TTL_MS });
}

/** Risolve un testo libero di localita' in coordinate, o null se Google non
 *  trova nulla che somigli a un luogo. Due chiamate Places (autocomplete
 *  ristretto ai tipi "area", poi Details per la sola location), MAI la
 *  Geocoding API: e' un'API diversa, con una sua abilitazione e un suo SKU,
 *  che il progetto non usa altrove. */
async function resolveLocality(locality: string, apiKey: string): Promise<LatLng | null> {
  const key = locality.trim().toLowerCase();
  const cached = getCachedLocality(key);
  if (cached !== undefined) return cached;

  try {
    const acRes = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': LOCALITY_FIELD_MASK,
      },
      body: JSON.stringify({
        input: locality,
        includedPrimaryTypes: ['(regions)'],
        languageCode: 'it',
        regionCode: 'IT',
      }),
    });
    if (!acRes.ok) {
      console.error('places:autocomplete (locality)', acRes.status, await acRes.text());
      setCachedLocality(key, null);
      return null;
    }
    const acData = (await acRes.json()) as AutocompleteResponse;
    const placeId = acData.suggestions?.[0]?.placePrediction?.placeId;
    if (!placeId) {
      setCachedLocality(key, null);
      return null;
    }

    const detRes = await fetch(detailsUrl(placeId), {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': LOCATION_FIELD_MASK },
    });
    if (!detRes.ok) {
      console.error('places:details (locality)', detRes.status, await detRes.text());
      setCachedLocality(key, null);
      return null;
    }
    const detData = (await detRes.json()) as DetailsLocationResponse;
    const lat = detData.location?.latitude;
    const lng = detData.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      setCachedLocality(key, null);
      return null;
    }

    const coords: LatLng = { latitude: lat, longitude: lng };
    setCachedLocality(key, coords);
    return coords;
  } catch (err) {
    console.error('resolveLocality', err);
    setCachedLocality(key, null);
    return null;
  }
}

/** Autocomplete testuale, con bias o restrizione geografica opzionali.
 *  Estratto in una funzione a se' perche' serve in due punti: la ricerca
 *  normale (nome digitato) e il ripiego quando la localita' non si risolve
 *  in coordinate (vedi searchLocalityOnly) -- meglio un risultato ottenuto
 *  con la vecchia logica "solo testo" che uno schermo vuoto che sembra dire
 *  "questo posto non esiste". */
async function autocompleteSearch(
  input: string,
  sessionToken: string | null,
  geo:
    | { locationBias?: { circle: { center: LatLng; radius: number } } }
    | { locationRestriction?: { circle: { center: LatLng; radius: number } } }
    | Record<string, never>,
  apiKey: string,
): Promise<SearchResult[]> {
  const payload: Record<string, unknown> = {
    input,
    includedPrimaryTypes: [...INCLUDED_TYPES],
    languageCode: 'it',
    regionCode: 'IT',
    ...geo,
  };
  // Il sessionToken raggruppa le richieste della stessa digitazione: senza,
  // ogni carattere e' una sessione a se'.
  if (sessionToken) payload.sessionToken = sessionToken;

  const response = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('places:autocomplete', response.status, await response.text());
    throw new HttpError(502, 'La ricerca non ha risposto. Riprova.');
  }

  const data = (await response.json()) as AutocompleteResponse;

  return (data.suggestions ?? [])
    .map((sug): SearchResult | null => {
      const prediction = sug.placePrediction;
      if (!prediction?.placeId) return null;
      return {
        placeId: prediction.placeId,
        primaryText: prediction.structuredFormat?.mainText?.text ?? '',
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

/** Ricerca "solo per luogo" (nessun nome digitato): locali veri nell'area,
 *  non predizioni di testo -- e' lo strumento giusto quando non c'e' niente
 *  da far combaciare con un nome. */
async function searchNearby(center: LatLng, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch(NEARBY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: [...INCLUDED_TYPES],
      languageCode: 'it',
      regionCode: 'IT',
      locationRestriction: {
        circle: { center, radius: LOCATION_RADIUS_M },
      },
    }),
  });
  if (!res.ok) {
    console.error('places:searchNearby', res.status, await res.text());
    throw new HttpError(502, 'La ricerca non ha risposto. Riprova.');
  }
  const data = (await res.json()) as NearbyResponse;
  return (data.places ?? [])
    .map((p): SearchResult | null => {
      if (!p.id) return null;
      return {
        placeId: p.id,
        primaryText: p.displayName?.text ?? '',
        secondaryText: p.formattedAddress ?? '',
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

function parseBody(body: SearchRequest): {
  input: string;
  sessionToken: string | null;
  lat: number | null;
  lng: number | null;
  locality: string;
} {
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : null;
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  const locality = typeof body.locality === 'string' ? body.locality.trim() : '';
  return { input, sessionToken, lat, lng, locality };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');

    const caller = await requireUser(req);

    if (
      !consumeToken(caller.userId, { scope: 'places-search', capacity: 30, refillPerSecond: 0.5 })
    ) {
      throw new HttpError(429, 'Troppe ricerche di seguito. Aspetta un istante.');
    }

    const raw = (await req.json().catch(() => ({}))) as SearchRequest;
    const { input, sessionToken, lat, lng, locality } = parseBody(raw);

    // Guardia di costo: si risponde 200 con lista vuota invece di 400, cosi'
    // il client non deve distinguere "troppo corto" da "nessun risultato".
    // Basta che UNO dei due campi (nome o localita') raggiunga la lunghezza
    // minima: una ricerca solo per localita' e' un caso d'uso legittimo (vedi
    // il commento in cima al file), non piu' un input da scartare.
    if (input.length < MIN_INPUT_LENGTH && locality.length < MIN_INPUT_LENGTH) {
      return json({ results: [] satisfies SearchResult[] });
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_KEY');
    if (!apiKey) throw new HttpError(500, 'Ricerca non disponibile in questo momento.');

    // La localita' scritta a mano vince come filtro geografico: e' un
    // segnale esplicito ("cerca QUI"), piu' forte del bias generico dalla
    // posizione del dispositivo. Se non si risolve, non si finge che vada
    // tutto bene: si prosegue senza restrizione geografica invece di
    // inventare un centro a caso.
    const localityCenter =
      locality.length >= MIN_INPUT_LENGTH ? await resolveLocality(locality, apiKey) : null;

    // Solo localita', nessun nome: niente testo da abbinare, serve un
    // elenco di locali veri nell'area.
    if (input.length < MIN_INPUT_LENGTH) {
      if (localityCenter) {
        const results = await searchNearby(localityCenter, apiKey);
        return json({ results });
      }
      // La localita' non si e' risolta in coordinate (Google non la
      // riconosce, o la chiamata di risoluzione e' fallita): niente centro
      // su cui cercare "alla cieca" con Nearby Search. Si ripiega
      // sull'autocomplete testuale usando la localita' stessa come input --
      // e' la logica con cui questa funzione lavorava PRIMA di questa
      // modifica: meno preciso (puo' far combaciare il testo con l'inizio
      // di un nome, non solo con un'area), ma sempre meglio di uno schermo
      // vuoto che sembra dire "questo posto non esiste".
      const results = await autocompleteSearch(locality, sessionToken, {}, apiKey);
      return json({ results });
    }

    const geo = localityCenter
      ? // Filtro duro: l'utente ha scritto la localita' apposta.
        { locationRestriction: { circle: { center: localityCenter, radius: LOCATION_RADIUS_M } } }
      : lat !== null && lng !== null
        ? // Nessuna localita' (o non risolta): resta il bias debole dalla
          // posizione del dispositivo, se disponibile.
          {
            locationBias: {
              circle: { center: { latitude: lat, longitude: lng }, radius: LOCATION_RADIUS_M },
            },
          }
        : {};

    const results = await autocompleteSearch(input, sessionToken, geo, apiKey);
    return json({ results });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
