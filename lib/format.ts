/** Formattazione localizzata it-IT. Tutta qui, così i test la coprono una volta. */

const EUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_CENTS = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Importo da centesimi. Mostra i decimali solo se non sono zero. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '--';
  return cents % 100 === 0 ? EUR.format(cents / 100) : EUR_CENTS.format(cents / 100);
}

/**
 * Costo a persona. Restituisce null quando non calcolabile, invece di 0 o
 * Infinity: e' il caso degenere che una divisione ingenua sbaglia.
 */
export function costPerPerson(
  totalCents: number | null | undefined,
  partySize: number | null | undefined,
): number | null {
  if (totalCents == null || partySize == null) return null;
  if (!Number.isFinite(totalCents) || !Number.isFinite(partySize)) return null;
  if (partySize <= 0) return null;
  return Math.round(totalCents / partySize);
}

/** Punteggio con un decimale, virgola come separatore. 7 -> "7,0" */
export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '--';
  return score.toFixed(1).replace('.', ',');
}

const DATE_LONG = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

export function formatDate(iso: string | null | undefined, style: 'long' | 'short' = 'short'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (style === 'long' ? DATE_LONG : DATE_SHORT).format(d);
}

/** "oggi", "ieri", "3 giorni fa", poi la data. */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (days === 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days > 1 && days < 7) return `${days} giorni fa`;
  return formatDate(iso, 'short');
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Iniziali per l'avatar di fallback. "Giuseppe Tedone" -> "GT" */
export function initials(name: string | null | undefined, fallback = '?'): string {
  const clean = (name ?? '').trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  const result = (first + second).toUpperCase();
  return result || fallback;
}

/** Colore deterministico per l'avatar di fallback, dallo stesso id. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
