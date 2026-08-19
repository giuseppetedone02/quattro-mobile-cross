import { FONT_SIZES } from './tokens';

/**
 * Fraunces per il display (serif variabile con carattere, giusto per il cibo),
 * Inter per la UI. Le cifre sono TABULARI sui punteggi: senza, una lista di
 * "7.5 / 8.0 / 10.0" balla orizzontalmente a ogni aggiornamento.
 */
export const FONTS = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

type TextStyleSpec = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  fontVariant?: ('tabular-nums' | 'lining-nums')[];
};

export const TEXT: Record<
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'score'
  | 'scoreSmall',
  TextStyleSpec
> = {
  display: {
    fontFamily: FONTS.displayBold,
    fontSize: FONT_SIZES.display,
    lineHeight: 48,
    letterSpacing: -1,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: FONT_SIZES.xxl,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: FONTS.display,
    fontSize: FONT_SIZES.xl,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  subheading: { fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.lg, lineHeight: 26 },
  body: { fontFamily: FONTS.body, fontSize: FONT_SIZES.base, lineHeight: 24 },
  bodyStrong: { fontFamily: FONTS.bodyMedium, fontSize: FONT_SIZES.base, lineHeight: 24 },
  caption: { fontFamily: FONTS.body, fontSize: FONT_SIZES.sm, lineHeight: 20 },
  label: {
    fontFamily: FONTS.bodySemi,
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  score: {
    fontFamily: FONTS.displayBold,
    fontSize: FONT_SIZES.xxl,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  scoreSmall: {
    fontFamily: FONTS.bodyBold,
    fontSize: FONT_SIZES.sm,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
};
