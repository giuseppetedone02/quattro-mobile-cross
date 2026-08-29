import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { CRITERIA, CRITERION_META } from '@/theme/tokens';
import { axisEndpoints, diamondPoints, type Point, type Scores } from '@/features/reviews/scoring';
import { formatScore } from '@/lib/format';
import { Text } from './Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Punti -> array piatto [x0,y0,x1,y1,...], per poter interpolare le sole
 *  COORDINATE (numeri) in un worklet, mai il testo del path. */
function flatten(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/**
 * Costruisce il path SVG di un quadrilatero da 4 coppie di coordinate piatte,
 * interpolando "from" -> "to" in base a t (0..1). Gira in un worklet -- tutta
 * l'aritmetica e' inline (nessuna funzione helper separata da richiamare)
 * perche' un worklet che ne chiama un altro definito a parte si e' rivelato
 * fragile con l'attuale toolchain Reanimated/Hermes: il primo render
 * sincrono (initialUpdaterRun, eseguito lato JS prima che il runtime UI
 * esista) chiamava l'helper e otteneva "undefined is not a function". Con
 * tutto in un'unica funzione worklet quel problema non si pone.
 *
 * PERCHE' QUI E NON `withSpring(pathString)`: react-native-reanimated sa
 * interpolare numeri e colori, non stringhe SVG arbitrarie con piu' numeri
 * incorporati. La versione precedente passava l'intera stringa "M x y L x y
 * ... Z" a withSpring/withTiming: funzionava per variazioni piccole, ma con
 * un salto ampio del punteggio (es. da 1 a 10) l'interpolazione di stringa
 * poteva produrre un token corrotto ("MNaN ...") che il parser nativo di
 * react-native-svg non sa leggere e che fa crashare l'app Android con
 * IllegalArgumentException. Interpolando solo NUMERI, mai testo, quel modo
 * di fallire non esiste.
 */
function quadPath(from: number[], to: number[], t: number): string {
  'worklet';
  const x0 = Math.round(((from[0] as number) + ((to[0] as number) - (from[0] as number)) * t) * 100) / 100;
  const y0 = Math.round(((from[1] as number) + ((to[1] as number) - (from[1] as number)) * t) * 100) / 100;
  let d = `M ${x0} ${y0}`;
  for (let i = 2; i < to.length; i += 2) {
    const fx = from[i] as number;
    const fy = from[i + 1] as number;
    const tx = to[i] as number;
    const ty = to[i + 1] as number;
    const x = Math.round((fx + (tx - fx) * t) * 100) / 100;
    const y = Math.round((fy + (ty - fy) * t) * 100) / 100;
    d += ` L ${x} ${y}`;
  }
  return `${d} Z`;
}

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

  const targetFlat = useMemo(() => flatten(diamondPoints(scores, radius)), [scores, radius]);
  const overlayFlat = useMemo(
    () => (overlay ? flatten(diamondPoints(overlay, radius)) : null),
    [overlay, radius],
  );
  const hasOverlay = overlayFlat !== null;

  // I vertici si interpolano a ogni cambio punteggio, ma SOLO come numeri:
  // fromFlat/progress alimentano quadPath() dentro il worklet di
  // useAnimatedProps, che costruisce il testo del path un frame alla volta.
  // Nessuna stringa SVG attraversa mai withSpring/withTiming (vedi il
  // commento su quadPath per il motivo).
  const fromFlat = useSharedValue(targetFlat);
  const progress = useSharedValue(1);
  const prevTargetRef = useRef(targetFlat);

  useEffect(() => {
    if (prevTargetRef.current === targetFlat) return;
    if (!animated || reduced) {
      fromFlat.value = targetFlat;
      progress.value = 1;
    } else {
      fromFlat.value = prevTargetRef.current;
      progress.value = 0;
      progress.value = withSpring(1, { damping: 16, stiffness: 140 });
    }
    prevTargetRef.current = targetFlat;
  }, [targetFlat, animated, reduced, fromFlat, progress]);

  const pathProps = useAnimatedProps(() => ({
    d: quadPath(fromFlat.value, targetFlat, progress.value),
  }));

  const overlayFromFlat = useSharedValue(overlayFlat ?? targetFlat);
  const overlayProgress = useSharedValue(1);
  const prevOverlayRef = useRef(overlayFlat);

  useEffect(() => {
    if (!overlayFlat) {
      prevOverlayRef.current = null;
      return;
    }
    if (prevOverlayRef.current === overlayFlat) return;
    if (!animated || reduced || !prevOverlayRef.current) {
      overlayFromFlat.value = overlayFlat;
      overlayProgress.value = 1;
    } else {
      overlayFromFlat.value = prevOverlayRef.current;
      overlayProgress.value = 0;
      overlayProgress.value = withTiming(1, { duration: 260 });
    }
    prevOverlayRef.current = overlayFlat;
  }, [overlayFlat, animated, reduced, overlayFromFlat, overlayProgress]);

  const overlayProps = useAnimatedProps(() => ({
    d: overlayFlat ? quadPath(overlayFromFlat.value, overlayFlat, overlayProgress.value) : '',
  }));

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

        {/* Sagoma principale: la media del gruppo, riempita e tenue.
            strokeLinejoin="round" smussa gli angoli del contorno -- e' il
            dettaglio che fa leggere il quadrilatero come un piatto quadrato
            (angoli arrotondati, come una vera ceramica) invece che come una
            figura geometrica spigolosa. Il fill resta colorato per criterio
            di tema (non bianco fisso): sopra un fondo chiaro un piatto
            davvero bianco sparirebbe, e il colore e' anche l'unico modo in
            cui il Diamante comunica "quanto e' andata bene" a colpo
            d'occhio, prima ancora di leggere i numeri. */}
        <AnimatedPath
          animatedProps={pathProps}
          fill={theme.colors.accentBase}
          fillOpacity={hasOverlay ? 0.24 : scale === 'micro' ? 0.9 : 0.42}
          stroke={theme.colors.accentBase}
          strokeWidth={scale === 'micro' ? 1.2 : 2}
          strokeOpacity={hasOverlay ? 0.5 : 1}
          strokeLinejoin="round"
        />

        {/* Sovrapposizione: la tua recensione, solo contorno, colore pieno */}
        {hasOverlay ? (
          <AnimatedPath
            animatedProps={overlayProps}
            fill="none"
            stroke={theme.colors.accentBase}
            strokeWidth={2.5}
            strokeDasharray={scale === 'hero' ? undefined : '4 3'}
            strokeLinejoin="round"
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
