import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Avatar, Card, ScoreBadge, Skeleton, Text } from '@/components/ui';
import { pluralize } from '@/lib/format';
import type { GroupLeaderboard } from '@/features/reviews';

export type GroupLeaderboardCardProps = {
  groupName: string;
  leaderboard: GroupLeaderboard | null | undefined;
  loading?: boolean;
};

/**
 * Requisito 2.4: chi ha recensito di piu' e il posto con la media piu' alta
 * nel mese in corso, nel gruppo attivo. Estensione di "I tuoi numeri" nel
 * profilo, in una card separata perche' e' un dato di GRUPPO, non personale
 * -- StatsPanel resta quello che era, invariato.
 *
 * Nessuna card se non ci sono recensioni questo mese: un contenitore vuoto
 * con "nessun dato" non aggiunge nulla che l'assenza della card non dica gia'.
 */
export function GroupLeaderboardCard({
  groupName,
  leaderboard,
  loading = false,
}: GroupLeaderboardCardProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Card style={{ gap: theme.spacing[3] }}>
        <Skeleton width="50%" height={12} />
        <Skeleton width="80%" height={16} />
        <Skeleton width="80%" height={16} />
      </Card>
    );
  }

  if (!leaderboard || (!leaderboard.topReviewer && !leaderboard.topPlace)) {
    return null;
  }

  const reviewerName =
    leaderboard.topReviewer?.author.display_name ?? leaderboard.topReviewer?.author.username;

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <Text variant="label" uppercase color="secondary">
        Classifica di {groupName} · questo mese
      </Text>

      {leaderboard.topReviewer ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <Avatar
            uri={null}
            name={reviewerName}
            seed={leaderboard.topReviewer.author.id}
            size={36}
          />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {reviewerName ?? 'Qualcuno'}
            </Text>
            <Text variant="caption" color="secondary">
              {pluralize(
                leaderboard.topReviewer.reviewCount,
                'recensione scritta',
                'recensioni scritte',
              )}
            </Text>
          </View>
        </View>
      ) : null}

      {leaderboard.topPlace ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <ScoreBadge score={leaderboard.topPlace.avgOverall} size="sm" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {leaderboard.topPlace.placeName}
            </Text>
            <Text variant="caption" color="secondary">
              Il posto piu votato,{' '}
              {pluralize(leaderboard.topPlace.reviewCount, 'recensione', 'recensioni')}
            </Text>
          </View>
        </View>
      ) : null}
    </Card>
  );
}
