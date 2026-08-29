import React, { useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme';
import { Button, Card, ErrorState, LoadingState, Text } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import {
  buildInviteShareMessage,
  buildJoinWebLink,
  useGroupInviteLink,
  useRegenerateGroupInviteLink,
} from '../hooks/useInvitations';

export type InviteLinkCardProps = {
  groupId: string;
  groupName: string;
};

/**
 * Card con il link/codice di invito del gruppo: un modo per invitare senza
 * conoscere username o email di chi si vuole invitare. Sta sotto la casella
 * di ricerca nella schermata "Invita" -- e' un canale complementare a
 * PeopleSearch, non un suo sostituto.
 *
 * Il codice si genera al volo la prima volta che un admin apre questa card
 * (la RPC e' idempotente: apirla di nuovo non ne crea uno nuovo), e resta
 * valido finche' nessuno lo rigenera esplicitamente da qui.
 */
export function InviteLinkCard({ groupId, groupName }: InviteLinkCardProps) {
  const theme = useTheme();
  const link = useGroupInviteLink(groupId);
  const regenerate = useRegenerateGroupInviteLink();

  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const code = link.data;

  async function copyLink() {
    if (!code) return;
    setActionError(null);
    // Si copia il link https (pagina di fallback), non lo schema quattro://:
    // e' quello che funziona ovunque lo si incolli -- messaggi, email, note.
    await Clipboard.setStringAsync(buildJoinWebLink(code, groupName));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function share() {
    if (!code) return;
    setActionError(null);
    try {
      // Il pannello di condivisione nativo e' gia' "WhatsApp, email e altro":
      // e' il sistema, non l'app, a decidere quali app offrire.
      await Share.share({ message: buildInviteShareMessage(groupName, code) });
    } catch (e) {
      setActionError(friendlyError(e).message);
    }
  }

  async function handleRegenerate() {
    setActionError(null);
    setCopied(false);
    try {
      await regenerate.mutateAsync(groupId);
    } catch (e) {
      setActionError(friendlyError(e, 'group_members').message);
    }
  }

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Text variant="label" uppercase color="secondary" style={{ flex: 1 }}>
          Invita con un link
        </Text>
      </View>

      {link.isPending ? (
        <LoadingState label="Preparo il link..." />
      ) : link.isError ? (
        <ErrorState
          compact
          message={friendlyError(link.error, 'group_members').message}
          onRetry={() => void link.refetch()}
        />
      ) : code ? (
        <View style={{ gap: theme.spacing[3] }}>
          <View
            style={{
              paddingVertical: theme.spacing[3],
              paddingHorizontal: theme.spacing[4],
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.bgRaised,
              gap: theme.spacing[1],
            }}
          >
            <Text
              variant="subheading"
              style={{
                letterSpacing: 3,
                fontFamily: theme.fonts.bodyBold,
                fontVariant: ['tabular-nums'],
              }}
              accessibilityLabel={`Codice di invito ${code.split('').join(' ')}`}
            >
              {code}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={2}>
              {buildJoinWebLink(code, groupName)}
            </Text>
          </View>

          <Text variant="caption" color="secondary">
            Il link è una pagina web, cliccabile ovunque lo condividi: apre l&apos;app se e
            installata, altrimenti mostra il codice. Se non ha ancora BiteMark, puo&apos; installare
            l&apos;app e poi inserire il codice dalla schermata &quot;Ho un codice&quot;.
          </Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
            <Button
              label={copied ? 'Copiato' : 'Copia'}
              icon={copied ? 'check' : 'copy'}
              variant="secondary"
              onPress={() => void copyLink()}
              style={{ flex: 1 }}
              accessibilityLabel="Copia il link di invito"
            />
            <Button
              label="Condividi"
              icon="share"
              onPress={() => void share()}
              style={{ flex: 1 }}
              accessibilityLabel="Condividi il link di invito su WhatsApp, email o altre app"
            />
          </View>

          {actionError ? <ErrorState compact message={actionError} /> : null}

          <Button
            label="Genera un nuovo link"
            variant="ghost"
            size="sm"
            loading={regenerate.isPending}
            onPress={() => void handleRegenerate()}
            accessibilityLabel="Genera un nuovo link di invito e revoca quello attuale"
          />
        </View>
      ) : null}
    </Card>
  );
}
