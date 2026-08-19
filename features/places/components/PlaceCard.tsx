import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme';
import type { Criterion } from '@/theme/tokens';
import { Icon } from '@/components/icons';
import { AvatarStack, Card, Chip, Diamond, ScoreBadge, Text } from '@/components/ui';
import { formatScore, pluralize } from '@/lib/format';
import type { Place, PlaceScores } from '@/lib/database.types';

export type PlaceCardProps = {
  place: Place;
  scores: PlaceScores | null;
  /** Chi ha recensito il posto in questo gruppo. */
  reviewers?: { id: string; name: string | null; uri?: string | null }[];
  /** true quando l'utente corrente non ha ancora scritto la sua recensione. */
  needsMyReview?: boolean;
  /** URL della foto di copertina, gia' risolto dal chiamante. */
  coverUri?: string | null;
  onPress?: () => void;
};

const COVER = 60;

/**
 * Riga della lista posti.
 *
 * La card e' UN SOLO elemento per lo screen reader: il contenuto interno e'
 * nascosto e tutta l'informazione (nome, punteggio, quante recensioni, se
 * manca la tua) sta nell'accessibilityLabel. Leggere sette frammenti separati
 * per riga renderebbe la lista impraticabile in ascolto.
 */
export function PlaceCard({
  place,
  scores,
  reviewers = [],
  needsMyReview = false,
  coverUri,
  onPress,
}: PlaceCardProps) {
  const theme = useTheme();

  const reviewCount = scores?.review_count ?? 0;
  const average = scores?.avg_overall ?? null;

  // Il Diamante vuole i quattro criteri: si costruisce dalle medie della
  // vista. Con zero recensioni non si disegna affatto, invece di mostrare una
  // forma che sembrerebbe un dato reale.
  const diamondScores = useMemo<Record<Criterion, number> | null>(() => {
    if (!scores || reviewCount === 0) return null;
    return {
      location: scores.avg_location ?? 1,
      service: scores.avg_service ?? 1,
      menu: scores.avg_menu ?? 1,
      value: scores.avg_value ?? 1,
    };
  }, [scores, reviewCount]);

  const label = [
    place.name,
    place.address ?? null,
    reviewCount > 0
      ? `punteggio ${formatScore(average)} su 10, ${pluralize(reviewCount, 'recensione', 'recensioni')}`
      : 'nessuna recensione',
    needsMyReview ? 'da recensire' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={onPress ? 'Apri la scheda del posto' : undefined}
      padded={false}
      style={{ padding: theme.spacing[3] }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}
      >
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={{
              width: COVER,
              height: COVER,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.bgRaised,
            }}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={{
              width: COVER,
              height: COVER,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.accentMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="pin" size={24} color={theme.colors.accentBase} />
          </View>
        )}

        <View style={{ flex: 1, gap: theme.spacing[1] }}>
          <Text variant="subheading" numberOfLines={1}>
            {place.name}
          </Text>
          {place.address ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {place.address}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing[2],
              marginTop: theme.spacing[1],
            }}
          >
            {reviewers.length > 0 ? <AvatarStack people={reviewers} size={24} max={4} /> : null}
            {needsMyReview ? <Chip label="Da recensire" icon="edit" /> : null}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: theme.spacing[1] }}>
          {diamondScores ? <Diamond scores={diamondScores} scale="micro" animated={false} /> : null}
          <ScoreBadge score={average} size="sm" />
        </View>
      </View>
    </Card>
  );
}
