import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Card, ErrorState, GroupPickerRow, Text } from '@/components/ui';
import { useGroups } from '@/features/groups';
import { useMoveReview } from '@/features/reviews';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Requisito 2.2.1: spostare la propria recensione da un gruppo all'altro.
 *
 * I parametri placeId e sourceGroupId arrivano dalla rotta perche' la RPC
 * ha bisogno di entrambi: deve creare la riga group_places di destinazione
 * (il vincolo composito la pretende) e invalidare i due sottoalberi.
 */
export default function MoveReview() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; placeId?: string; from?: string }>();
  const reviewId = params.id ?? '';

  const { active } = useActiveGroupResolved();
  const groups = useGroups();
  const move = useMoveReview();

  const sourceGroupId = params.from ?? active?.group.id ?? '';
  const [error, setError] = useState<string | null>(null);

  const targets = (groups.data ?? []).filter((g) => g.group.id !== sourceGroupId);

  async function moveTo(targetGroupId: string) {
    if (!params.placeId) {
      setError('Manca il riferimento al posto. Torna alla scheda e riprova.');
      return;
    }
    setError(null);
    try {
      await move.mutateAsync({
        reviewId,
        sourceGroupId,
        targetGroupId,
        placeId: params.placeId,
      });
      router.back();
    } catch (e) {
      setError(friendlyError(e, 'reviews').message);
    }
  }

  return (
    <Screen scroll>
      <Header close title="Sposta la recensione" />

      <View style={{ gap: theme.spacing[4] }}>
        <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised }}>
          <Text variant="caption" color="secondary">
            La recensione lascia il gruppo attuale e passa in quello che scegli. Il posto viene
            aggiunto al gruppo di destinazione se non c e ancora.
          </Text>
        </Card>

        {error ? <ErrorState compact message={error} /> : null}

        <GroupPickerRow
          groups={targets.map((g) => ({
            id: g.group.id,
            name: g.group.name,
            isPersonal: g.group.is_personal,
          }))}
          busyId={move.isPending ? (move.variables?.targetGroupId ?? null) : null}
          onPick={(gid) => void moveTo(gid)}
        />
      </View>
    </Screen>
  );
}
