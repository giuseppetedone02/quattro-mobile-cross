import { z } from 'zod';
import { CRITERIA, type Criterion } from '@/theme/tokens';
import { MAX_SCORE, MIN_SCORE } from '@/features/reviews/scoring';

/**
 * I limiti ricalcano i CHECK di public.reviews:
 *   score_* between 1 and 10
 *   bill_total_cents between 0 and 10000000
 *   party_size between 1 and 50
 *   comment <= 2000, visited_on <= current_date
 */
export const COMMENT_MAX = 2000;
export const BILL_MAX_CENTS = 10_000_000;
export const PARTY_MIN = 1;
export const PARTY_MAX = 50;

export type ReviewPhotoDraft = {
  id: string;
  uri: string;
  width: number;
  height: number;
};

export type ReviewFormValues = {
  scores: Record<Criterion, number>;
  /** Facoltativo: il voto e' il criterio, l'importo e' solo un promemoria. */
  billTotalCents: number | null;
  partySize: number | null;
  comment: string;
  /** ISO yyyy-mm-dd, oppure null. */
  visitedOn: string | null;
  photos: ReviewPhotoDraft[];
};

const scoreSchema = z.number().int().min(MIN_SCORE).max(MAX_SCORE);

export const reviewFormSchema = z.object({
  scores: z.object({
    location: scoreSchema,
    service: scoreSchema,
    menu: scoreSchema,
    value: scoreSchema,
  }),
  billTotalCents: z.number().int().min(0).max(BILL_MAX_CENTS).nullable(),
  partySize: z.number().int().min(PARTY_MIN).max(PARTY_MAX).nullable(),
  comment: z.string().trim().max(COMMENT_MAX, `Massimo ${COMMENT_MAX} caratteri.`),
  visitedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida.')
    .nullable(),
});

/** Voto di partenza: 7 e non 1 ne' 10. Un cursore che parte dal minimo
 *  suggerisce un giudizio che l'utente non ha dato. */
export const DEFAULT_SCORE = 7;

/** Valore usato per i criteri non ancora votati quando si disegna il
 *  diamante in costruzione: la forma cresce invece di apparire tutta. */
export const NEUTRAL_SCORE = 5;

export function emptyReviewForm(): ReviewFormValues {
  return {
    scores: {
      location: DEFAULT_SCORE,
      service: DEFAULT_SCORE,
      menu: DEFAULT_SCORE,
      value: DEFAULT_SCORE,
    },
    billTotalCents: null,
    partySize: null,
    comment: '',
    visitedOn: null,
    photos: [],
  };
}

/**
 * Diamante progressivo: i criteri gia' votati portano il loro voto, gli altri
 * un valore neutro. `answered` e' il numero di passi completati.
 */
export function progressiveScores(
  scores: Record<Criterion, number>,
  answered: number,
): Record<Criterion, number> {
  const result = { ...scores };
  CRITERIA.forEach((criterion, index) => {
    if (index >= answered) result[criterion] = NEUTRAL_SCORE;
  });
  return result;
}

/**
 * "12,50" -> 1250. Accetta virgola o punto e ignora simboli di valuta.
 * Restituisce null quando il campo e' vuoto o illeggibile: il chiamante
 * distingue i due casi con isBlank().
 */
export function parseAmountToCents(raw: string): number | null {
  const clean = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  if (clean === '' || clean === '.') return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  return cents > BILL_MAX_CENTS ? null : cents;
}

export function parsePartySize(raw: string): number | null {
  const clean = raw.replace(/[^\d]/g, '');
  if (clean === '') return null;
  const value = Number(clean);
  if (!Number.isInteger(value) || value < PARTY_MIN || value > PARTY_MAX) return null;
  return value;
}

export function isBlank(raw: string): boolean {
  return raw.trim().length === 0;
}

/** "12/03/2026" -> "2026-03-12". Null se la data non esiste o e' futura. */
export function parseItalianDate(raw: string, today: Date = new Date()): string | null {
  const match = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Il costruttore Date normalizza il 31 febbraio: il confronto lo smaschera.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  if (date.getTime() > endOfToday.getTime()) return null;
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-03-12" -> "12/03/2026", per riempire il campo in modifica. */
export function formatItalianDate(iso: string | null): string {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export type ReviewFieldErrors = Partial<Record<'bill' | 'party' | 'comment' | 'visitedOn', string>>;

export function amountFieldError(raw: string): string | null {
  if (isBlank(raw)) return null;
  return parseAmountToCents(raw) == null ? 'Importo non valido.' : null;
}

export function partyFieldError(raw: string): string | null {
  if (isBlank(raw)) return null;
  return parsePartySize(raw) == null ? `Da ${PARTY_MIN} a ${PARTY_MAX} persone.` : null;
}

export function dateFieldError(raw: string): string | null {
  if (isBlank(raw)) return null;
  return parseItalianDate(raw) == null ? 'Usa il formato GG/MM/AAAA, non nel futuro.' : null;
}

export function commentFieldError(raw: string): string | null {
  return raw.trim().length > COMMENT_MAX ? `Massimo ${COMMENT_MAX} caratteri.` : null;
}
