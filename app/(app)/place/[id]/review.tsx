import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { ErrorState, LoadingState } from '@/components/ui';
import {
  ReviewComposer, useMyReview, useSubmitReview, type ReviewFormValues,
} from '@/features/reviews';
import { usePlace } from '@/features/places';
import { useSupabaseSession } from '@/features/auth/hooks/useSession';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { friendlyError } from '@/lib/errors';

export default function ReviewPlace() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = id ?? '';

  const { session } = useSupabaseSession();
  const userId = session?.user.id;
  const { active } = useActiveGroupResolved();
  const groupId = active?.group.id;

  const place = usePlace(placeId);
  const existing = useMyReview(groupId, placeId, userId);
  const submit = useSubmitReview();
  const [error, setError] = useState<string | null>(null);

  async function save(values: ReviewFormValues) {
    if (!groupId || !userId) return;
    setError(null);
    try {
      await submit.mutateAsync({
        groupId,
        placeId,
        authorId: userId,
        scores: values.scores,
        billTotalCents: values.billTotalCents,
        partySize: values.partySize,
        comment: values.comment.trim() || null,
        visitedOn: values.visitedOn,
        photos: values.photos,
      });
      router.back();
    } catch (e) {
      setError(friendlyError(e, 'reviews').message);
    }
  }

  if (place.isLoading || existing.isLoading) {
    return (
      <Screen>
        <Header close />
        <LoadingState />
      </Screen>
    );
  }

  const r = existing.data;

  return (
    <Screen scroll avoidKeyboard>
      <Header
        close
        title={r ? 'Modifica la recensione' : 'Recensisci'}
        subtitle={place.data?.name}
      />

      {error ? <ErrorState compact message={error} /> : null}

      <ReviewComposer
        submitting={submit.isPending}
        onSubmit={(v) => void save(v)}
        // Una recensione per persona per luogo per gruppo (decisione 22.4):
        // se esiste, il compositore parte dai valori attuali e l'upsert
        // aggiorna invece di creare.
        initial={
          r
            ? {
                scores: {
                  location: r.score_location,
                  service: r.score_service,
                  menu: r.score_menu,
                  value: r.score_value,
                },
                billTotalCents: r.bill_total_cents,
                partySize: r.party_size,
                comment: r.comment ?? '',
                visitedOn: r.visited_on,
              }
            : undefined
        }
      />
    </Screen>
  );
}
