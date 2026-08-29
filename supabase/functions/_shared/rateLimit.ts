/**
 * Rate limiting per utente, condiviso dalle Edge Function che fanno da proxy
 * verso Google Places (places-search, places-details, places-photo).
 *
 * Prima di questa estrazione, solo places-search implementava un token
 * bucket: places-details e places-photo verificavano il JWT ma non
 * limitavano affatto la frequenza delle chiamate. places-photo e' il caso
 * piu' delicato, perche' e' l'unica delle tre SKU di Places API (New) che
 * non rientra nella soglia gratuita mensile: un account compromesso, un
 * client modificato o anche solo un bug che rimonta la stessa griglia di
 * immagini in loop puo' generare una spesa reale, non solo un fastidio.
 *
 * LIMITI REALI DI QUESTA IMPLEMENTAZIONE, da conoscere prima di fidarsi
 * (identici a quelli del bucket originale di places-search, solo condivisi):
 *  - la mappa vive nell'istanza dell'Edge Function. Supabase puo' avviare
 *    piu' istanze e riciclarle: il limite effettivo e' "capacity per utente
 *    per istanza", non globale, e si azzera a ogni cold start.
 *  - non e' una difesa contro un attacco distribuito. E' una rete di
 *    sicurezza contro il caso concreto e frequente: un ciclo impazzito nel
 *    client, o un debounce rotto, che brucia il credito in un pomeriggio.
 * Per un limite reale, condiviso fra tutte le istanze, servirebbe un
 * contatore centralizzato (tabella Postgres con finestra temporale, o
 * Redis/Upstash). Da fare quando il traffico reale lo giustifica: vedi la
 * voce dedicata nel piano di implementazione (binario sicurezza).
 */

type Bucket = { tokens: number; lastRefillMs: number };

/**
 * Chiave = scope:utente, cosi' due funzioni diverse non condividono credito:
 * un limite stretto su places-photo non deve consumare per errore il
 * credito di places-search per lo stesso utente, e viceversa.
 */
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Nome della funzione chiamante (es. "places-photo"): tiene i bucket separati. */
  scope: string;
  /** Quanti token puo' accumulare al massimo un utente. */
  capacity: number;
  /** Token restituiti al secondo (velocita' di "ricarica" del bucket). */
  refillPerSecond: number;
};

/** true se il chiamante ha credito e la richiesta puo' procedere. */
export function consumeToken(userId: string, opts: RateLimitOptions): boolean {
  const key = `${opts.scope}:${userId}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: opts.capacity, lastRefillMs: now };

  const elapsedSeconds = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSeconds * opts.refillPerSecond);
  bucket.lastRefillMs = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}
