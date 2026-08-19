import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Card, ErrorState, LoadingState, Text } from '@/components/ui';
import { PlaceForm, usePlace, useUpdatePlace, type PlaceFormValues } from '@/features/places';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { friendlyError } from '@/lib/errors';
import { BUCKETS, uploadPhoto } from '@/lib/photos';
import * as Crypto from 'expo-crypto';
import { useTheme } from '@/theme';

export default function EditPlace() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = id ?? '';

  const { groups, active } = useActiveGroupResolved();
  const place = usePlace(placeId);
  const update = useUpdatePlace();
  const [error, setError] = useState<string | null>(null);

  const formGroups = useMemo(
    () =>
      groups.map((g) => ({
        id: g.group.id,
        name: g.group.name,
        isPersonal: g.group.is_personal,
      })),
    [groups],
  );

  async function submit(values: PlaceFormValues) {
    setError(null);
    try {
      // La copertina si carica qui e passa come path: useUpdatePlace scrive
      // solo colonne, non gestisce upload.
      let coverPath: string | null | undefined;
      if (values.coverPhoto) {
        const uploaded = await uploadPhoto(
          BUCKETS.placePhotos,
          `${placeId}/${Crypto.randomUUID()}.webp`,
          values.coverPhoto,
        );
        coverPath = uploaded.path;
      } else if (!values.coverPhoto) {
        coverPath = null;
      }

      await update.mutateAsync({
        placeId,
        groupId: active?.group.id,
        values: {
          name: values.name,
          address: values.address || null,
          cuisine: values.cuisine || null,
          notes: values.notes || null,
          lat: values.lat,
          lng: values.lng,
          ...(coverPath !== undefined ? { cover_photo_path: coverPath } : {}),
        },
      });
      router.back();
    } catch (e) {
      setError(friendlyError(e, 'places').message);
    }
  }

  if (place.isLoading) {
    return (
      <Screen>
        <Header close />
        <LoadingState />
      </Screen>
    );
  }

  if (!place.data) {
    return (
      <Screen>
        <Header close />
        <ErrorState message="Posto non trovato." />
      </Screen>
    );
  }

  const p = place.data;

  return (
    <Screen scroll avoidKeyboard>
      <Header close title="Modifica il posto" subtitle={p.name} />

      {error ? <ErrorState compact message={error} /> : null}

      {p.google_place_id && !p.official_override_pending ? (
        <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised, marginBottom: theme.spacing[4] }}>
          <Text variant="caption" color="secondary">
            Questo posto usa i dati ufficiali di Google Maps. Se li modifichi qui, diventano
            tuoi e non verranno piu sovrascritti.
          </Text>
        </Card>
      ) : null}

      <PlaceForm
        groups={formGroups}
        defaultGroupId={active?.group.id ?? formGroups[0]?.id ?? ''}
        submitting={update.isPending}
        onSubmit={(v) => void submit(v)}
        initial={{
          name: p.name,
          address: p.address ?? '',
          cuisine: p.cuisine ?? '',
          notes: p.notes ?? '',
          lat: p.lat,
          lng: p.lng,
          googlePlaceId: p.google_place_id,
          source: p.source,
        }}
      />
    </Screen>
  );
}
