import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import {
  Avatar, Button, Card, Chip, ErrorState, IconButton, LoadingState, Text, TextField,
} from '@/components/ui';
import {
  canDeleteGroup, canEditGroup, canLeaveGroup, canManageMembers, useGroup, useGroupMembers,
  useLeaveGroup, useDeleteGroup, useUpdateGroup, useGroups, PERSONAL_GROUP_LOCKED,
} from '@/features/groups';
import { useSentInvitations } from '@/features/invitations';
import { useActiveGroup } from '@/lib/store';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import { pluralize } from '@/lib/format';
import { useTheme } from '@/theme';

export default function GroupDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';

  const group = useGroup(groupId);
  const members = useGroupMembers(groupId);
  const sent = useSentInvitations(groupId);
  const groups = useGroups();
  const leave = useLeaveGroup();
  const remove = useDeleteGroup();
  const rename = useUpdateGroup();
  const { setGroupId } = useActiveGroup();

  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nextName, setNextName] = useState('');

  const summary = groups.data?.find((g) => g.group.id === groupId);
  const myRole = summary?.role;

  if (group.isLoading) {
    return (
      <Screen>
        <Header back />
        <LoadingState />
      </Screen>
    );
  }

  if (group.error || !group.data) {
    return (
      <Screen>
        <Header back />
        <ErrorState
          message={
            group.error ? friendlyError(group.error, 'groups').message : 'Gruppo non trovato.'
          }
        />
      </Screen>
    );
  }

  const g = group.data;
  const canInvite = myRole ? canManageMembers(myRole) && !g.is_personal : false;
  const canLeave = canLeaveGroup(g);
  const canRemove = canDeleteGroup(g, myRole);
  const canRename = canEditGroup(g, myRole);

  async function saveName() {
    setError(null);
    const trimmed = nextName.trim();
    if (!trimmed) return;
    try {
      await rename.mutateAsync({ groupId, name: trimmed });
      setEditingName(false);
    } catch (e) {
      setError(friendlyError(e, 'groups').message);
    }
  }

  return (
    <Screen scroll>
      <Header back title={g.name} subtitle={g.is_personal ? 'Gruppo personale' : undefined} />

      <View style={{ gap: theme.spacing[5] }}>
        <Card>
          <View style={{ flexDirection: 'row', gap: theme.spacing[4], alignItems: 'center' }}>
            <Avatar
              uri={publicUrl(BUCKETS.groupImages, g.image_path)}
              name={g.name}
              seed={g.id}
              size={64}
              square
            />
            <View style={{ flex: 1, gap: theme.spacing[1] }}>
              {editingName ? (
                <View style={{ gap: theme.spacing[2] }}>
                  <TextField
                    value={nextName}
                    onChangeText={setNextName}
                    autoFocus
                    placeholder="Nome del gruppo"
                  />
                  <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                    <Button
                      label="Salva"
                      size="sm"
                      disabled={nextName.trim().length === 0}
                      loading={rename.isPending}
                      onPress={() => void saveName()}
                    />
                    <Button
                      label="Annulla"
                      size="sm"
                      variant="ghost"
                      onPress={() => setEditingName(false)}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Text variant="subheading" style={{ flexShrink: 1 }}>
                    {g.name}
                  </Text>
                  {canRename ? (
                    <IconButton
                      icon="edit"
                      accessibilityLabel="Rinomina il gruppo"
                      size={32}
                      onPress={() => {
                        setNextName(g.name);
                        setEditingName(true);
                      }}
                    />
                  ) : null}
                </View>
              )}
              <Text variant="caption" color="secondary">
                {g.is_personal
                  ? 'Solo tuo'
                  : pluralize(summary?.memberCount ?? 0, 'membro', 'membri')}
                {' · '}
                {pluralize(summary?.placeCount ?? 0, 'posto', 'posti')}
              </Text>
            </View>
          </View>
          {g.description ? (
            <Text variant="body" color="secondary" style={{ marginTop: theme.spacing[3] }}>
              {g.description}
            </Text>
          ) : null}
        </Card>

        <Button
          label="Vedi i posti di questo gruppo"
          icon="list"
          full
          onPress={() => {
            setGroupId(groupId);
            router.push('/places');
          }}
        />

        {g.is_personal ? (
          <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised }}>
            <Text variant="caption" color="secondary">
              {PERSONAL_GROUP_LOCKED}
            </Text>
          </Card>
        ) : null}

        {!g.is_personal ? (
          <View style={{ gap: theme.spacing[3] }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text variant="label" uppercase color="secondary">
                Membri
              </Text>
              {canInvite ? (
                <Button
                  label="Invita"
                  size="sm"
                  icon="plus"
                  onPress={() => router.push(`/group/${groupId}/invite`)}
                />
              ) : null}
            </View>

            {members.isLoading ? (
              <LoadingState />
            ) : (
              (members.data ?? []).map((m) => (
                <Card key={m.userId} elevation={0}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}
                  >
                    <Avatar
                      uri={publicUrl(BUCKETS.avatars, m.profile.avatar_path)}
                      name={m.profile.display_name ?? m.profile.username}
                      seed={m.profile.id}
                      size={40}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">@{m.profile.username}</Text>
                      {m.profile.display_name ? (
                        <Text variant="caption" color="secondary">
                          {m.profile.display_name}
                        </Text>
                      ) : null}
                    </View>
                    {m.role !== 'member' ? (
                      <Chip label={m.role === 'owner' ? 'Proprietario' : 'Admin'} />
                    ) : null}
                  </View>
                </Card>
              ))
            )}

            {sent.data && sent.data.length > 0 ? (
              <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
                <Text variant="label" uppercase color="secondary">
                  Inviti inviati
                </Text>
                {sent.data.map((inv) => (
                  <View
                    key={inv.invitation.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: theme.spacing[2],
                    }}
                  >
                    <Text variant="caption" color="secondary">
                      {inv.invitee?.username
                        ? `@${inv.invitee.username}`
                        : (inv.invitation.invitee_email ?? 'Invitato')}
                    </Text>
                    <Chip label={statusLabel(inv.invitation.status)} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? <ErrorState compact message={error} /> : null}

        <View style={{ gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
          {canLeave ? (
            <Button
              label="Esci dal gruppo"
              variant="danger"
              full
              loading={leave.isPending}
              onPress={async () => {
                setError(null);
                try {
                  await leave.mutateAsync(groupId);
                  router.replace('/groups');
                } catch (e) {
                  setError(friendlyError(e, 'group_members').message);
                }
              }}
            />
          ) : null}

          {canRemove ? (
            <Button
              label="Elimina il gruppo"
              variant="danger"
              full
              loading={remove.isPending}
              onPress={async () => {
                setError(null);
                try {
                  await remove.mutateAsync(groupId);
                  router.replace('/groups');
                } catch (e) {
                  setError(friendlyError(e, 'groups').message);
                }
              }}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'In attesa';
    case 'accepted':
      return 'Accettato';
    case 'declined':
      return 'Rifiutato';
    case 'expired':
      return 'Scaduto';
    case 'revoked':
      return 'Revocato';
    default:
      return status;
  }
}
