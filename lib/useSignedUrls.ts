import { useQuery } from '@tanstack/react-query';
import { signedUrls } from './photos';

/**
 * Risolve in BATCH gli URL firmati per un bucket privato.
 *
 * Una sola chiamata createSignedUrls invece di N: su una lista di 30 posti,
 * o di recensioni con tre foto ciascuna, la differenza fra una richiesta e
 * novanta si vede a occhio.
 *
 * TTL 55 minuti sulla cache contro i 60 della firma: si rinnova prima che
 * scada, cosi' non compaiono immagini rotte mentre si scorre.
 */
export function useSignedUrls(bucket: string, paths: (string | null | undefined)[]) {
  // Chiave stabile: ordinata e deduplicata, cosi' lo stesso insieme di path
  // in ordine diverso non genera due entry di cache.
  const clean = Array.from(new Set(paths.filter((p): p is string => Boolean(p)))).sort();

  return useQuery({
    queryKey: ['signed-urls', bucket, clean.join('|')],
    enabled: clean.length > 0,
    staleTime: 1000 * 60 * 55,
    gcTime: 1000 * 60 * 60,
    queryFn: () => signedUrls(bucket, clean, 3600),
  });
}
