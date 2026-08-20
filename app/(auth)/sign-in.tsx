import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Button, ErrorState, TextField, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useSignIn, useSignInWithGoogle } from '@/features/auth/hooks/useAuthActions';
import { fieldError, emailSchema } from '@/features/auth/schema';
import { friendlyError } from '@/lib/errors';

export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useSignIn();
  const google = useSignInWithGoogle();

  const emailError = touched ? fieldError(emailSchema, email) : null;
  const canSubmit = email.length > 0 && password.length > 0 && !emailError;

  async function submit() {
    setError(null);
    try {
      await signIn.mutateAsync({ email: email.trim().toLowerCase(), password });
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e).message);
    }
  }

  async function withGoogle() {
    setError(null);
    try {
      await google.mutateAsync();
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e).message);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <Header back title="Accedi" />

      <View style={{ gap: theme.spacing[4] }}>
        <Button
          label="Continua con Google"
          icon="google"
          full
          loading={google.isPending}
          onPress={withGoogle}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.borderSubtle }} />
          <Text variant="caption" color="secondary">
            oppure
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.borderSubtle }} />
        </View>

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
          textContentType="emailAddress"
          placeholder="nome@dominio.it"
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          placeholder="La tua password"
        />

        {error ? <ErrorState compact message={error} /> : null}

        <Button
          label="Accedi"
          full
          disabled={!canSubmit}
          loading={signIn.isPending}
          onPress={submit}
        />

        <Button
          label="Ho dimenticato la password"
          variant="ghost"
          full
          onPress={() => router.push('/forgot-password')}
        />
        <Button
          label="Non ho un account: registrami"
          variant="ghost"
          full
          onPress={() => router.replace('/sign-up')}
        />
      </View>
    </Screen>
  );
}
