import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { IconButton, Text } from '@/components/ui';

export type HeaderProps = {
  title?: string;
  subtitle?: string;
  /** Mostra il pulsante indietro. */
  back?: boolean;
  /** Etichetta del pulsante di chiusura in una modale. */
  close?: boolean;
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function Header({ title, subtitle, back, close, right, style }: HeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          minHeight: 56,
          marginBottom: theme.spacing[3],
        },
        style,
      ]}
    >
      {back ? (
        <IconButton
          icon="arrowLeft"
          accessibilityLabel="Torna indietro"
          onPress={() => router.back()}
          style={{ marginLeft: -10 }}
        />
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="heading" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}

      {close ? (
        <IconButton
          icon="close"
          accessibilityLabel="Chiudi"
          onPress={() => router.back()}
          style={{ marginRight: -10 }}
        />
      ) : null}
    </View>
  );
}
