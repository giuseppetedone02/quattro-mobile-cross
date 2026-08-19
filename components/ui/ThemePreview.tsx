import React from 'react';
import { View } from 'react-native';
import { PALETTES, useTheme, type PaletteFamily, type ThemeMode } from '@/theme';
import { PressScale } from './Pressable';
import { Text } from './Text';
import { Icon } from '@/components/icons';

export type ThemePreviewProps = {
  family: PaletteFamily;
  selected: boolean;
  onPress: () => void;
  /** Mostra l'anteprima nella modalita' attualmente in uso. */
  mode: ThemeMode;
};

/**
 * Anteprima REALE della palette, non un pallino colorato: si vedono fondo,
 * superficie, accento e i quattro colori dei criteri come appariranno.
 */
export function ThemePreview({ family, selected, onPress, mode }: ThemePreviewProps) {
  const theme = useTheme();
  const palette = PALETTES[family];
  const tokens = mode === 'light' && palette.light ? palette.light : palette.dark;
  const onlyDark = palette.light === null;

  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Tema ${palette.label}${onlyDark ? ', solo scuro' : ''}`}
      onPress={onPress}
      style={{
        width: 104,
        borderRadius: theme.radii.lg,
        borderWidth: 2,
        borderColor: selected ? theme.colors.accentBase : theme.colors.borderSubtle,
        overflow: 'hidden',
        backgroundColor: tokens.bgCanvas,
      }}
    >
      <View style={{ padding: 10, gap: 6 }}>
        {/* finta card */}
        <View
          style={{
            height: 26,
            borderRadius: 8,
            backgroundColor: tokens.bgSurface,
            paddingHorizontal: 6,
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <View style={{ height: 4, width: '70%', borderRadius: 2, backgroundColor: tokens.textPrimary }} />
          <View style={{ height: 3, width: '45%', borderRadius: 2, backgroundColor: tokens.textSecondary }} />
        </View>
        {/* finto bottone accento */}
        <View style={{ height: 14, borderRadius: 7, backgroundColor: tokens.accentBase }} />
        {/* i quattro criteri */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(
            [
              tokens.criterionLocation,
              tokens.criterionService,
              tokens.criterionMenu,
              tokens.criterionValue,
            ] as const
          ).map((c, i) => (
            <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c }} />
          ))}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingVertical: 6,
          backgroundColor: tokens.bgSurface,
        }}
      >
        {selected ? <Icon name="check" size={13} color={tokens.accentBase} /> : null}
        <Text variant="caption" color={tokens.textPrimary} style={{ fontSize: 12 }}>
          {palette.label}
        </Text>
      </View>
    </PressScale>
  );
}
