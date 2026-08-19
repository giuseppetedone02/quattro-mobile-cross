import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import {
  MIN_QUERY_LENGTH,
  newSessionToken,
  searchPlaces,
  type GooglePrediction,
} from '@/features/places/api/googlePlaces';

export type GooglePlaceSearch = {
  query: string;
  setQuery: (q: string) => void;
  results: GooglePrediction[];
  isSearching: boolean;
  error: string | null;
  /** Da chiamare dopo aver scelto un risultato (la Place Details chiude la
   *  sessione) o quando si abbandona la ricerca. */
  resetSession: () => void;
  /** Va passato alla chiamata di Place Details che chiude la sessione. */
  sessionToken: string;
};

/**
 * Il token di sessione vive nel ref, non nello stato: cambiarlo non deve
 * ridisegnare nulla, e soprattutto non deve entrare nella queryKey. Se
 * entrasse, ogni nuova sessione rifarebbe da zero le stesse ricerche.
 *
 * Il debounce non e' qui: lo fa <SearchField> con onDebouncedChange, e la
 * schermata passa a setQuery il valore gia' ritardato. Cosi' la regola dei
 * 300 ms sta in un solo posto.
 */
export function useGooglePlaceSearch(near?: {
  latitude: number;
  longitude: number;
}): GooglePlaceSearch {
  const [query, setQuery] = useState('');
  const [sessionToken, setSessionToken] = useState<string>(() => newSessionToken());
  const tokenRef = useRef(sessionToken);

  useEffect(() => {
    tokenRef.current = sessionToken;
  }, [sessionToken]);

  const trimmed = query.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const search = useQuery({
    queryKey: qk.googleSearch(trimmed),
    enabled,
    // I dati Google non si conservano: cache breve, solo per non ripetere la
    // stessa richiesta mentre l'utente cancella e riscrive una lettera.
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    queryFn: () => searchPlaces(trimmed, tokenRef.current, near),
  });

  const resetSession = useCallback(() => {
    setSessionToken(newSessionToken());
  }, []);

  return {
    query,
    setQuery,
    results: enabled ? (search.data ?? []) : [],
    isSearching: enabled && search.isFetching,
    error: search.error ? friendlyError(search.error).message : null,
    resetSession,
    sessionToken,
  };
}
