import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

/**
 * Client di Google Places -- passando SOLO dalle nostre Edge Function.
 *
 * La chiave del servizio web di Places non puo' essere ristretta per app
 * (l'SDK nativo firma gli header, una fetch() no): una chiave non ristretta
 * dentro un bundle si estrae con `strings` sull'APK. Per questo qui non
 * compare mai places.googleapis.com: solo supabase.functions.invoke().
 *
 * Le tre funzioni server sono places-search, places-details e places-photo.
 * La field mask e' fissata lato server: un client che potesse chiedere
 * `reviews` sposterebbe la fattura sulla SKU piu' cara.
 */

export type GooglePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type GooglePlaceDetails = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  openNow: boolean | null;
  weekdayDescriptions: string[] | null;
  googleMapsUri: string | null;
  /** Nomi delle foto (risorse Google), da risolvere con getPlacePhotoUrl. */
  photoNames: string[];
};

/** Minimo di caratteri prima della prima chiamata. Cortesia lato client:
 *  la regola vera e' nella Edge Function. Vale anche come misura di costo,
 *  perche' le sessioni abbandonate si pagano a richiesta. */
export const MIN_QUERY_LENGTH = 3;

// Le forme qui sotto sono quelle GIA' RESTITUITE dalle nostre Edge Function
// (places-search, places-details), non quelle grezze di Google: le Edge
// Function le appiattiscono apposta cosi' il client non deve conoscere la
// struttura di Google (vedi "normalise()" in supabase/functions/places-details
// e la mappa in places-search). Usare qui la forma grezza di Google -- come
// faceva questo file prima -- legge campi che non esistono mai nella
// risposta reale (raw.suggestions invece di raw.results, raw.location
// invece di raw.details.location): il risultato e' che la ricerca ritorna
// sempre vuota, silenziosamente, anche quando l'Edge Function risponde bene.
type RawSearchResponse = {
  results?: {
    placeId?: string;
    primaryText?: string;
    secondaryText?: string;
  }[];
};

type RawDetails = {
  placeId?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat?: number; lng?: number } | null;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: string | null;
  openNow?: boolean | null;
  weekdayDescriptions?: string[] | null;
  googleMapsUri?: string | null;
  photoNames?: string[] | null;
};

type RawDetailsResponse = { details?: RawDetails; cached?: boolean };

type RawPhotoResponse = { photoUri?: string };

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw error;
  if (data == null) {
    throw new Error('Google Maps non ha risposto. Riprova tra poco.');
  }
  return data;
}

/**
 * Un solo token per sessione di autocomplete: dalla prima battuta fino alla
 * chiamata a Place Details che la chiude, poi si butta.
 *
 * E' la regola di fatturazione che rende gratuito l'autocomplete: se la
 * sessione termina con una Place Details Pro/Enterprise -- e la nostra field
 * mask chiede displayName, rating, priceLevel e orari, quindi lo e' --
 * TUTTE le richieste di autocomplete di quella sessione ricadono nella SKU
 * `Autocomplete Session Usage`, senza costo. Riusare il token su piu' ricerche
 * indipendenti, o non passarlo, fa perdere lo sconto.
 */
export function newSessionToken(): string {
  return Crypto.randomUUID();
}

export async function searchPlaces(
  query: string,
  sessionToken: string,
  near?: { latitude: number; longitude: number },
  /** Testo libero di localita' (citta', paese) scritto dall'utente per
   *  restringere la ricerca: non e' un bias geografico (richiederebbe
   *  geocoding), e' semplicemente unito al testo cercato -- Google Places
   *  gestisce bene "nome + citta'" nello stesso input. */
  locality?: string,
): Promise<GooglePrediction[]> {
  const trimmed = query.trim();
  const trimmedLocality = locality?.trim() ?? '';
  // Prima si scartava tutto se il solo NOME era troppo corto, anche quando
  // la localita' da sola bastava a fare una ricerca sensata ("Bari",
  // "Vicenza"...). Il controllo va fatto considerando entrambi i campi, non
  // solo il nome.
  if (trimmed.length < MIN_QUERY_LENGTH && trimmedLocality.length < MIN_QUERY_LENGTH) return [];

  // Nomi di campo che l'Edge Function places-search legge davvero (vedi
  // parseBody() li': "input", "lat"/"lng" piatti, non "query"/"near"
  // annidato). Con i nomi sbagliati la funzione riceveva sempre input vuoto
  // e rispondeva {results: []} -- una ricerca silenziosamente sempre vuota,
  // indistinguibile a occhio da "nessun risultato".
  //
  // "locality" va mandata COME CAMPO SEPARATO, mai concatenata al nome in
  // un'unica stringa: prima lo era ("nome localita'"), e Google Autocomplete
  // la trattava come altro testo da far combaciare con l'inizio del NOME del
  // locale, non come un'area geografica. Cercare solo "Bari" restituiva
  // "Barista's" e "Barino" -- locali il cui nome comincia per "Bari",
  // ovunque nel mondo. La Edge Function ora risolve la localita' in
  // coordinate e la usa come filtro geografico vero (vedi il commento in
  // cima a supabase/functions/places-search/index.ts).
  const raw = await invokeFunction<RawSearchResponse>('places-search', {
    input: trimmed,
    sessionToken,
    ...(near ? { lat: near.latitude, lng: near.longitude } : {}),
    ...(trimmedLocality ? { locality: trimmedLocality } : {}),
  });

  return (raw.results ?? []).flatMap((result) => {
    if (!result.placeId || !result.primaryText) return [];
    return [
      {
        placeId: result.placeId,
        mainText: result.primaryText,
        secondaryText: result.secondaryText ?? '',
      },
    ];
  });
}

/**
 * Chiude la sessione di autocomplete. Il chiamante deve buttare il token
 * subito dopo: vedi newSessionToken().
 */
export async function getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
  const raw = await invokeFunction<RawDetailsResponse>('places-details', { placeId });
  const details = raw.details;

  const lat = details?.location?.lat;
  const lng = details?.location?.lng;

  return {
    placeId: details?.placeId ?? placeId,
    displayName: details?.displayName ?? '',
    formattedAddress: details?.formattedAddress ?? '',
    location:
      typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
    rating: typeof details?.rating === 'number' ? details.rating : null,
    userRatingCount: typeof details?.userRatingCount === 'number' ? details.userRatingCount : null,
    priceLevel: details?.priceLevel ?? null,
    openNow: typeof details?.openNow === 'boolean' ? details.openNow : null,
    weekdayDescriptions: details?.weekdayDescriptions ?? null,
    googleMapsUri: details?.googleMapsUri ?? null,
    photoNames: details?.photoNames ?? [],
  };
}

/**
 * URI di una foto Google.
 *
 * L'URI e' a vita breve e NON si persiste: ne' in tabella, ne' nella cache su
 * disco (queryClient scarta le chiavi che iniziano con 'google'). Va richiesto
 * al momento della visualizzazione, e ogni visualizzazione si ripaga: per
 * questo le foto delle recensioni degli utenti restano la fonte primaria.
 */
export async function getPlacePhotoUrl(
  photoName: string,
  maxWidthPx = 800,
): Promise<string | null> {
  const raw = await invokeFunction<RawPhotoResponse>('places-photo', { photoName, maxWidthPx });
  return raw.photoUri ?? null;
}

/** Etichette italiane per priceLevel della Places API (New). */
export const PRICE_LEVEL_LABEL: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Gratis',
  PRICE_LEVEL_INEXPENSIVE: 'Economico',
  PRICE_LEVEL_MODERATE: 'Nella media',
  PRICE_LEVEL_EXPENSIVE: 'Caro',
  PRICE_LEVEL_VERY_EXPENSIVE: 'Molto caro',
};

export function priceLevelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return PRICE_LEVEL_LABEL[level] ?? null;
}
