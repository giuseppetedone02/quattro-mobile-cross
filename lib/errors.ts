import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Eredita diretta di FileService.FriendlyErrorFor di WantABook: i codici
 * Postgres diventano messaggi italiani che dicono all'utente cosa fare,
 * invece di "Errore 23505".
 */
const BY_CODE: Record<string, string> = {
  '23505': 'Esiste gia. Controlla se lo hai gia inserito.',
  '23503': 'Riferimento non valido: qualcosa e stato rimosso mentre lo modificavi.',
  '23514': 'Uno dei valori inseriti non e ammesso.',
  '42501': 'Non hai i permessi per farlo.',
  P0002: 'Non trovato.',
  '22023': 'Operazione non consentita in questo momento.',
  PGRST116: 'Non trovato.',
};

/** Messaggi specifici per contesto, piu' utili di quelli generici per codice. */
const BY_CONTEXT: Record<string, Record<string, string>> = {
  reviews: {
    '23505': 'Hai gia recensito questo posto in questo gruppo. Modifica la recensione esistente.',
    '42501': 'Non fai piu parte di questo gruppo.',
    '23503': 'Questo posto non e piu presente nel gruppo.',
  },
  groups: {
    '23505': 'Hai gia un gruppo personale.',
    '42501': 'Solo gli amministratori del gruppo possono farlo.',
  },
  group_members: {
    '42501': 'Solo gli amministratori possono gestire i membri.',
  },
  profiles: {
    '23505': 'Questo username e gia in uso.',
    '23514': "L'username puo contenere solo lettere minuscole, numeri, punto e underscore (3-20 caratteri).",
  },
  places: {
    '23505': 'Questo posto e gia stato aggiunto.',
  },
};

export type AppError = { message: string; code?: string; retryable: boolean };

function isPostgrestError(e: unknown): e is PostgrestError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

export function friendlyError(e: unknown, context?: string): AppError {
  if (isPostgrestError(e)) {
    const code = e.code;
    const contextual = context ? BY_CONTEXT[context]?.[code] : undefined;
    return {
      message: contextual ?? BY_CODE[code] ?? messageFromRaise(e.message) ?? 'Qualcosa non ha funzionato.',
      code,
      retryable: false,
    };
  }

  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    if (m.includes('network') || m.includes('fetch failed') || m.includes('timeout')) {
      return {
        message: 'Nessuna connessione. Le modifiche verranno inviate quando torni online.',
        retryable: true,
      };
    }
    if (m.includes('jwt') || m.includes('token')) {
      return { message: 'Sessione scaduta. Accedi di nuovo.', retryable: false };
    }
    return { message: e.message, retryable: false };
  }

  return { message: 'Qualcosa non ha funzionato.', retryable: false };
}

/**
 * Le RPC del progetto usano RAISE EXCEPTION con messaggi in italiano gia
 * pensati per l'utente (es. "solo gli amministratori possono invitare").
 * Se il messaggio non contiene gergo Postgres, si mostra cosi' com'e'.
 */
function messageFromRaise(raw: string): string | undefined {
  const jargon = ['relation', 'column', 'violates', 'constraint', 'syntax', 'operator', 'function'];
  const lower = raw.toLowerCase();
  if (jargon.some((j) => lower.includes(j))) return undefined;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
