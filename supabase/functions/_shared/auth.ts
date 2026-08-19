/**
 * Verifica dell'identita' del chiamante.
 *
 * Ogni funzione che spende soldi (Google Places) o invia email DEVE passare
 * da qui. Una Edge Function che accetta chiamate anonime non e' un proxy: e'
 * la chiave API di Google condivisa con Internet. Chi la trova la usa, e la
 * fattura arriva al proprietario del progetto.
 *
 * Il token viene verificato lato server con auth.getUser(): non basta
 * leggere il claim "sub" dal JWT, perche' un JWT non verificato lo si scrive
 * a mano.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Errore con codice HTTP, cosi' che ogni handler abbia un solo catch. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export type Caller = {
  /** id dell'utente in auth.users */
  userId: string;
  /** JWT originale, da riusare per i client che devono rispettare la RLS */
  jwt: string;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Variabile d'ambiente ${name} non configurata.`);
  return value;
}

/**
 * Client che agisce COME l'utente chiamante: la RLS si applica normalmente.
 * E' quello da usare per qualunque lettura o scrittura sui dati di dominio,
 * perche' delega il controllo di accesso alle policy invece di riscriverlo qui.
 */
export function userClient(jwt: string): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client con service-role key: IGNORA la RLS.
 *
 * Usarlo solo dove serve davvero, cioe' sulle tabelle che il client non deve
 * poter leggere (google_place_cache) e per le letture dei webhook, che non
 * hanno un utente. Ogni altro uso trasforma la funzione in un buco nella RLS.
 */
let cachedServiceClient: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  // Memoizzato: creare un client per chiamata riapre la connessione HTTP a
  // ogni richiesta, e l'istanza dell'Edge Function e' riusata fra invocazioni.
  if (!cachedServiceClient) {
    cachedServiceClient = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cachedServiceClient;
}

/**
 * Estrae e VERIFICA il JWT del chiamante. Solleva HttpError(401) se manca o
 * non e' valido.
 *
 * Nota: la anon key da sola arriva qui come Authorization valido a livello di
 * gateway, ma getUser() la rifiuta perche' non contiene un utente. E' il
 * motivo per cui il controllo non puo' essere "c'e' un header Authorization".
 */
export async function requireUser(req: Request): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new HttpError(401, 'Accesso non autorizzato.');

  const anon = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await anon.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Accesso non autorizzato.');

  return { userId: data.user.id, jwt };
}

/** Traduce un errore qualunque in una Response, senza far uscire stack trace. */
export function toErrorResponse(
  err: unknown,
  build: (status: number, message: string) => Response,
): Response {
  if (err instanceof HttpError) return build(err.status, err.message);
  console.error('errore non gestito', err);
  return build(500, 'Errore interno. Riprova.');
}
