import { CRITERIA, type Criterion } from '@/theme/tokens';

export type Scores = Record<Criterion, number>;

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

export function clampScore(value: number): number {
  // NaN -> minimo (non c'e' una direzione sensata).
  // +/-Infinity -> l'estremo corrispondente, non il minimo: trattare
  // Infinity come 1 sarebbe un'inversione silenziosa del significato.
  if (Number.isNaN(value)) return MIN_SCORE;
  if (value === Infinity) return MAX_SCORE;
  if (value === -Infinity) return MIN_SCORE;
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(value)));
}

/**
 * Media dei quattro criteri. Deve corrispondere ESATTAMENTE alla colonna
 * generata di Postgres:
 *   (location + service + menu + value)::numeric / 4
 * Il server e' l'autorita: questa funzione serve solo per l'anteprima
 * ottimistica mentre l'utente vota.
 */
export function overallScore(scores: Scores): number {
  const sum = CRITERIA.reduce((acc, c) => acc + clampScore(scores[c]), 0);
  return sum / CRITERIA.length;
}

/** Arrotondamento a 2 decimali, come numeric(4,2) di Postgres. */
export function roundLikeDb(value: number): number {
  return Math.round(value * 100) / 100;
}

export type Point = { x: number; y: number };

/**
 * Vertici del Diamante: quattro assi da un centro, uno per criterio.
 * L'ordine e' fisso e orario partendo dall'alto -- Location in alto,
 * Servizio a destra, Menu in basso, Conto a sinistra -- perche' la forma
 * deve essere confrontabile tra un posto e l'altro.
 *
 * Il raggio minimo non e' zero: un posto votato tutto 1 deve comunque avere
 * una forma visibile, altrimenti sembra un dato mancante.
 */
export function diamondPoints(scores: Scores, radius: number, minRatio = 0.14): Point[] {
  const cx = radius;
  const cy = radius;
  // In alto, a destra, in basso, a sinistra
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

  return CRITERIA.map((criterion, i) => {
    const normalized = (clampScore(scores[criterion]) - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
    const r = radius * (minRatio + (1 - minRatio) * normalized);
    const angle = angles[i] as number;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

/** Path SVG chiuso dai vertici del diamante. */
export function diamondPath(scores: Scores, radius: number, minRatio = 0.14): string {
  const pts = diamondPoints(scores, radius, minRatio);
  if (pts.length === 0) return '';
  const [first, ...rest] = pts as [Point, ...Point[]];
  const body = rest.map((p) => `L ${round2(p.x)} ${round2(p.y)}`).join(' ');
  return `M ${round2(first.x)} ${round2(first.y)} ${body} Z`;
}

/** Estremi degli assi, per disegnare la griglia di riferimento. */
export function axisEndpoints(radius: number): Point[] {
  const cx = radius;
  const cy = radius;
  return [
    { x: cx, y: cy - radius },
    { x: cx + radius, y: cy },
    { x: cx, y: cy + radius },
    { x: cx - radius, y: cy },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quale criterio e' il piu' severo e quale il piu' generoso, su un insieme
 * di recensioni. Alimenta il pannello "I tuoi numeri" del profilo.
 * Restituisce null con zero recensioni, invece di un criterio arbitrario.
 */
export function criterionExtremes(reviews: Scores[]): {
  harshest: { criterion: Criterion; average: number };
  kindest: { criterion: Criterion; average: number };
} | null {
  if (reviews.length === 0) return null;

  const averages = CRITERIA.map((criterion) => ({
    criterion,
    average: reviews.reduce((acc, r) => acc + clampScore(r[criterion]), 0) / reviews.length,
  }));

  const sorted = [...averages].sort((a, b) => a.average - b.average);
  const harshest = sorted[0] as { criterion: Criterion; average: number };
  const kindest = sorted[sorted.length - 1] as { criterion: Criterion; average: number };
  return { harshest, kindest };
}
