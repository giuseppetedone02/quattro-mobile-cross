import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Card, ErrorState, Text } from '@/components/ui';
import { PeopleSearch, useInviteToGroup } from '@/features/invitations';
import { useGroup, useGroupMembers } from '@/features/groups';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

export default function InviteToGroup() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';

  const group = useGroup(groupId);
  const members = useGroupMembers(groupId);
  const invite = useInviteToGroup();

  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(identifier: string) {
    setError(null);
    setMessage(null);
    setPending(identifier);
    try {
      await invite.mutateAsync({ groupId, identifier });
      setMessage(`Invito mandato a ${identifier}.`);
    } catch (e) {
      setError(friendlyError(e).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <Header close title="Invita amici" subtitle={group.data?.name} />

      <View style={{ gap: theme.spacing[4] }}>
        <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised }}>
          <Text variant="caption" color="secondary">
            Cerca per username, oppure incolla l email esatta di chi vuoi invitare. Riceve una
            notifica in app e una email con il link per accettare.
          </Text>
        </Card>

        {error ? <ErrorState compact message={error} /> : null}
        {message ? (
          <Text variant="caption" color="success" accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        <PeopleSearch
          onInvite={(identifier) => void send(identifier)}
          invitingIdentifier={pending}
          alreadyMemberIds={(members.data ?? []).map((m) => m.userId)}
        />
      </View>
    </Screen>
  );
}
