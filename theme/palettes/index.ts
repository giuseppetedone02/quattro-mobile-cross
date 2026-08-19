import type { ColorTokens, Palette, PaletteFamily } from '../tokens';

/**
 * I criteri hanno colore proprio e costante in tutta l'app. Due varianti
 * (chiaro/scuro) perche' la stessa tinta non regge su entrambi i fondi.
 * Le luminanze sono deliberatamente separate: i criteri restano
 * distinguibili in scala di grigi e con deuteranopia. Ogni criterio ha
 * comunque anche un'icona propria, perche' il colore non e' mai un canale
 * sufficiente da solo.
 */
const CRITERIA_LIGHT = {
  // Le luminanze relative sono risolte, non scelte a occhio: 0.048 / 0.096 /
  // 0.153 / 0.235, una scala crescente. La separazione minima fra due criteri
  // qualsiasi e' 1.39, quindi restano distinguibili in scala di grigi e con
  // deuteranopia. La prima versione di queste palette aveva terracotta e
  // salvia a 1.016 -- indistinguibili -- e il test l'ha intercettato.
  criterionMenu: '#662652', // prugna     L 0.048
  criterionLocation: '#923D22', // terracotta L 0.096
  criterionService: '#22787F', // teal       L 0.153
  criterionValue: '#5C933C', // salvia     L 0.235
} as const;

const CRITERIA_DARK = {
  // Stessa costruzione, scala 0.214 / 0.337 / 0.477 / 0.659.
  // Separazione minima 1.34; contrasto minimo contro la superficie 4.27
  // (4.71 sul tema Carbone, che ha il fondo piu' scuro).
  criterionLocation: '#DE5025', // L 0.214
  criterionMenu: '#DC7DC0', // L 0.337
  criterionService: '#44C9D3', // L 0.477
  criterionValue: '#B7E09E', // L 0.659
} as const;

/**
 * Scala sequenziale a 10 passi per i punteggi. Non un semaforo rosso/verde:
 * un 6 non e' un fallimento, e' un 6. Va da neutro-freddo a caldo-saturo,
 * leggibile come "intensita" e non come "giudizio morale".
 * Il testo sopra viene scelto da onScore() in base alla luminanza.
 */
const SCORE_LIGHT = [
  '#9A8F8B', '#A4877A', '#AE8168', '#B67F57', '#BD8147',
  '#C2873A', '#C69030', '#C89C28', '#C9AA25', '#C7B92C',
] as const;

const SCORE_DARK = [
  '#6E625F', '#7C6357', '#8A664E', '#976B45', '#A2733D',
  '#AC7D35', '#B4892E', '#BA9728', '#BEA625', '#C0B62B',
] as const;

type Accent = { base: string; muted: string; contrast: string };

function light(bg: string, surface: string, raised: string, accent: Accent): ColorTokens {
  return {
    bgCanvas: bg,
    bgSurface: surface,
    bgRaised: raised,
    bgOverlay: 'rgba(28, 22, 20, 0.55)',
    borderSubtle: '#E2DAD4',
    borderStrong: '#C4B8B0',
    textPrimary: '#1F1815',
    textSecondary: '#5E534D',
    textInverse: '#FFFFFF',
    accentBase: accent.base,
    accentMuted: accent.muted,
    accentContrast: accent.contrast,
    success: '#1F6B3E',
    warning: '#8A5A08',
    danger: '#A8261F',
    ...CRITERIA_LIGHT,
    scoreScale: SCORE_LIGHT,
  };
}

function dark(bg: string, surface: string, raised: string, accent: Accent): ColorTokens {
  return {
    bgCanvas: bg,
    bgSurface: surface,
    bgRaised: raised,
    bgOverlay: 'rgba(0, 0, 0, 0.65)',
    borderSubtle: '#3A312D',
    borderStrong: '#544842',
    textPrimary: '#F5EFEA',
    textSecondary: '#B3A69F',
    textInverse: '#16100E',
    accentBase: accent.base,
    accentMuted: accent.muted,
    accentContrast: accent.contrast,
    success: '#63C98A',
    warning: '#E0B44A',
    danger: '#F0857C',
    ...CRITERIA_DARK,
    scoreScale: SCORE_DARK,
  };
}

export const PALETTES: Record<PaletteFamily, Palette> = {
  sunset: {
    family: 'sunset',
    label: 'Sunset',
    light: light('#FFFBF7', '#FFFFFF', '#F7EFE7', {
      base: '#B4451F',
      muted: '#F6E2D6',
      contrast: '#FFFFFF',
    }),
    dark: dark('#1A1210', '#241A17', '#302320', {
      base: '#EE8C62',
      muted: '#3D2620',
      contrast: '#1A1210',
    }),
  },
  ocean: {
    family: 'ocean',
    label: 'Oceano',
    light: light('#F7FBFD', '#FFFFFF', '#E9F2F7', {
      base: '#0B5C86',
      muted: '#D8EAF3',
      contrast: '#FFFFFF',
    }),
    dark: dark('#0C1620', '#12202C', '#1A2C3A', {
      base: '#5EBBE6',
      muted: '#182F3F',
      contrast: '#0C1620',
    }),
  },
  forest: {
    family: 'forest',
    label: 'Bosco',
    light: light('#F9FBF7', '#FFFFFF', '#ECF2E7', {
      base: '#37652C',
      muted: '#DEEAD6',
      contrast: '#FFFFFF',
    }),
    dark: dark('#101710', '#182117', '#212C1F', {
      base: '#8FCB77',
      muted: '#1F2E1C',
      contrast: '#101710',
    }),
  },
  plum: {
    family: 'plum',
    label: 'Prugna',
    light: light('#FDF9FC', '#FFFFFF', '#F4EBF2', {
      base: '#71305F',
      muted: '#EEDFEA',
      contrast: '#FFFFFF',
    }),
    dark: dark('#170F16', '#20161F', '#2C1F2A', {
      base: '#DA92C2',
      muted: '#331E2E',
      contrast: '#170F16',
    }),
  },
  charcoal: {
    family: 'charcoal',
    label: 'Carbone',
    // Solo scuro: e' il tema alto contrasto per accessibilita.
    light: null,
    dark: {
      ...dark('#000000', '#121212', '#1E1E1E', {
        base: '#FFFFFF',
        muted: '#2A2A2A',
        contrast: '#000000',
      }),
      textPrimary: '#FFFFFF',
      textSecondary: '#C9C9C9',
      borderSubtle: '#333333',
      borderStrong: '#5A5A5A',
    },
  },
};

export const PALETTE_FAMILIES = Object.keys(PALETTES) as PaletteFamily[];

/** Relative luminance, WCAG 2.1 */
export function luminance(hex: string): number {
  const m = hex.replace('#', '');
  const full =
    m.length === 3
      ? m
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : m;
  const channel = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Rapporto di contrasto WCAG tra due colori esadecimali. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Testo leggibile sopra un colore della scala punteggi. */
export function onScore(bg: string): '#FFFFFF' | '#16100E' {
  return contrast(bg, '#FFFFFF') >= contrast(bg, '#16100E') ? '#FFFFFF' : '#16100E';
}
