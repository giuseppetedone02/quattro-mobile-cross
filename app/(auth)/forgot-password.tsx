import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, Header } from '@/components/layout';
import { Button, ErrorState, TextField, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useResetPassword } from '@/features/auth/hooks/useAuthActions';
import { emailSchema, fieldError } from '@/features/auth/schema';
import { friendlyError } from '@/lib/errors';

export default function ForgotPassword() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = useResetPassword();

  const emailError = touched ? fieldError(emailSchema, email) : null;

  async function submit() {
    setError(null);
    try {
      await reset.mutateAsync(email.trim().toLowerCase());
      setDone(true);
    } catch (e) {
      setError(friendlyError(e).message);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <Header back title="Reimposta la password" />

      <View style={{ gap: theme.spacing[4] }}>
        <Text variant="body" color="secondary">
          Inserisci la tua email: ti mandiamo un link per scegliere una nuova password.
        </Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched(true)}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
        />

        {error ? <ErrorState compact message={error} /> : null}
        {done ? (
          <Text variant="caption" color="success" accessibilityLiveRegion="polite">
            Se l indirizzo e registrato, il link e in arrivo.
          </Text>
        ) : null}

        <Button
          label="Mandami il link"
          full
          disabled={Boolean(emailError) || email.length === 0}
          loading={reset.isPending}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
