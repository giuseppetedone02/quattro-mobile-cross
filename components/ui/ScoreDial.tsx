import React, { useCallback } from 'react';
import { View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { CRITERION_META, scoreLabel, type Criterion } from '@/theme/tokens';
import { MAX_SCORE, MIN_SCORE, clampScore } from '@/features/reviews/scoring';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type ScoreDialProps = {
  criterion: Criterion;
  value: number;
  onChange: (value: number) => void;
  style?: ViewStyle;
};

/**
 * Input del voto 1..10: dieci tacche premibili, con haptic a ogni cambio e
 * colore che segue la scala sequenziale.
 *
 * Sull'accessibilita: l'intero controllo espone role="adjustable" con
 * accessibilityValue e onAccessibilityAction, cosi' con TalkBack/VoiceOver si
 * regola con le frecce e l'annuncio e' "Location, 7 su 10, Buono" -- non
 * "bottone, bottone, bottone" dieci volte.
 */
export function ScoreDial({ criterion, value, onChange, style }: ScoreDialProps) {
  const theme = useTheme();
  const meta = CRITERION_META[criterion];
  const current = clampScore(value);

  const set = useCallback(
    (next: number) => {
      const clamped = clampScore(next);
      if (clamped === current) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(clamped);
    },
    [current, onChange],
  );

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={meta.label}
      accessibilityValue={{
        min: MIN_SCORE,
        max: MAX_SCORE,
        now: current,
        text: `${current} su ${MAX_SCORE}, ${scoreLabel(current)}`,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') set(current + 1);
        if (e.nativeEvent.actionName === 'decrement') set(current - 1);
      }}
      style={[{ gap: theme.spacing[3] }, style]}
    >
      <View
        style={{ flexDirection: 'row', gap: theme.spacing[1], justifyContent: 'space-between' }}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: MAX_SCORE }, (_, i) => i + 1).map((tick) => {
          const active = tick <= current;
          const isCurrent = tick === current;
          return (
            <PressScale
              key={tick}
              onPress={() => set(tick)}
              scaleTo={0.9}
              // Target reale 44px in altezza anche se la tacca e' sottile
              hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
              style={{
                flex: 1,
                height: isCurrent ? 52 : 40,
                alignSelf: 'flex-end',
                borderRadius: theme.radii.sm,
                backgroundColor: active ? theme.scoreColor(current) : theme.colors.bgRaised,
                borderWidth: isCurrent ? 2 : 0,
                borderColor: theme.criterionColor(criterion),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isCurrent ? (
                <Text variant="scoreSmall" color={theme.onScoreColor(current)}>
                  {tick}
                </Text>
              ) : null}
            </PressScale>
          );
        })}
      </View>

      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="caption" color="secondary">
          {scoreLabel(current)}
        </Text>
        <Text variant="score" color={theme.criterionColor(criterion)}>
          {current}
        </Text>
      </View>
    </View>
  );
}
