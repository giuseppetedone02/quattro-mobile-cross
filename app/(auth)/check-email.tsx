import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Button, EmptyState, ErrorState, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useAuthDeepLink, useResendConfirmation } from '@/features/auth/hooks/useAuthActions';
import { friendlyError } from '@/lib/errors';

export default function CheckEmail() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';

  const resend = useResendConfirmation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se l'utente apre il link dell'email mentre questa schermata e' aperta,
  // la sessione si crea qui e il gate in app/index.tsx fa il resto.
  const deepLink = useAuthDeepLink();

  async function resendNow() {
    setError(null);
    try {
      await resend.mutateAsync(email);
      setSent(true);
    } catch (e) {
      setError(friendlyError(e).message);
    }
  }

  return (
    <Screen scroll>
      <Header back title="Controlla la tua email" />

      <EmptyState
        icon="mail"
        title="Ti abbiamo scritto"
        message={
          email
            ? `Apri il link che abbiamo mandato a ${email} per confermare l indirizzo e completare la registrazione.`
            : 'Apri il link che ti abbiamo mandato per confermare l indirizzo.'
        }
      />

      <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[4] }}>
        {deepLink.error ? <ErrorState compact message={deepLink.error} /> : null}
        {error ? <ErrorState compact message={error} /> : null}
        {sent ? (
          <Text variant="caption" color="success" align="center" accessibilityLiveRegion="polite">
            Email inviata di nuovo.
          </Text>
        ) : null}

        <Button
          label="Invia di nuovo l email"
          variant="secondary"
          full
          loading={resend.isPending}
          disabled={!email}
          onPress={resendNow}
        />
        <Button label="Torna all accesso" variant="ghost" full onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
