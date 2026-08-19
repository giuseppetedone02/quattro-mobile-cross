import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { formatScore } from '@/lib/format';
import { Text } from './Text';

export type ScoreBadgeProps = {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
};

/** Punteggio in pill, colorato dalla scala sequenziale con testo leggibile. */
export function ScoreBadge({ score, size = 'md', style }: ScoreBadgeProps) {
  const theme = useTheme();
  const has = score != null && Number.isFinite(score);

  const dims = {
    sm: { h: 24, px: theme.spacing[2], variant: 'scoreSmall' as const },
    md: { h: 32, px: theme.spacing[3], variant: 'scoreSmall' as const },
    lg: { h: 44, px: theme.spacing[4], variant: 'score' as const },
  }[size];

  return (
    <View
      accessible
      accessibilityLabel={has ? `Punteggio ${formatScore(score)} su 10` : 'Nessun punteggio'}
      style={[
        {
          height: dims.h,
          paddingHorizontal: dims.px,
          borderRadius: theme.radii.full,
          backgroundColor: has ? theme.scoreColor(score) : theme.colors.bgRaised,
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: dims.h + 8,
        },
        style,
      ]}
    >
      <Text
        variant={dims.variant}
        color={has ? theme.onScoreColor(score) : theme.colors.textSecondary}
        style={size === 'lg' ? { fontSize: 22, lineHeight: 26 } : undefined}
      >
        {has ? formatScore(score) : '--'}
      </Text>
    </View>
  );
}
