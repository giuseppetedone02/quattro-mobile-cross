import React, { useState } from 'react';
import { View } from 'react-native';
import {
  PALETTE_FAMILIES,
  useTheme,
  type PaletteFamily,
  type ThemePreference,
} from '@/theme';
import { PickerModal, PressScale, Text, ThemePreview } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAppearance } from '@/lib/store';
import { useSyncThemeToProfile } from '../hooks/useProfile';

const PREFERENCE_LABELS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
];

/**
 * Galleria dei temi: la scelta chiaro/scuro/sistema e la scelta della
 * famiglia di colori.
 *
 * La preferenza chiaro/scuro/sistema non sta piu' in un controllo segmentato
 * sempre visibile: e' una singola riga "Aspetto" con il valore corrente a
 * destra, che apre una modale con le tre scelte. Tre bottoni permanenti per
 * un'impostazione che si cambia raramente occupavano spazio senza motivo, e
 * creavano anche la label "Aspetto" duplicata (una qui, una nella Card del
 * Profilo che la conteneva).
 *
 * NOTA: la famiglia `charcoal` (Carbone) e' quella ad alto contrasto -- ha
 * sia una variante chiara che una scura, non solo scura come in origine.
 */
export function ThemeGallery() {
  const theme = useTheme();
  const { family, preference, setFamily, setPreference } = useAppearance();
  const { sync } = useSyncThemeToProfile();
  const [pickerOpen, setPickerOpen] = useState(false);

  function chooseFamily(next: PaletteFamily) {
    setFamily(next);
    sync({ family: next, preference });
  }

  function choosePreference(next: ThemePreference) {
    setPreference(next);
    sync({ family, preference: next });
  }

  const currentPreferenceLabel =
    PREFERENCE_LABELS.find((p) => p.value === preference)?.label ?? 'Sistema';

  return (
    <View style={{ gap: theme.spacing[5] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="label" uppercase color="secondary">
          Aspetto
        </Text>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`Aspetto: ${currentPreferenceLabel}. Tocca per cambiare.`}
          onPress={() => setPickerOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[2],
            paddingVertical: theme.spacing[2],
            paddingHorizontal: theme.spacing[3],
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.bgRaised,
          }}
        >
          <Text variant="bodyStrong">{currentPreferenceLabel}</Text>
          <Icon name="chevronDown" size={16} color={theme.colors.textSecondary} />
        </PressScale>
      </View>

      <PickerModal
        visible={pickerOpen}
        title="Aspetto"
        options={PREFERENCE_LABELS}
        value={preference}
        onSelect={choosePreference}
        onClose={() => setPickerOpen(false)}
      />

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
              mode={theme.mode}
              onPress={() => chooseFamily(candidate)}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center' }}>
          <Icon name="info" size={14} color={theme.colors.textSecondary} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            {"Carbone e' il tema ad alto contrasto, chiaro o scuro."}
          </Text>
        </View>
      </View>
    </View>
  );
}
