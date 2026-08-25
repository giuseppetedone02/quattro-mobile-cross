import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, Text } from '@/components/ui';
import { GroupCard, useGroups } from '@/features/groups';
import { InvitationCard, useInboxInvitations, useRespondToInvitation } from '@/features/invitations';
import { useActiveGroup } from '@/lib/store';
import { friendlyError } from '@/lib/errors';
import { pluralize } from '@/lib/format';
import { useTheme } from '@/theme';

export default function GroupsTab() {
  const theme = useTheme();
  const router = useRouter();
  const groups = useGroups();
  const inbox = useInboxInvitations();
  const respond = useRespondToInvitation();
  const { setGroupId } = useActiveGroup();

  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  async function answer(token: string, accept: boolean) {
    setBusyToken(token);
    try {
      await respond.mutateAsync({ token, accept });
      setResult((r) => ({ ...r, [token]: accept ? 'Invito accettato' : 'Invito rifiutato' }));
    } catch (e) {
      setResult((r) => ({ ...r, [token]: friendlyError(e).message }));
    } finally {
      setBusyToken(null);
    }
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={groups.isRefetching || inbox.isRefetching}
            onRefresh={() => {
              void groups.refetch();
              void inbox.refetch();
            }}
            tintColor={theme.colors.accentBase}
          />
        }
        contentContainerStyle={{ paddingBottom: theme.spacing[7], gap: theme.spacing[5] }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: theme.spacing[2],
          }}
        >
          <Text variant="title" accessibilityRole="header">
            Gruppi
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            <IconButton
              icon="link"
              accessibilityLabel="Ho un codice di invito"
              onPress={() => router.push('/join')}
            />
            <IconButton
              icon="plus"
              accessibilityLabel="Crea un gruppo"
              variant="filled"
              onPress={() => router.push('/group/new')}
            />
          </View>
        </View>

        {/* Inviti ricevuti: sono il canale primario, perche' senza account
            Apple a pagamento le notifiche push non esistono (decisione 22.5). */}
        {inbox.data && inbox.data.length > 0 ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Text variant="label" uppercase color="secondary">
              Inviti ricevuti
            </Text>
            {inbox.data.map((item) => (
              <InvitationCard
                key={item.invitation.id}
                item={item}
                busy={busyToken === item.invitation.token}
                result={result[item.invitation.token] ?? null}
                onRespond={(accept) => void answer(item.invitation.token, accept)}
              />
            ))}
          </View>
        ) : null}

        <View style={{ gap: theme.spacing[3] }}>
          <Text variant="label" uppercase color="secondary">
            I miei gruppi
          </Text>

          {groups.isLoading ? (
            <LoadingState />
          ) : groups.error ? (
            <ErrorState
              message={friendlyError(groups.error, 'groups').message}
              onRetry={() => void groups.refetch()}
            />
          ) : (groups.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="users"
              title="Nessun gruppo"
              message="Crea un gruppo e invita chi vuoi: vedrete gli stessi posti e le recensioni di tutti."
              actionLabel="Crea un gruppo"
              onAction={() => router.push('/group/new')}
            />
          ) : (
            (groups.data ?? []).map((summary) => (
              <GroupCard
                key={summary.group.id}
                summary={summary}
                onPress={() => {
                  // Toccare un gruppo lo rende attivo E apre il dettaglio:
                  // e' il gesto che l'utente si aspetta da una lista di gruppi.
                  setGroupId(summary.group.id);
                  router.push(`/group/${summary.group.id}`);
                }}
              />
            ))
          )}
        </View>

        {(groups.data?.length ?? 0) > 0 ? (
          <View style={{ gap: theme.spacing[2] }}>
            <Text variant="caption" color="secondary" align="center">
              {pluralize(groups.data?.length ?? 0, 'gruppo', 'gruppi')}, incluso quello personale.
            </Text>
            <Button
              label="Crea un altro gruppo"
              variant="secondary"
              full
              onPress={() => router.push('/group/new')}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
