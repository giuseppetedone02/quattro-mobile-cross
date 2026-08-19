import React from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/components/icons';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: ViewStyle;
  /** Sovrascrive l'etichetta letta dallo screen reader. */
  accessibilityLabel?: string;
};

const HEIGHTS: Record<ButtonSize, number> = { sm: 38, md: 48, lg: 56 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  full = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const bg =
    variant === 'primary'
      ? theme.colors.accentBase
      : variant === 'secondary'
        ? 'transparent'
        : variant === 'danger'
          ? 'transparent'
          : 'transparent';

  const border =
    variant === 'secondary'
      ? theme.colors.borderStrong
      : variant === 'danger'
        ? theme.colors.danger
        : 'transparent';

  const fg =
    variant === 'primary'
      ? theme.colors.textInverse
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.textPrimary;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={[
        {
          height: HEIGHTS[size],
          // Target minimo 44x44 anche quando il bottone e' visivamente piu' piccolo
          minWidth: 44,
          borderRadius: theme.radii.md,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1.5 : 0,
          borderColor: border,
          paddingHorizontal: size === 'sm' ? theme.spacing[3] : theme.spacing[5],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[2],
          opacity: inactive ? 0.5 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
          <Text
            variant={size === 'sm' ? 'caption' : 'bodyStrong'}
            color={fg}
            numberOfLines={1}
            style={{ fontFamily: theme.fonts.bodySemi }}
          >
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
        </>
      )}
    </PressScale>
  );
}

export type IconButtonProps = {
  icon: IconName;
  /** OBBLIGATORIO: un bottone con sola icona senza etichetta e' muto per uno
   *  screen reader. E' il difetto di WantABook che qui il tipo impedisce. */
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  variant?: 'plain' | 'filled';
  style?: ViewStyle;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 44,
  color,
  disabled,
  variant = 'plain',
  style,
}: IconButtonProps) {
  const theme = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[
        {
          width: Math.max(44, size),
          height: Math.max(44, size),
          borderRadius: theme.radii.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: variant === 'filled' ? theme.colors.bgRaised : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style as ViewStyle,
      ]}
    >
      <View pointerEvents="none">
        <Icon name={icon} size={size > 44 ? 24 : 22} color={color ?? theme.colors.textPrimary} />
      </View>
    </PressScale>
  );
}
