import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import type { Criterion } from '@/theme/tokens';
import {
  Avatar,
  Button,
  Card,
  Diamond,
  IconButton,
  PhotoGrid,
  ScoreBadge,
  Text,
} from '@/components/ui';
import { costPerPerson, formatCents, formatRelative } from '@/lib/format';
import type { Review, ReviewPhoto } from '@/lib/database.types';
import type { ReviewAuthor } from '@/features/reviews/hooks/useReviews';

export type ReviewCardProps = {
  review: Review;
  author: ReviewAuthor;
  photos: ReviewPhoto[];
  /** storage_path -> URL firmato. Le foto senza URL non si mostrano. */
  photoUrls?: Record<string, string>;
  avatarUri?: string | null;
  /** Solo per la propria recensione compaiono Modifica/Sposta/Elimina. */
  isMine?: boolean;
  /** Admin del gruppo: vede solo Elimina, anche su recensioni altrui. */
  canModerate?: boolean;
  onEdit?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onPressPhoto?: (index: number) => void;
};

export function ReviewCard({
  review,
  author,
  photos,
  photoUrls,
  avatarUri,
  isMine = false,
  canModerate = false,
  onEdit,
  onMove,
  onDelete,
  onPressPhoto,
}: ReviewCardProps) {
  const theme = useTheme();
  const [actionsOpen, setActionsOpen] = useState(false);

  const scores = useMemo<Record<Criterion, number>>(
    () => ({
      location: review.score_location,
      service: review.score_service,
      menu: review.score_menu,
      value: review.score_value,
    }),
    [review.score_location, review.score_service, review.score_menu, review.score_value],
  );

  const gridPhotos = useMemo(
    () =>
      photos.flatMap((photo) => {
        const uri = photoUrls?.[photo.storage_path];
        return uri ? [{ id: photo.id, uri, blurhash: photo.blurhash }] : [];
      }),
    [photos, photoUrls],
  );

  const name = author.display_name ?? author.username ?? 'Qualcuno';
  const perPerson = costPerPerson(review.bill_total_cents, review.party_size);

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
        <Avatar uri={avatarUri} name={name} seed={author.id} size={40} />

        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            {author.username ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                @{author.username}
              </Text>
            ) : null}
            <Text variant="caption" color="secondary">
              {formatRelative(review.visited_on ?? review.created_at)}
            </Text>
          </View>
        </View>

        <Diamond scores={scores} scale="micro" animated={false} />
        <ScoreBadge score={review.overall} size="sm" />

        {isMine || canModerate ? (
          <IconButton
            icon="more"
            accessibilityLabel={
              actionsOpen
                ? 'Chiudi le azioni sulla recensione'
                : isMine
                  ? 'Azioni sulla tua recensione'
                  : 'Azioni di moderazione'
            }
            size={36}
            onPress={() => setActionsOpen((open) => !open)}
          />
        ) : null}
      </View>

      {review.comment ? <Text variant="body">{review.comment}</Text> : null}

      {perPerson != null ? (
        <Text
          variant="caption"
          color="secondary"
          accessibilityLabel={`Circa ${formatCents(perPerson)} a persona`}
        >
          {formatCents(perPerson)} a persona ({formatCents(review.bill_total_cents)} in{' '}
          {review.party_size})
        </Text>
      ) : null}

      {gridPhotos.length > 0 ? <PhotoGrid photos={gridPhotos} onPressPhoto={onPressPhoto} /> : null}

      {(isMine || canModerate) && actionsOpen ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing[2],
            borderTopWidth: 1,
            borderTopColor: theme.colors.borderSubtle,
            paddingTop: theme.spacing[3],
          }}
        >
          {isMine && onEdit ? (
            <Button label="Modifica" variant="ghost" size="sm" icon="edit" onPress={onEdit} />
          ) : null}
          {isMine && onMove ? (
            <Button label="Sposta" variant="ghost" size="sm" icon="move" onPress={onMove} />
          ) : null}
          {onDelete ? (
            <Button label="Elimina" variant="danger" size="sm" icon="trash" onPress={onDelete} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
