/**
 * Token semantici — l'UNICA fonte di verita per i colori.
 *
 * I componenti conoscono solo questi nomi, mai un valore. Le palette in
 * theme/palettes/ assegnano i valori. Questo chiude il difetto di WantABook,
 * dove le palette esistevano sia nei dizionari XAML sia in ThemeManager.Palette()
 * e un tema (Viola chiaro) esisteva in uno e non nell'altro.
 */

export type ColorTokens = {
  /** Fondo della schermata */
  bgCanvas: string;
  /** Fondo di una superficie sopra il canvas (card, sheet) */
  bgSurface: string;
  /** Superficie ulteriormente sollevata (input, chip attivo) */
  bgRaised: string;
  /** Velo sotto un overlay modale */
  bgOverlay: string;

  borderSubtle: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  /** Testo su fondo accento */
  textInverse: string;

  accentBase: string;
  accentMuted: string;
  accentContrast: string;

  success: string;
  warning: string;
  danger: string;

  /** I quattro criteri. Costanti in tutta l'app: assi del diamante, barre,
   *  icone, slider. Luminanze separate per restare leggibili in scala di
   *  grigi e con deuteranopia. */
  criterionLocation: string;
  criterionService: string;
  criterionMenu: string;
  criterionValue: string;

  /** Scala sequenziale a 10 passi per i punteggi 1..10.
   *  Non un semaforo rosso/verde: un 6 non e' un fallimento. */
  scoreScale: readonly [
    string, string, string, string, string,
    string, string, string, string, string,
  ];
};

export type ThemeMode = 'light' | 'dark';

export type PaletteFamily = 'charcoal' | 'sunset' | 'ocean' | 'forest' | 'plum';

export type Palette = {
  family: PaletteFamily;
  label: string;
  /** null solo se una famiglia esistesse in una sola modalita': oggi tutte,
   *  charcoal incluso (il tema ad alto contrasto), hanno chiaro e scuro. */
  light: ColorTokens | null;
  dark: ColorTokens;
};

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const RADII = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 44,
} as const;

export const CRITERIA = ['location', 'service', 'menu', 'value'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Etichette e micro-copy dei quattro criteri, dal requisito 4 del piano. */
export const CRITERION_META: Record<
  Criterion,
  { label: string; question: string; hint: string; token: keyof ColorTokens }
> = {
  location: {
    label: 'Location',
    question: "Com'era il posto?",
    hint: 'Arredo, atmosfera, pulizia, comodita',
    token: 'criterionLocation',
  },
  service: {
    label: 'Servizio',
    question: 'Come sono stati i camerieri?',
    hint: 'Cortesia, attenzione, tempi di attesa',
    token: 'criterionService',
  },
  menu: {
    label: 'Menu',
    question: "Com'era il menu?",
    hint: 'Varieta, presentazione, coerenza col posto',
    token: 'criterionMenu',
  },
  value: {
    label: 'Conto',
    question: 'Quanto ti e sembrato il conto?',
    hint: 'Il totale speso rispetto a quello che hai avuto',
    token: 'criterionValue',
  },
};

/** Etichetta testuale per un voto 1..10. Usata sotto lo ScoreDial e negli
 *  accessibilityLabel, perche' il numero da solo dice poco a chi ascolta. */
export function scoreLabel(score: number): string {
  const labels = [
    'Da evitare', 'Molto scarso', 'Scarso', 'Mediocre', 'Cosi cosi',
    'Discreto', 'Buono', 'Molto buono', 'Ottimo', 'Perfetto',
  ] as const;
  const idx = Math.min(10, Math.max(1, Math.round(score))) - 1;
  return labels[idx] ?? '';
}
