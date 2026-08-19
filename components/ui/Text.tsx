import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { TEXT } from '@/theme/typography';

type Variant = keyof typeof TEXT;
type ColorKey = 'primary' | 'secondary' | 'inverse' | 'accent' | 'danger' | 'success';

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: ColorKey | string;
  align?: TextStyle['textAlign'];
  /** Solo per le label: MAIUSCOLO con spaziatura. */
  uppercase?: boolean;
};

export function Text({
  variant = 'body',
  color = 'primary',
  align,
  uppercase,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const resolved =
    color === 'primary'
      ? theme.colors.textPrimary
      : color === 'secondary'
        ? theme.colors.textSecondary
        : color === 'inverse'
          ? theme.colors.textInverse
          : color === 'accent'
            ? theme.colors.accentBase
            : color === 'danger'
              ? theme.colors.danger
              : color === 'success'
                ? theme.colors.success
                : color;

  return (
    <RNText
      // allowFontScaling resta attivo: i layout sono testati al 200%.
      style={[
        theme.text[variant],
        { color: resolved },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
      {...rest}
    />
  );
}
