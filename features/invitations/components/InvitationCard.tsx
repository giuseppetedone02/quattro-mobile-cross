import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Avatar, Button, Card, Text } from '@/components/ui';
import { Icon } from '@/components/icons';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { formatRelative } from '@/lib/format';
import type { InvitationWithContext } from '../hooks/useInvitations';

export type InvitationCardProps = {
  item: InvitationWithContext;
  onRespond: (accept: boolean) => void;
  /** true mentre la risposta e' in volo: blocca entrambi i bottoni. */
  busy?: boolean;
  /** Esito da annunciare (accettato, rifiutato, errore). */
  result?: string | null;
};

/**
 * Un invito ricevuto. Il nome di chi invita viene prima del nome del gruppo:
 * la decisione di entrare dipende piu' da chi te lo chiede che dal titolo.
 */
export function InvitationCard({ item, onRespond, busy = false, result }: InvitationCardProps) {
  const theme = useTheme();
  const { invitation, group, inviter } = item;

  const who = inviter.display_name ?? (inviter.username ? `@${inviter.username}` : 'Qualcuno');
  const sentence = `${who} ti ha invitato in «${group.name}»`;
  const when = formatRelative(invitation.created_at);

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing[3], alignItems: 'center' }}>
        <Avatar
          uri={publicUrl(BUCKETS.avatars, inviter.avatar_path)}
          name={inviter.display_name ?? inviter.username}
          seed={inviter.id}
          size={44}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body">{sentence}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
            <Icon name="users" size={13} color={theme.colors.textSecondary} />
            <Text variant="caption" color="secondary">
              {when}
            </Text>
          </View>
        </View>
      </View>

      {group.description ? (
        <Text variant="caption" color="secondary" numberOfLines={3}>
          {group.description}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
        <Button
          label="Rifiuta"
          variant="secondary"
          onPress={() => onRespond(false)}
          disabled={busy}
          accessibilityLabel={`Rifiuta l'invito in ${group.name}`}
          style={{ flex: 1 }}
        />
        <Button
          label="Accetta"
          variant="primary"
          onPress={() => onRespond(true)}
          loading={busy}
          disabled={busy}
          accessibilityLabel={`Accetta l'invito in ${group.name}`}
          style={{ flex: 1 }}
        />
      </View>

      {/* L'esito arriva dopo la richiesta: senza live region lo screen reader
          resterebbe sull'ultimo bottone premuto e non direbbe nulla. */}
      {result ? (
        <Text accessibilityLiveRegion="polite" variant="caption" color="secondary">
          {result}
        </Text>
      ) : null}
    </Card>
  );
}
