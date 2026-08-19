import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Button, ErrorState, TextField, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useSignUp, useUsernameAvailability } from '@/features/auth/hooks/useAuthActions';
import { emailSchema, fieldError, passwordSchema } from '@/features/auth/schema';
import { friendlyError } from '@/lib/errors';

export default function SignUp() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState<string | null>(null);

  const signUp = useSignUp();
  const check = useUsernameAvailability(username);

  const emailError = touched.email ? fieldError(emailSchema, email) : null;
  const passwordError = touched.password ? fieldError(passwordSchema, password) : null;

  // Il controllo dal vivo e' una cortesia: claim_username ricontrolla al
  // salvataggio e il vincolo unique e' l'ultima parola.
  const usernameError =
    check.state === 'invalid'
      ? check.message
      : check.state === 'taken'
        ? 'Questo username e gia in uso.'
        : check.state === 'error'
          ? check.message
          : null;

  const usernameOk = check.state === 'available' ? 'Libero' : null;

  const canSubmit =
    !emailError && !passwordError && !usernameError && check.state === 'available' &&
    email.length > 0 && password.length > 0;

  async function submit() {
    setError(null);
    try {
      await signUp.mutateAsync({
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        password,
      });
      router.replace({ pathname: '/check-email', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setError(friendlyError(e, 'profiles').message);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <Header back title="Crea il tuo account" />

      <View style={{ gap: theme.spacing[4] }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="tu@esempio.it"
        />

        <TextField
          label="Username"
          prefix="@"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          error={usernameError}
          success={usernameOk}
          hint={
            check.state === 'checking'
              ? 'Controllo...'
              : 'Da 3 a 20 caratteri: lettere minuscole, numeri, punto e underscore.'
          }
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ilmionome"
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
          hint="Almeno 8 caratteri."
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />

        {error ? <ErrorState compact message={error} /> : null}

        <Button
          label="Registrati"
          full
          disabled={!canSubmit}
          loading={signUp.isPending}
          onPress={submit}
        />

        <Text variant="caption" color="secondary" align="center">
          Ti mandiamo una email per confermare l indirizzo.
        </Text>

        <Button
          label="Ho gia un account: accedi"
          variant="ghost"
          full
          onPress={() => router.replace('/sign-in')}
        />
      </View>
    </Screen>
  );
}
