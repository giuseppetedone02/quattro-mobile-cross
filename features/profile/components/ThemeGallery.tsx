import React from 'react';
import { View } from 'react-native';
import {
  PALETTES,
  PALETTE_FAMILIES,
  useTheme,
  type PaletteFamily,
  type ThemePreference,
} from '@/theme';
import { PressScale, Text, ThemePreview } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAppearance } from '@/lib/store';
import { useSyncThemeToProfile } from '../hooks/useProfile';

const PREFERENCE_LABELS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
];

/**
 * Galleria dei temi: cinque famiglie piu' il controllo chiaro/scuro/sistema.
 *
 * NOTA: la famiglia `charcoal` (Carbone) esiste solo in scuro -- e' il tema ad
 * alto contrasto per accessibilita'. Non serve nessun caso particolare qui:
 * buildTheme() forza da se' la modalita' scura quando `palette.light` e' null,
 * e l'anteprima mostra la variante scura di conseguenza. La preferenza
 * dell'utente resta salvata cosi' com'e', per ritrovarla se cambia famiglia.
 */
export function ThemeGallery() {
  const theme = useTheme();
  const { family, preference, setFamily, setPreference } = useAppearance();
  const { sync } = useSyncThemeToProfile();

  function chooseFamily(next: PaletteFamily) {
    setFamily(next);
    sync({ family: next, preference });
  }

  function choosePreference(next: ThemePreference) {
    setPreference(next);
    sync({ family, preference: next });
  }

  return (
    <View style={{ gap: theme.spacing[5] }}>
      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="label" uppercase color="secondary">
          Aspetto
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Aspetto chiaro o scuro"
          style={{
            flexDirection: 'row',
            gap: theme.spacing[1],
            padding: theme.spacing[1],
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.bgRaised,
          }}
        >
          {PREFERENCE_LABELS.map((option) => {
            const selected = option.value === preference;
            return (
              <PressScale
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => choosePreference(option.value)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radii.full,
                  backgroundColor: selected ? theme.colors.accentBase : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  color={selected ? 'inverse' : 'secondary'}
                  style={{ fontFamily: theme.fonts.bodySemi }}
                >
                  {option.label}
                </Text>
              </PressScale>
            );
          })}
        </View>
      </View>

      <View style={{ gap: theme.spacing[3] }}>
        <Text variant="label" uppercase color="secondary">
          Tema
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Tema dei colori"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}
        >
          {PALETTE_FAMILIES.map((candidate) => (
            <ThemePreview
              key={candidate}
              family={candidate}
              selected={candidate === family}
              mode={PALETTES[candidate].light === null ? 'dark' : theme.mode}
              onPress={() => chooseFamily(candidate)}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center' }}>
          <Icon name="info" size={14} color={theme.colors.textSecondary} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            {"Carbone esiste solo in scuro: e' il tema ad alto contrasto."}
          </Text>
        </View>
      </View>
    </View>
  );
}
