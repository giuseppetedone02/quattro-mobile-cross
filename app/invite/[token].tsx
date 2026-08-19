import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, LoadingState, Text } from '@/components/ui';
import { useRespondToInvitation } from '@/features/invitations';
import { useSupabaseSession } from '@/features/auth/hooks/useSession';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Deep link dell'email di invito: quattro://invite/<token>
 *
 * Deve funzionare anche per chi NON e' autenticato -- e' il caso comune, perche'
 * l'invito arriva spesso a chi non ha ancora l'app configurata. In quel caso si
 * manda alla registrazione: il trigger handle_new_user collega gli inviti
 * pendenti indirizzati a quella email, quindi l'invito lo ritrova dentro.
 */
export default function AcceptInvite() {
  const theme = useTheme();
  const router = useRouter();
  const { token, action } = useLocalSearchParams<{ token: string; action?: string }>();
  const { session, loading } = useSupabaseSession();

  const respond = useRespondToInvitation();
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // I due bottoni dell'email arrivano con ?action=accept oppure ?action=decline.
  // Non si agisce automaticamente: si preseleziona e si chiede conferma, perche'
  // un tap involontario in una mail non deve far entrare in un gruppo.
  const suggested = action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : null;

  async function answer(accept: boolean) {
    if (!token) return;
    setError(null);
    try {
      await respond.mutateAsync({ token, accept });
      setDone(accept ? 'accepted' : 'declined');
      if (accept) router.replace('/groups');
    } catch (e) {
      setError(friendlyError(e).message);
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
          icon="mail"
          title="Hai un invito"
          message="Accedi o registrati con l indirizzo a cui e arrivato l invito: lo troverai ad aspettarti."
          actionLabel="Accedi o registrati"
          onAction={() => router.replace('/welcome')}
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen scroll>
        <EmptyState
          icon={done === 'accepted' ? 'check' : 'close'}
          title={done === 'accepted' ? 'Sei dentro' : 'Invito rifiutato'}
          message={
            done === 'accepted'
              ? 'Ora vedi i posti e le recensioni del gruppo.'
              : 'Nessun problema: puoi essere invitato di nuovo in futuro.'
          }
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
            <Text variant="heading">Invito a un gruppo</Text>
            <Text variant="body" color="secondary">
              Se accetti, entri nel gruppo e vedrai i posti e le recensioni di tutti i membri.
            </Text>
            {suggested ? (
              <Text variant="caption" color="secondary">
                {suggested === 'accept'
                  ? 'Dalla mail hai scelto di accettare: conferma qui sotto.'
                  : 'Dalla mail hai scelto di rifiutare: conferma qui sotto.'}
              </Text>
            ) : null}
          </View>
        </Card>

        {error ? <ErrorState compact message={error} /> : null}

        <Button
          label="Accetta l invito"
          variant={suggested === 'decline' ? 'secondary' : 'primary'}
          full
          loading={respond.isPending}
          onPress={() => void answer(true)}
        />
        <Button
          label="Rifiuta"
          variant={suggested === 'decline' ? 'primary' : 'secondary'}
          full
          disabled={respond.isPending}
          onPress={() => void answer(false)}
        />
        <Button label="Decido dopo" variant="ghost" full onPress={() => router.replace('/places')} />
      </View>
    </Screen>
  );
}
