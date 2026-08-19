/**
 * CORS e costruzione delle risposte, condivisi da tutte le Edge Function.
 *
 * L'app mobile non ha origine e non fa preflight, ma le stesse funzioni
 * vengono chiamate anche dal browser (test manuali, pagina web di fallback
 * degli inviti), e senza risposta all'OPTIONS il browser non invia nemmeno la
 * richiesta vera.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Risponde al preflight. Restituisce null se non e' un OPTIONS. */
export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Errore in formato uniforme. Il messaggio e' pensato per essere mostrato
 * all'utente, quindi non contiene mai dettagli dell'infrastruttura: un errore
 * di Google o di Resend viene loggato e riassunto, non inoltrato.
 */
export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}
