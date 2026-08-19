/**
 * places-search - proxy per Google Places Autocomplete (New).
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
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import { requireUser, toErrorResponse, HttpError } from '../_shared/auth.ts';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

/**
 * Field mask minima: serve solo il placeId (per il dettaglio) e il testo
 * formattato (per la lista). Chiedere di piu' qui non cambia lo SKU
 * dell'autocomplete, ma allarga inutilmente la risposta.
 */
const FIELD_MASK = 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';

/** Sotto i 3 caratteri non si cerca: vedi nota sui costi in testa al file. */
const MIN_INPUT_LENGTH = 3;

/** Raggio del bias di posizione, in metri. */
const LOCATION_BIAS_RADIUS_M = 30000;

const INCLUDED_TYPES = ['restaurant', 'pizza_restaurant', 'bar', 'cafe'] as const;

type SearchRequest = {
  input?: unknown;
  sessionToken?: unknown;
  /** Centro opzionale per il bias: di norma la posizione dell'utente. */
  lat?: unknown;
  lng?: unknown;
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

export type SearchResult = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

/* ------------------------------------------------------------------
 * Rate limit per utente: token bucket in memoria.
 *
 * LIMITI REALI DI QUESTA IMPLEMENTAZIONE, da conoscere prima di fidarsi:
 *  - la mappa vive nell'istanza dell'Edge Function. Supabase puo' avviare
 *    piu' istanze e riciclarle: il limite effettivo e' quindi "CAPACITY per
 *    utente per istanza", non globale, e si azzera a ogni cold start.
 *  - non e' una difesa contro un attacco distribuito. E' una rete di
 *    sicurezza contro il caso concreto e frequente: un ciclo impazzito nel
 *    client, o un debounce rotto, che brucia il credito mensile in un
 *    pomeriggio.
 * Per un limite reale servirebbe un contatore condiviso (tabella Postgres con
 * finestra temporale, o Redis). Da fare quando il traffico lo giustifica.
 * ------------------------------------------------------------------ */
const BUCKET_CAPACITY = 30;
const REFILL_TOKENS_PER_SECOND = 0.5; // 30 richieste, poi 1 ogni 2 secondi

type Bucket = { tokens: number; lastRefillMs: number };
const buckets = new Map<string, Bucket>();

function consumeToken(userId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId) ?? { tokens: BUCKET_CAPACITY, lastRefillMs: now };

  const elapsedSeconds = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(
    BUCKET_CAPACITY,
    bucket.tokens + elapsedSeconds * REFILL_TOKENS_PER_SECOND,
  );
  bucket.lastRefillMs = now;

  if (bucket.tokens < 1) {
    buckets.set(userId, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(userId, bucket);
  return true;
}

/* ------------------------------------------------------------------ */

function parseBody(body: SearchRequest): {
  input: string;
  sessionToken: string | null;
  lat: number | null;
  lng: number | null;
} {
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : null;
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  return { input, sessionToken, lat, lng };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');

    const caller = await requireUser(req);

    if (!consumeToken(caller.userId)) {
      throw new HttpError(429, 'Troppe ricerche di seguito. Aspetta un istante.');
    }

    const raw = (await req.json().catch(() => ({}))) as SearchRequest;
    const { input, sessionToken, lat, lng } = parseBody(raw);

    // Guardia di costo: si risponde 200 con lista vuota invece di 400, cosi'
    // il client non deve distinguere "troppo corto" da "nessun risultato".
    if (input.length < MIN_INPUT_LENGTH) {
      return json({ results: [] satisfies SearchResult[] });
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_KEY');
    if (!apiKey) throw new HttpError(500, 'Ricerca non disponibile in questo momento.');

    const payload: Record<string, unknown> = {
      input,
      includedPrimaryTypes: [...INCLUDED_TYPES],
      languageCode: 'it',
      regionCode: 'IT',
    };
    // Il sessionToken raggruppa le richieste della stessa digitazione: senza,
    // ogni carattere e' una sessione a se'.
    if (sessionToken) payload.sessionToken = sessionToken;
    if (lat !== null && lng !== null) {
      payload.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: LOCATION_BIAS_RADIUS_M },
      };
    }

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

    const results: SearchResult[] = (data.suggestions ?? [])
      .map((s): SearchResult | null => {
        const prediction = s.placePrediction;
        if (!prediction?.placeId) return null;
        return {
          placeId: prediction.placeId,
          primaryText: prediction.structuredFormat?.mainText?.text ?? '',
          secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
        };
      })
      .filter((r): r is SearchResult => r !== null);

    return json({ results });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
