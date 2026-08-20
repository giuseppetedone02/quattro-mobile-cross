import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { CRITERIA, CRITERION_META } from '@/theme/tokens';
import { axisEndpoints, diamondPath, type Scores } from '@/features/reviews/scoring';
import { formatScore } from '@/lib/format';
import { Text } from './Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type DiamondScale = 'micro' | 'compact' | 'hero';

const SIZES: Record<DiamondScale, number> = { micro: 28, compact: 72, hero: 240 };

export type DiamondProps = {
  scores: Scores;
  /** Seconda sagoma da sovrapporre (es. la tua recensione sopra la media
   *  del gruppo). Il disallineamento fra le due e' l'informazione piu'
   *  interessante della scheda luogo. */
  overlay?: Scores | null;
  scale?: DiamondScale;
  /** Forza una dimensione fuori dalle tre scale standard. */
  size?: number;
  showAxes?: boolean;
  showLabels?: boolean;
  animated?: boolean;
};

export function Diamond({
  scores,
  overlay = null,
  scale = 'compact',
  size,
  showAxes,
  showLabels = false,
  animated = true,
}: DiamondProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  const box = size ?? SIZES[scale];
  const pad = showLabels ? box * 0.16 : 0;
  const radius = (box - pad * 2) / 2;
  const axes = showAxes ?? scale !== 'micro';

  const targetPath = useMemo(() => diamondPath(scores, radius), [scores, radius]);
  const overlayPath = useMemo(
    () => (overlay ? diamondPath(overlay, radius) : null),
    [overlay, radius],
  );

  // I vertici si interpolano a ogni cambio punteggio. Con reduce-motion la
  // forma cambia di colpo invece di animarsi piu' lentamente.
  const animatedPath = useDerivedValue(() => {
    if (!animated || reduced) return targetPath;
    return withSpring(targetPath, { damping: 16, stiffness: 140 });
  }, [targetPath, animated, reduced]);

  const pathProps = useAnimatedProps(() => ({ d: animatedPath.value }));

  const overlayAnimated = useDerivedValue(() => {
    if (!overlayPath) return '';
    if (!animated || reduced) return overlayPath;
    return withTiming(overlayPath, { duration: 260 });
  }, [overlayPath, animated, reduced]);

  const overlayProps = useAnimatedProps(() => ({ d: overlayAnimated.value }));

  const a11y = CRITERIA.map(
    (c) => `${CRITERION_META[c].label} ${formatScore(scores[c])}`,
  ).join(', ');

  const endpoints = axisEndpoints(radius);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Punteggi: ${a11y}`}
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${box} ${box}`}>
        {axes ? (
          <G>
            {/* Anelli di riferimento a 1/3 e 2/3: danno la scala senza numeri */}
            <Circle
              cx={radius}
              cy={radius}
              r={radius * 0.66}
              stroke={theme.colors.borderSubtle}
              strokeWidth={1}
              fill="none"
            />
            <Circle
              cx={radius}
              cy={radius}
              r={radius * 0.33}
              stroke={theme.colors.borderSubtle}
              strokeWidth={1}
              fill="none"
            />
            {endpoints.map((p, i) => (
              <Line
                key={i}
                x1={radius}
                y1={radius}
                x2={p.x}
                y2={p.y}
                stroke={theme.colors.borderSubtle}
                strokeWidth={1}
              />
            ))}
          </G>
        ) : null}

        {/* Sagoma principale: la media del gruppo, riempita e tenue */}
        <AnimatedPath
          animatedProps={pathProps}
          fill={theme.colors.accentBase}
          fillOpacity={overlayPath ? 0.24 : scale === 'micro' ? 0.9 : 0.42}
          stroke={theme.colors.accentBase}
          strokeWidth={scale === 'micro' ? 1.2 : 2}
          strokeOpacity={overlayPath ? 0.5 : 1}
        />

        {/* Sovrapposizione: la tua recensione, solo contorno, colore pieno */}
        {overlayPath ? (
          <AnimatedPath
            animatedProps={overlayProps}
            fill="none"
            stroke={theme.colors.accentBase}
            strokeWidth={2.5}
            strokeDasharray={scale === 'hero' ? undefined : '4 3'}
          />
        ) : null}
      </Svg>

      {showLabels && scale === 'hero' ? <DiamondLabels box={box} /> : null}
    </View>
  );
}

/**
 * Etichette dei quattro criteri attorno al piatto hero, una per angolo --
 * coerenti con i vertici di diamondPoints(), ora anch'essi sugli angoli
 * (alto-destra, basso-destra, basso-sinistra, alto-sinistra) invece che sui
 * lati come nel vecchio rombo.
 */
function DiamondLabels({ box }: { box: number }) {
  const theme = useTheme();
  const positions = [
    { top: 0, right: 0, align: 'right' as const },
    { bottom: 0, right: 0, align: 'right' as const },
    { bottom: 0, left: 0, align: 'left' as const },
    { top: 0, left: 0, align: 'left' as const },
  ];

  return (
    <>
      {CRITERIA.map((criterion, i) => {
        const pos = positions[i]!;
        return (
          <View
            key={criterion}
            pointerEvents="none"
            style={{ position: 'absolute', ...pos }}
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              variant="label"
              uppercase
              align={pos.align}
              color={theme.criterionColor(criterion)}
            >
              {CRITERION_META[criterion].label}
            </Text>
          </View>
        );
      })}
    </>
  );
}
