import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/components/icons';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Colore di accento specifico (es. il colore di un criterio). */
  tint?: string;
  leading?: React.ReactNode;
  style?: ViewStyle;
};

export function Chip({ label, selected = false, onPress, icon, tint, leading, style }: ChipProps) {
  const theme = useTheme();
  const accent = tint ?? theme.colors.accentBase;

  return (
    <PressScale
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      scaleTo={onPress ? 0.96 : 1}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          height: 38,
          paddingHorizontal: theme.spacing[3],
          borderRadius: theme.radii.full,
          borderWidth: 1.5,
          borderColor: selected ? accent : theme.colors.borderSubtle,
          backgroundColor: selected ? theme.colors.accentMuted : theme.colors.bgSurface,
        },
        style as ViewStyle,
      ]}
    >
      {leading}
      {icon ? (
        <View pointerEvents="none">
          <Icon name={icon} size={16} color={selected ? accent : theme.colors.textSecondary} />
        </View>
      ) : null}
      <Text
        variant="caption"
        color={selected ? accent : 'secondary'}
        numberOfLines={1}
        style={{ fontFamily: theme.fonts.bodyMedium }}
      >
        {label}
      </Text>
    </PressScale>
  );
}
