import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, LoadingState, Text } from '@/components/ui';
import { useJoinGroupViaCode } from '@/features/invitations';
import { useSupabaseSession } from '@/features/auth/hooks/useSession';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Deep link del link/codice di invito: quattro://join/<code>
 *
 * Come app/invite/[token].tsx, deve funzionare anche per chi non e' ancora
 * autenticato: e' il caso comune di chi riceve il link da un amico e non ha
 * ancora un account. In quel caso si manda alla registrazione e si conserva
 * il codice, cosi' il tap si completa da solo al ritorno.
 */
export default function JoinWithCode() {
  const theme = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useSupabaseSession();

  const join = useJoinGroupViaCode();
  const [joinedGroupName, setJoinedGroupName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!code) return;
    setError(null);
    try {
      const group = await join.mutateAsync(code);
      setJoinedGroupName(group.name);
      router.replace('/groups');
    } catch (e) {
      setError(friendlyError(e, 'group_members').message);
    }
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen scroll>
        <EmptyState
          icon="link"
          title="Hai un codice di invito"
          message="Accedi o registrati, poi torna su questo link: ti fara entrare direttamente nel gruppo."
          actionLabel="Accedi o registrati"
          onAction={() => router.replace('/welcome')}
        />
      </Screen>
    );
  }

  if (joinedGroupName) {
    return (
      <Screen scroll>
        <EmptyState
          icon="check"
          title="Sei dentro"
          message={`Ora vedi i posti e le recensioni di «${joinedGroupName}».`}
          actionLabel="Vai ai gruppi"
          onAction={() => router.replace('/groups')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing[4], paddingTop: theme.spacing[6] }}>
        <Card>
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="heading">Entra con un codice</Text>
            <Text variant="body" color="secondary">
              Se confermi, entri nel gruppo e vedrai i posti e le recensioni di tutti i membri.
            </Text>
            {code ? (
              <Text
                variant="subheading"
                style={{ letterSpacing: 3, fontFamily: theme.fonts.bodyBold }}
              >
                {code}
              </Text>
            ) : null}
          </View>
        </Card>

        {error ? <ErrorState compact message={error} onRetry={() => void confirm()} /> : null}

        <Button
          label="Entra nel gruppo"
          full
          loading={join.isPending}
          disabled={!code}
          onPress={() => void confirm()}
        />
        <Button
          label="Decido dopo"
          variant="ghost"
          full
          disabled={join.isPending}
          onPress={() => router.replace('/places')}
        />
      </View>
    </Screen>
  );
}
