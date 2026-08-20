import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import {
  EmptyState, ErrorState, IconButton, PlaceRowSkeleton, SearchField, Text,
} from '@/components/ui';
import { GroupSwitcher } from '@/features/groups';
import { PlaceCard, usePlaces, type PlaceListItem } from '@/features/places';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { friendlyError } from '@/lib/errors';
import { BUCKETS } from '@/lib/photos';
import { useSignedUrls } from '@/lib/useSignedUrls';
import { pluralize } from '@/lib/format';
import { useTheme } from '@/theme';

export default function PlacesTab() {
  const theme = useTheme();
  const router = useRouter();
  const { groups, active, isLoading: groupsLoading, error: groupsError } = useActiveGroupResolved();
  const groupId = active?.group.id;

  const places = usePlaces(groupId);
  const [query, setQuery] = useState('');

  // place-photos e' un bucket privato: le copertine hanno bisogno di URL
  // firmati, risolti in un'unica chiamata per tutta la lista.
  const covers = useSignedUrls(
    BUCKETS.placePhotos,
    (places.data ?? []).map((i) => i.place.cover_photo_path),
  );

  const filtered = useMemo(() => {
    const items = places.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.place.name.toLowerCase().includes(q) ||
        (i.place.address ?? '').toLowerCase().includes(q) ||
        (i.place.cuisine ?? '').toLowerCase().includes(q),
    );
  }, [places.data, query]);

  if (groupsError) {
    return (
      <Screen>
        <ErrorState message={friendlyError(groupsError).message} onRetry={() => router.replace('/places')} />
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={{ top: true, bottom: false }}>
      <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              Posti
            </Text>
            {active ? (
              <Text variant="caption" color="secondary">
                {active.group.is_personal ? 'Solo tuoi' : active.group.name} ·{' '}
                {pluralize(places.data?.length ?? 0, 'posto', 'posti')}
              </Text>
            ) : null}
          </View>
          <IconButton
            icon="plus"
            accessibilityLabel="Aggiungi un posto"
            variant="filled"
            onPress={() => router.push('/place/add')}
          />
        </View>

        {groups.length > 0 ? <GroupSwitcher groups={groups} /> : null}

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Cerca tra i tuoi posti"
          accessibilityLabel="Cerca tra i posti del gruppo"
        />

        {/* La lista non viene mai svuotata per un errore di rete: resta
            quella dell'ultima sincronizzazione riuscita, con un banner sopra. */}
        {places.error && (places.data?.length ?? 0) > 0 ? (
          <ErrorState
            compact
            message={friendlyError(places.error).message}
            onRetry={() => void places.refetch()}
          />
        ) : null}
      </View>

      {groupsLoading || places.isLoading ? (
        <View style={{ paddingTop: theme.spacing[3] }}>
          <PlaceRowSkeleton />
          <PlaceRowSkeleton />
          <PlaceRowSkeleton />
        </View>
      ) : places.error && (places.data?.length ?? 0) === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            message={friendlyError(places.error).message}
            onRetry={() => void places.refetch()}
          />
        </View>
      ) : filtered.length === 0 ? (
        // Centrato nello spazio rimasto sotto la ricerca, non subito
        // attaccato ad essa: altrimenti lo stato vuoto si vede "in alto"
        // con un vuoto sotto invece che al centro dello schermo.
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon={query ? 'search' : 'pin'}
            title={query ? 'Nessun risultato' : 'Ancora nessun posto'}
            message={
              query
                ? 'Prova con un altro nome, o con la via.'
                : 'Aggiungi il primo posto dove hai mangiato e dagli un voto.'
            }
            actionLabel={query ? undefined : 'Aggiungi un posto'}
            onAction={query ? undefined : () => router.push('/place/add')}
          />
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item: PlaceListItem) => item.place.id}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing[4],
            paddingTop: theme.spacing[3],
            paddingBottom: theme.spacing[7],
          }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
          refreshControl={
            <RefreshControl
              refreshing={places.isRefetching}
              onRefresh={() => void places.refetch()}
              tintColor={theme.colors.accentBase}
            />
          }
          renderItem={({ item }: { item: PlaceListItem }) => (
            <PlaceCard
              place={item.place}
              scores={item.scores}
              coverUri={
                item.place.cover_photo_path
                  ? (covers.data?.[item.place.cover_photo_path] ?? null)
                  : null
              }
              onPress={() => router.push(`/place/${item.place.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}
