import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { PALETTES, onScore } from './palettes';
import { elevationStyle, type Elevation, type ElevationStyle } from './shadows';
import {
  CRITERION_META,
  FONT_SIZES,
  RADII,
  SPACING,
  type ColorTokens,
  type Criterion,
  type PaletteFamily,
  type ThemeMode,
} from './tokens';
import { TEXT, FONTS } from './typography';

export type ThemePreference = 'system' | 'light' | 'dark';

export type Theme = {
  family: PaletteFamily;
  mode: ThemeMode;
  colors: ColorTokens;
  spacing: typeof SPACING;
  radii: typeof RADII;
  fontSizes: typeof FONT_SIZES;
  text: typeof TEXT;
  fonts: typeof FONTS;
  elevation: (level: Elevation) => ElevationStyle;
  /** Colore di un criterio nel tema corrente. */
  criterionColor: (c: Criterion) => string;
  /** Colore della scala sequenziale per un punteggio 1..10. */
  scoreColor: (score: number) => string;
  /** Testo leggibile sopra il colore di un punteggio. */
  onScoreColor: (score: number) => string;
};

const ThemeContext = createContext<Theme | null>(null);

export function buildTheme(family: PaletteFamily, preference: ThemePreference, systemDark: boolean): Theme {
  const palette = PALETTES[family];

  // Ogni famiglia, charcoal incluso, ha sia chiaro sia scuro: qui restiamo
  // generici (palette.light === null resterebbe comunque un fallback sicuro
  // se una futura famiglia fosse di nuovo solo scura).
  const wantsDark = preference === 'system' ? systemDark : preference === 'dark';
  const mode: ThemeMode = palette.light === null || wantsDark ? 'dark' : 'light';
  const colors = mode === 'dark' ? palette.dark : (palette.light as ColorTokens);

  const clampScore = (s: number) => Math.min(10, Math.max(1, Math.round(s)));

  return {
    family,
    mode,
    colors,
    spacing: SPACING,
    radii: RADII,
    fontSizes: FONT_SIZES,
    text: TEXT,
    fonts: FONTS,
    elevation: (level) => elevationStyle(level, mode, colors),
    criterionColor: (c) => colors[CRITERION_META[c].token] as string,
    scoreColor: (score) => colors.scoreScale[clampScore(score) - 1] as string,
    onScoreColor: (score) => onScore(colors.scoreScale[clampScore(score) - 1] as string),
  };
}

export function ThemeProvider({
  family,
  preference,
  children,
}: {
  family: PaletteFamily;
  preference: ThemePreference;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();
  const theme = useMemo(
    () => buildTheme(family, preference, systemScheme === 'dark'),
    [family, preference, systemScheme],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve essere usato dentro <ThemeProvider>');
  return ctx;
}
