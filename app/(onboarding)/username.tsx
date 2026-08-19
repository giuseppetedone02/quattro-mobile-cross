import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import { Button, ErrorState, TextField, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useClaimUsername, useUsernameAvailability } from '@/features/auth/hooks/useAuthActions';
import { useProfile, useSupabaseSession } from '@/features/auth/hooks/useSession';
import { friendlyError } from '@/lib/errors';

/**
 * Il punto di convergenza dei due percorsi di registrazione (requisito 1).
 *
 * Chi arriva da Google SSO ha un profilo con username NULL creato dal trigger;
 * chi arriva da email lo ha se lo username scelto collideva. In entrambi i
 * casi si finisce qui, con la stessa schermata e lo stesso codice.
 */
export default function ClaimUsername() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSupabaseSession();
  const { data: profile } = useProfile(session?.user.id);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [error, setError] = useState<string | null>(null);

  const check = useUsernameAvailability(username);
  const claim = useClaimUsername();

  const usernameError =
    check.state === 'invalid'
      ? check.message
      : check.state === 'taken'
        ? 'Questo username e gia in uso. Provane un altro.'
        : check.state === 'error'
          ? check.message
          : null;

  async function submit() {
    setError(null);
    try {
      await claim.mutateAsync({
        username: username.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
      });
      router.replace('/theme-picker');
    } catch (e) {
      setError(friendlyError(e, 'profiles').message);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <View style={{ gap: theme.spacing[5], paddingTop: theme.spacing[6] }}>
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="title">Come ti chiamiamo?</Text>
          <Text variant="body" color="secondary">
            Lo username serve ai tuoi amici per trovarti e invitarti nei gruppi.
          </Text>
        </View>

        <TextField
          label="Username"
          prefix="@"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          error={usernameError}
          success={check.state === 'available' ? 'Libero' : null}
          hint={
            check.state === 'checking'
              ? 'Controllo...'
              : 'Da 3 a 20 caratteri: lettere minuscole, numeri, punto e underscore.'
          }
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          placeholder="ilmionome"
        />

        <TextField
          label="Nome visualizzato (opzionale)"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Come vuoi comparire nei gruppi"
        />

        {error ? <ErrorState compact message={error} /> : null}

        <Button
          label="Continua"
          full
          disabled={check.state !== 'available'}
          loading={claim.isPending}
          onPress={submit}
        />
      </View>
    </Screen>
  );
}
