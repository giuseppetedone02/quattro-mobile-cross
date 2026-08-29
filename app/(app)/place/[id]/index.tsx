import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, Header } from '@/components/layout';
import {
  Button,
  Card,
  Chip,
  CriterionBar,
  Diamond,
  EmptyState,
  ErrorState,
  LoadingState,
  ScoreBadge,
  Text,
} from '@/components/ui';
import {
  OfficialInfoCard,
  usePlace,
  usePlaceScores,
  useRemovePlaceFromGroup,
} from '@/features/places';
import { ReviewCard, useDeleteReview, useMyReview, useReviews } from '@/features/reviews';
import { useSupabaseSession } from '@/features/auth/hooks/useSession';
import { canManageMembers, canRemovePlaceFromGroup } from '@/features/groups';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { useSignedUrls } from '@/lib/useSignedUrls';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import { formatCents, pluralize } from '@/lib/format';
import { CRITERIA } from '@/theme/tokens';
import type { Scores } from '@/features/reviews';
import { useTheme } from '@/theme';

export default function PlaceDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = id ?? '';

  const { session } = useSupabaseSession();
  const userId = session?.user.id;
  const { active } = useActiveGroupResolved();
  const groupId = active?.group.id;

  const place = usePlace(placeId);
  const scores = usePlaceScores(groupId, placeId);
  const reviews = useReviews(groupId, placeId);
  const myReview = useMyReview(groupId, placeId, userId);
  const removeFromGroup = useRemovePlaceFromGroup();
  const deleteReview = useDeleteReview();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [deleteReviewError, setDeleteReviewError] = useState<string | null>(null);
  const canModerateReviews = canManageMembers(active?.role);

  const cover = useSignedUrls(BUCKETS.placePhotos, [place.data?.cover_photo_path]);
  const coverUri = place.data?.cover_photo_path
    ? (cover.data?.[place.data.cover_photo_path] ?? null)
    : null;

  // Foto di tutte le recensioni, risolte in una sola chiamata.
  const reviewPhotoPaths = useMemo(
    () => (reviews.data ?? []).flatMap((r) => r.photos.map((p) => p.storage_path)),
    [reviews.data],
  );
  const reviewPhotos = useSignedUrls(BUCKETS.reviewPhotos, reviewPhotoPaths);

  const groupAverage: Scores | null = useMemo(() => {
    const s = scores.data;
    if (!s || s.avg_location == null) return null;
    return {
      location: Number(s.avg_location),
      service: Number(s.avg_service ?? 0),
      menu: Number(s.avg_menu ?? 0),
      value: Number(s.avg_value ?? 0),
    };
  }, [scores.data]);

  const mine: Scores | null = useMemo(() => {
    const r = myReview.data;
    if (!r) return null;
    return {
      location: r.score_location,
      service: r.score_service,
      menu: r.score_menu,
      value: r.score_value,
    };
  }, [myReview.data]);

  if (place.isLoading) {
    return (
      <Screen>
        <Header back />
        <LoadingState />
      </Screen>
    );
  }

  if (place.error || !place.data) {
    return (
      <Screen>
        <Header back />
        <ErrorState
          message={
            place.error ? friendlyError(place.error, 'places').message : 'Posto non trovato.'
          }
          onRetry={() => void place.refetch()}
        />
      </Screen>
    );
  }

  const p = place.data;
  const reviewCount = scores.data?.review_count ?? 0;

  return (
    <Screen padded={false} scroll={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[8] }}>
        {/* Copertina: le foto degli utenti vengono prima di quelle Google,
            perche' sono il contenuto vero dell'app e non costano nulla. */}
        <View style={{ height: 220, backgroundColor: theme.colors.bgRaised }}>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={220}
              accessibilityIgnoresInvertColors
              accessibilityLabel={`Foto di ${p.name}`}
            />
          ) : null}
        </View>

        <View style={{ paddingHorizontal: theme.spacing[4], marginTop: -theme.spacing[5] }}>
          <Header back style={{ marginBottom: 0 }} />

          <View style={{ gap: theme.spacing[2], marginBottom: theme.spacing[4] }}>
            <Text variant="title">{p.name}</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing[2], flexWrap: 'wrap' }}>
              {p.address ? (
                <Text variant="caption" color="secondary">
                  {p.address}
                </Text>
              ) : null}
              {p.cuisine ? <Chip label={p.cuisine} /> : null}
            </View>
            {p.notes ? (
              <Text variant="body" color="secondary">
                {p.notes}
              </Text>
            ) : null}
          </View>

          {/* Sezione ufficiale: sempre live, mai persistita (vedi §12). */}
          {p.google_place_id ? (
            <View style={{ marginBottom: theme.spacing[4] }}>
              <OfficialInfoCard googlePlaceId={p.google_place_id} />
              {p.official_override_pending ? (
                <Button
                  label="Sostituisci con i dati ufficiali"
                  variant="secondary"
                  icon="refresh"
                  full
                  style={{ marginTop: theme.spacing[2] }}
                  onPress={() => router.push(`/place/${placeId}/sync`)}
                />
              ) : null}
            </View>
          ) : (
            <Card style={{ marginBottom: theme.spacing[4] }}>
              <View style={{ gap: theme.spacing[3] }}>
                <Text variant="label" uppercase color="secondary">
                  Non collegato a Google Maps
                </Text>
                <Text variant="caption" color="secondary">
                  Collegalo per vedere valutazione, orari e fascia di prezzo ufficiali.
                </Text>
                <Button
                  label="Sincronizza con Google Maps"
                  variant="secondary"
                  icon="link"
                  onPress={() => router.push(`/place/${placeId}/sync`)}
                />
              </View>
            </Card>
          )}

          {/* Il voto del gruppo, con la tua recensione sovrapposta. */}
          <Card style={{ marginBottom: theme.spacing[4] }}>
            <View style={{ gap: theme.spacing[4] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label" uppercase color="secondary">
                  {active?.group.is_personal ? 'Il tuo voto' : 'Il voto del gruppo'}
                </Text>
                <ScoreBadge score={scores.data?.avg_overall ?? null} />
              </View>

              {groupAverage ? (
                <>
                  <View style={{ alignItems: 'center' }}>
                    <Diamond
                      scores={groupAverage}
                      overlay={mine && reviewCount > 1 ? mine : null}
                      scale="hero"
                      size={220}
                      showAxes
                      showLabels
                    />
                  </View>

                  {mine && reviewCount > 1 ? (
                    <Text variant="caption" color="secondary" align="center">
                      Sagoma piena: media del gruppo. Contorno: la tua recensione.
                    </Text>
                  ) : null}

                  <View style={{ gap: theme.spacing[3] }}>
                    {CRITERIA.map((c) => (
                      <CriterionBar
                        key={c}
                        criterion={c}
                        value={groupAverage[c]}
                        compare={mine && reviewCount > 1 ? mine[c] : null}
                      />
                    ))}
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingTop: theme.spacing[2],
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.borderSubtle,
                    }}
                  >
                    <Text variant="caption" color="secondary">
                      {pluralize(reviewCount, 'recensione', 'recensioni')}
                    </Text>
                    {scores.data?.avg_cost_per_person_cents != null ? (
                      <Text variant="caption" color="secondary">
                        {formatCents(scores.data.avg_cost_per_person_cents)} a testa
                      </Text>
                    ) : null}
                  </View>
                </>
              ) : (
                <EmptyState
                  icon="star"
                  title="Ancora nessun voto"
                  message="Sii il primo a dire com era."
                />
              )}
            </View>
          </Card>

          <Button
            label={myReview.data ? 'Modifica la tua recensione' : 'Recensisci'}
            icon="edit"
            full
            style={{ marginBottom: theme.spacing[5] }}
            onPress={() => router.push(`/place/${placeId}/review`)}
          />

          {reviews.data && reviews.data.length > 0 ? (
            <View style={{ gap: theme.spacing[3] }}>
              <Text variant="label" uppercase color="secondary">
                Recensioni
              </Text>
              {deleteReviewError ? <ErrorState compact message={deleteReviewError} /> : null}
              {reviews.data.map((r) => {
                const isMine = r.author.id === userId;
                return (
                  <ReviewCard
                    key={r.review.id}
                    review={r.review}
                    author={r.author}
                    photos={r.photos}
                    photoUrls={reviewPhotos.data ?? {}}
                    avatarUri={publicUrl(BUCKETS.avatars, r.author.avatar_path)}
                    isMine={isMine}
                    canModerate={!isMine && canModerateReviews}
                    onEdit={() => router.push(`/place/${placeId}/review`)}
                    onMove={() =>
                      router.push({
                        pathname: '/review/[id]/move',
                        params: { id: r.review.id, placeId, from: groupId ?? '' },
                      })
                    }
                    onDelete={() => {
                      if (!groupId) return;
                      setDeleteReviewError(null);
                      deleteReview.mutate(
                        {
                          reviewId: r.review.id,
                          groupId,
                          placeId,
                          authorId: r.author.id,
                        },
                        {
                          onError: (e) => setDeleteReviewError(friendlyError(e, 'reviews').message),
                        },
                      );
                    }}
                  />
                );
              })}
            </View>
          ) : null}

          {active && canRemovePlaceFromGroup(active.memberCount, active.role) ? (
            <View style={{ marginTop: theme.spacing[6], gap: theme.spacing[2] }}>
              {removeError ? <ErrorState compact message={removeError} /> : null}
              <Button
                label="Rimuovi dal gruppo"
                variant="danger"
                icon="trash"
                full
                loading={removeFromGroup.isPending}
                onPress={async () => {
                  if (!groupId) return;
                  setRemoveError(null);
                  try {
                    await removeFromGroup.mutateAsync({ groupId, placeId });
                    router.back();
                  } catch (e) {
                    setRemoveError(friendlyError(e, 'places').message);
                  }
                }}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
