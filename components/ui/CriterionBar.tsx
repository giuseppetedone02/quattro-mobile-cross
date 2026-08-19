import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { CRITERION_META, type Criterion } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/icons';
import { MAX_SCORE } from '@/features/reviews/scoring';
import { formatScore } from '@/lib/format';
import { Text } from './Text';

const CRITERION_ICON: Record<Criterion, IconName> = {
  location: 'location',
  service: 'service',
  menu: 'menu',
  value: 'receipt',
};

export type CriterionBarProps = {
  criterion: Criterion;
  value: number | null | undefined;
  /** Valore di confronto (es. la tua recensione contro la media). */
  compare?: number | null;
};

export function CriterionBar({ criterion, value, compare }: CriterionBarProps) {
  const theme = useTheme();
  const color = theme.criterionColor(criterion);
  const meta = CRITERION_META[criterion];
  const pct = value != null && Number.isFinite(value) ? (value / MAX_SCORE) * 100 : 0;
  const comparePct = compare != null && Number.isFinite(compare) ? (compare / MAX_SCORE) * 100 : null;

  return (
    <View
      accessible
      accessibilityLabel={
        `${meta.label}: ${formatScore(value)} su 10` +
        (compare != null ? `, tuo voto ${formatScore(compare)}` : '')
      }
      style={{ gap: theme.spacing[2] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Icon name={CRITERION_ICON[criterion]} size={16} color={color} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          {meta.label}
        </Text>
        <Text variant="scoreSmall" color={color}>
          {formatScore(value)}
        </Text>
      </View>

      <View
        style={{
          height: 8,
          borderRadius: theme.radii.full,
          backgroundColor: theme.colors.bgRaised,
          overflow: 'visible',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            height: 8,
            width: `${pct}%`,
            borderRadius: theme.radii.full,
            backgroundColor: color,
          }}
        />
        {comparePct != null ? (
          // Tacca verticale: dove sta il tuo voto rispetto alla media
          <View
            style={{
              position: 'absolute',
              left: `${comparePct}%`,
              width: 3,
              height: 16,
              marginLeft: -1.5,
              borderRadius: 2,
              backgroundColor: theme.colors.textPrimary,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
