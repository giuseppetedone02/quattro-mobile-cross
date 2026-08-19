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

/** Forme grezze della Places API (New), come arrivano dalla Edge Function. */
type RawSearchResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
      text?: { text?: string };
    };
  }[];
};

type RawDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: { name?: string }[];
  googleMapsUri?: string;
};

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
): Promise<GooglePrediction[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const raw = await invokeFunction<RawSearchResponse>('places-search', {
    query: trimmed,
    sessionToken,
    ...(near ? { near } : {}),
  });

  return (raw.suggestions ?? []).flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction?.placeId) return [];
    const main = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '';
    if (!main) return [];
    return [
      {
        placeId: prediction.placeId,
        mainText: main,
        secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
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

  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;

  return {
    placeId: raw.id ?? placeId,
    displayName: raw.displayName?.text ?? '',
    formattedAddress: raw.formattedAddress ?? '',
    location:
      typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    priceLevel: raw.priceLevel ?? null,
    openNow:
      typeof raw.regularOpeningHours?.openNow === 'boolean'
        ? raw.regularOpeningHours.openNow
        : null,
    weekdayDescriptions: raw.regularOpeningHours?.weekdayDescriptions ?? null,
    googleMapsUri: raw.googleMapsUri ?? null,
    photoNames: (raw.photos ?? []).flatMap((p) => (p.name ? [p.name] : [])),
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
