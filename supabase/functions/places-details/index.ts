/**
 * places-details - proxy per Google Place Details (New), con cache.
 *
 * DUE COSE NON NEGOZIABILI IN QUESTO FILE.
 *
 * 1. LA FIELD MASK E' FISSA LATO SERVER e non viene MAI dal client.
 *    Places API (New) fattura per SKU in base ai campi richiesti:
 *    Essentials, Pro, Enterprise, Enterprise + Atmosphere. Un client che
 *    potesse aggiungere "reviews" alla field mask sposterebbe ogni chiamata
 *    sullo SKU piu' caro (ordine dei 25 USD per 1.000 contro i circa 17 e i
 *    circa 5 delle fasce inferiori) e nessuno se ne accorgerebbe fino alla
 *    fattura. Accettare la field mask dal client e' quindi delegargli il
 *    budget. Se serve un campo nuovo, si aggiunge QUI e si rilegge il
 *    listino.
 *
 * 2. LA CACHE HA UN TTL DI 6 ORE, e resta corta di proposito.
 *    I Google Maps Platform Service Terms permettono di memorizzare i
 *    contenuti solo temporaneamente, per migliorare le prestazioni: una cache
 *    a TTL breve e' un livello di performance transitorio, un archivio non lo
 *    e'. Sei ore coprono la giornata d'uso di un gruppo (piu' persone che
 *    guardano lo stesso ristorante nello stesso pomeriggio) senza diventare
 *    una copia locale del database di Google. Il place_id e' l'unico dato che
 *    conserviamo a tempo indeterminato, ed e' l'unico che i Termini
 *    consentono di conservare.
 *
 * La cache sta in public.google_place_cache, che ha RLS attiva e ZERO policy:
 * si legge solo con la service-role key, quindi solo da qui.
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import {
  requireUser,
  serviceClient,
  userClient,
  toErrorResponse,
  HttpError,
} from '../_shared/auth.ts';

/** Vedi punto 1 in testa al file: questa costante non diventa un parametro. */
const FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'regularOpeningHours',
  'photos',
  'googleMapsUri',
].join(',');

const CACHE_TTL_HOURS = 6;

type GoogleDetails = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: { name?: string }[];
  googleMapsUri?: string;
};

/** Forma attesa dall'app: nomi in camelCase, niente wrapper di Google. */
export type PlaceDetails = {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { lat: number; lng: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  openNow: boolean | null;
  weekdayDescriptions: string[];
  googleMapsUri: string | null;
  photoNames: string[];
};

function normalise(raw: GoogleDetails, fallbackId: string): PlaceDetails {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;

  return {
    placeId: raw.id ?? fallbackId,
    displayName: raw.displayName?.text ?? null,
    formattedAddress: raw.formattedAddress ?? null,
    location:
      typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    priceLevel: raw.priceLevel ?? null,
    openNow:
      typeof raw.regularOpeningHours?.openNow === 'boolean'
        ? raw.regularOpeningHours.openNow
        : null,
    weekdayDescriptions: raw.regularOpeningHours?.weekdayDescriptions ?? [],
    googleMapsUri: raw.googleMapsUri ?? null,
    photoNames: (raw.photos ?? [])
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0),
  };
}

/** Legge dalla cache solo se non scaduta. Un miss non e' un errore. */
async function readCache(placeId: string): Promise<GoogleDetails | null> {
  const { data, error } = await serviceClient()
    .from('google_place_cache')
    .select('payload, expires_at')
    .eq('google_place_id', placeId)
    .maybeSingle();

  if (error) {
    console.error('cache read', error.message);
    return null;
  }
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;

  return data.payload as GoogleDetails;
}

async function writeCache(placeId: string, payload: GoogleDetails): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
  const { error } = await serviceClient()
    .from('google_place_cache')
    .upsert(
      {
        google_place_id: placeId,
        payload,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'google_place_id' },
    );
  // Un errore di scrittura della cache non deve far fallire la richiesta:
  // peggiora le prestazioni, non il risultato.
  if (error) console.error('cache write', error.message);
}

async function fetchFromGoogle(placeId: string): Promise<GoogleDetails> {
  const apiKey = Deno.env.get('GOOGLE_PLACES_KEY');
  if (!apiKey) throw new HttpError(500, 'Dettagli non disponibili in questo momento.');

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
      'Accept-Language': 'it',
    },
  });

  if (response.status === 404) throw new HttpError(404, 'Questo posto non esiste piu su Google.');
  if (!response.ok) {
    console.error('places:details', response.status, await response.text());
    throw new HttpError(502, 'Non ho potuto leggere i dettagli. Riprova.');
  }

  return (await response.json()) as GoogleDetails;
}

/**
 * ?refreshCoords=1: riscrive lat/lng e coords_refreshed_at sulla riga di
 * public.places collegata a questo place_id.
 *
 * Serve perche' il job dei 29 giorni (migrazione 0007) AZZERA le coordinate
 * per rispettare i Service Terms sezione 14.3: quando la mappa non ha piu'
 * coordinate, il modo previsto per riaverle e' questa chiamata.
 *
 * L'update passa dal client dell'UTENTE, non dalla service-role key: cosi' e'
 * la policy places_update a decidere se puo' toccare quella riga, invece di
 * riscrivere il controllo di accesso qui dentro.
 */
async function refreshCoords(
  jwt: string,
  placeId: string,
  details: PlaceDetails,
): Promise<void> {
  if (!details.location) return;

  const { error } = await userClient(jwt)
    .from('places')
    .update({
      lat: details.location.lat,
      lng: details.location.lng,
      coords_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('google_place_id', placeId);

  if (error) console.error('refreshCoords', error.message);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // POST con corpo JSON, non GET con query string: e' cosi' che
    // supabase.functions.invoke() del client (vedi features/places/api/
    // googlePlaces.ts) manda SEMPRE la richiesta, per tutte e tre le Edge
    // Function di questo progetto. La versione precedente leggeva placeId e
    // refreshCoords da url.searchParams: il client non li ha mai messi li',
    // quindi placeId arrivava sempre vuoto e la richiesta falliva con 400
    // ("Manca il placeId") ad ogni tap su un risultato di ricerca.
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Metodo non consentito.');
    }

    const caller = await requireUser(req);

    const body = (await req.json().catch(() => ({}))) as {
      placeId?: unknown;
      refreshCoords?: unknown;
    };
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : '';
    if (!placeId) throw new HttpError(400, 'Manca il placeId.');

    const wantsCoords = body.refreshCoords === true || body.refreshCoords === '1';

    const cached = await readCache(placeId);
    const raw = cached ?? (await fetchFromGoogle(placeId));
    if (!cached) await writeCache(placeId, raw);

    const details = normalise(raw, placeId);

    if (wantsCoords) await refreshCoords(caller.jwt, placeId, details);

    return json({ details, cached: cached !== null });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
