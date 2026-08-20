import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type PickerOption<T extends string> = { value: T; label: string };

export type PickerModalProps<T extends string> = {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

/**
 * Modale generica "scegli uno tra N": usata al posto di controlli segmentati
 * quando le opzioni sono poche ma il controllo merita un tap deliberato
 * invece di stare sempre visibile sullo schermo (vedi Aspetto in Profilo).
 */
export function PickerModal<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: PickerModalProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Chiudi"
        style={{ flex: 1, backgroundColor: theme.colors.bgOverlay, justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.colors.bgSurface,
            borderTopLeftRadius: theme.radii.xl,
            borderTopRightRadius: theme.radii.xl,
            paddingTop: theme.spacing[4],
            paddingHorizontal: theme.spacing[4],
            paddingBottom: insets.bottom + theme.spacing[4],
            gap: theme.spacing[2],
          }}
        >
          <Text variant="heading" style={{ marginBottom: theme.spacing[2] }}>
            {title}
          </Text>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <PressScale
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 50,
                  paddingHorizontal: theme.spacing[3],
                  borderRadius: theme.radii.md,
                  backgroundColor: selected ? theme.colors.accentMuted : 'transparent',
                }}
              >
                <Text
                  variant="body"
                  style={{ fontFamily: selected ? theme.fonts.bodySemi : theme.fonts.body }}
                >
                  {option.label}
                </Text>
                {selected ? (
                  <Icon name="check" size={18} color={theme.colors.accentBase} />
                ) : null}
              </PressScale>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
