import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { Elevation } from '@/theme/shadows';
import { PressScale } from './Pressable';

export type CardProps = {
  children: React.ReactNode;
  elevation?: Elevation;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
  style?: ViewStyle;
};

export function Card({
  children,
  elevation = 1,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padded = true,
  style,
}: CardProps) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.colors.bgSurface,
    borderRadius: theme.radii.lg,
    padding: padded ? theme.spacing[4] : 0,
    ...theme.elevation(elevation),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={[base, style as ViewStyle]}
    >
      {children}
    </PressScale>
  );
}
