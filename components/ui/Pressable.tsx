import React, { useCallback } from 'react';
import { Pressable as RNPressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export type PressScaleProps = PressableProps & {
  /** Quanto scala alla pressione. 1 disabilita l'effetto. */
  scaleTo?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
};

/**
 * Superficie premibile con feedback di scala. Rispetta reduce-motion:
 * con l'impostazione attiva l'animazione non parte affatto, invece di
 * partire piu' lenta.
 */
export function PressScale({
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();

  const handleIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      if (!reduced) scale.set(withSpring(scaleTo, { damping: 18, stiffness: 320 }));
      onPressIn?.(e);
    },
    [onPressIn, reduced, scale, scaleTo],
  );

  const handleOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      if (!reduced) scale.set(withSpring(1, { damping: 18, stiffness: 320 }));
      onPressOut?.(e);
    },
    [onPressOut, reduced, scale],
  );

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[style as ViewStyle, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
