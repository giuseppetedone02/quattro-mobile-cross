import type { ColorTokens, ThemeMode } from './tokens';

/**
 * Quattro livelli di elevazione. Su tema scuro l'ombra non si vede: si usa
 * un bordo piu' chiaro al suo posto. Questo e' il tipo di adattamento che
 * WantABook risolveva a mano nei singoli XAML.
 */
export type Elevation = 0 | 1 | 2 | 3;

export type ElevationStyle = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
  borderWidth?: number;
  borderColor?: string;
};

export function elevationStyle(
  level: Elevation,
  mode: ThemeMode,
  colors: ColorTokens,
): ElevationStyle {
  if (level === 0) {
    return {
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    };
  }

  if (mode === 'dark') {
    // Nel buio un'ombra non comunica sollevamento: lo comunica un bordo.
    return {
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
      borderWidth: 1,
      borderColor: level >= 2 ? colors.borderStrong : colors.borderSubtle,
    };
  }

  const spec = {
    1: { opacity: 0.06, radius: 6, dy: 2, native: 2 },
    2: { opacity: 0.1, radius: 14, dy: 5, native: 5 },
    3: { opacity: 0.14, radius: 26, dy: 10, native: 10 },
  }[level];

  return {
    shadowColor: '#000000',
    shadowOpacity: spec.opacity,
    shadowRadius: spec.radius,
    shadowOffset: { width: 0, height: spec.dy },
    elevation: spec.native,
  };
}
