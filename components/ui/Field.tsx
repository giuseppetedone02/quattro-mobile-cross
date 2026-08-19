import React, { useState } from 'react';
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { Text } from './Text';

export type FieldProps = {
  label?: string;
  /** Messaggio d'errore. Presente = campo in stato d'errore. */
  error?: string | null;
  /** Messaggio di conferma (es. "username libero"). */
  success?: string | null;
  hint?: string;
  children: React.ReactNode;
  style?: ViewStyle;
};

/** Involucro comune: etichetta, contenuto, e una sola riga di stato sotto. */
export function Field({ label, error, success, hint, children, style }: FieldProps) {
  const theme = useTheme();
  return (
    <View style={[{ gap: theme.spacing[2] }, style]}>
      {label ? (
        <Text variant="label" uppercase color="secondary">
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center' }}
        >
          <Icon name="warning" size={14} color={theme.colors.danger} />
          <Text variant="caption" color="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : success ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center' }}
        >
          <Icon name="check" size={14} color={theme.colors.success} />
          <Text variant="caption" color="success" style={{ flex: 1 }}>
            {success}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" color="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  success?: string | null;
  hint?: string;
  /** Prefisso inline, es. "@" per lo username o l'euro per un importo. */
  prefix?: string;
  containerStyle?: ViewStyle;
};

export function TextField({
  label,
  error,
  success,
  hint,
  prefix,
  containerStyle,
  style,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accentBase
      : theme.colors.borderSubtle;

  return (
    <Field label={label} error={error} success={success} hint={hint} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing[2],
          minHeight: 50,
          paddingHorizontal: theme.spacing[3],
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.bgSurface,
          borderWidth: 1.5,
          borderColor,
        }}
      >
        {prefix ? (
          <Text variant="body" color="secondary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          underlineColorAndroid="transparent"
          style={[
            {
              flex: 1,
              color: theme.colors.textPrimary,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes.base,
              paddingVertical: theme.spacing[3],
            },
            style,
          ]}
          {...rest}
        />
      </View>
    </Field>
  );
}

export function TextArea(props: TextFieldProps) {
  return (
    <TextField
      multiline
      numberOfLines={4}
      textAlignVertical="top"
      {...props}
      style={[{ minHeight: 96 }, props.style]}
    />
  );
}
