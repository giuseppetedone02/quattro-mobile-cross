import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { IconButton } from './Button';

export type SearchFieldProps = {
  value: string;
  onChangeText: (v: string) => void;
  /** Chiamato con il valore dopo il debounce. */
  onDebouncedChange?: (v: string) => void;
  placeholder?: string;
  loading?: boolean;
  debounceMs?: number;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * Il debounce e' integrato nel componente, non lasciato alla schermata.
 * Su Google Places questo e' anche una misura di costo: le sessioni
 * abbandonate si pagano a richiesta (10.000 gratuite/mese), quindi 300 ms di
 * attesa e un minimo di 3 caratteri sono imposti sia qui sia nella Edge
 * Function -- il client e' una cortesia, il server e' la regola.
 */
export function SearchField({
  value,
  onChangeText,
  onDebouncedChange,
  placeholder = 'Cerca...',
  loading = false,
  debounceMs = 300,
  autoFocus,
  accessibilityLabel,
  style,
}: SearchFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onDebouncedChange) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onDebouncedChange(value), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, debounceMs, onDebouncedChange]);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          height: 48,
          paddingLeft: theme.spacing[3],
          paddingRight: theme.spacing[1],
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.bgRaised,
          borderWidth: 1.5,
          borderColor: focused ? theme.colors.accentBase : 'transparent',
        },
        style,
      ]}
    >
      <Icon name="search" size={19} color={theme.colors.textSecondary} />
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          color: theme.colors.textPrimary,
          fontFamily: theme.fonts.body,
          fontSize: theme.fontSizes.base,
          // Android: rimuove la sottolineatura nativa che si sovrapporrebbe
          // al bordo del contenitore. Stesso problema che WantABook risolveva
          // con una patch dell'Handler in MauiProgram.
          paddingVertical: 0,
        }}
        underlineColorAndroid="transparent"
      />
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.accentBase} style={{ marginRight: 8 }} />
      ) : value.length > 0 ? (
        <IconButton
          icon="close"
          accessibilityLabel="Cancella la ricerca"
          size={36}
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}
