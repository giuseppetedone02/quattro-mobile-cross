import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export type ScreenProps = {
  children: React.ReactNode;
  /** Avvolge il contenuto in una ScrollView. Usa false per liste virtualizzate. */
  scroll?: boolean;
  /** Padding orizzontale standard. */
  padded?: boolean;
  /** Evita la tastiera: attivare sulle schermate con form. */
  avoidKeyboard?: boolean;
  edges?: { top?: boolean; bottom?: boolean };
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  avoidKeyboard = false,
  edges = { top: true, bottom: true },
  style,
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const base: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.bgCanvas,
    paddingTop: edges.top ? insets.top : 0,
  };

  const inner: ViewStyle = {
    paddingHorizontal: padded ? theme.spacing[4] : 0,
    paddingBottom: edges.bottom ? insets.bottom + theme.spacing[4] : theme.spacing[4],
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[inner, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, inner, contentStyle]}>{children}</View>
  );

  if (!avoidKeyboard) return <View style={[base, style]}>{body}</View>;

  return (
    <KeyboardAvoidingView
      style={[base, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}
