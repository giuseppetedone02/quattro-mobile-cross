import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card, Chip, EmptyState, IconButton, ScoreBadge, Text, PressScale,
} from '@/components/ui';
import { GroupSwitcher } from '@/features/groups';
import { usePlaces, type PlaceListItem } from '@/features/places';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { formatScore } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * PROVIDER_GOOGLE su ENTRAMBE le piattaforme.
 *
 * Su iOS questo richiede il pod react-native-maps/Google, aggiunto dal config
 * plugin quando iosGoogleMapsApiKey e' valorizzata, e una development build:
 * in Expo Go si otterrebbe l'errore "AirGoogleMaps dir must be added".
 *
 * Non e' una preferenza estetica: i Maps Service Specific Terms §14.2 vietano
 * di usare dati Places su una mappa non-Google.
 *
 * NON impostare googleMapId: sposterebbe la fatturazione dalla SKU gratuita
 * "Maps SDK" a "Dynamic Maps" ($7 per 1.000 dopo 10.000/mese).
 */
const ITALY: Region = {
  latitude: 41.9,
  longitude: 12.5,
  latitudeDelta: 9,
  longitudeDelta: 9,
};

export default function MapTab() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const { groups, active } = useActiveGroupResolved();
  const places = usePlaces(active?.group.id);
  const [selected, setSelected] = useState<PlaceListItem | null>(null);

  const pinned = useMemo(
    () => (places.data ?? []).filter((i) => i.place.lat != null && i.place.lng != null),
    [places.data],
  );

  const initialRegion = useMemo<Region>(() => {
    const first = pinned[0];
    if (!first || first.place.lat == null || first.place.lng == null) return ITALY;
    return {
      latitude: first.place.lat,
      longitude: first.place.lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [pinned]);

  const missingCoords = (places.data?.length ?? 0) - pinned.length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgCanvas }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {pinned.map((item) => (
          <Marker
            key={item.place.id}
            coordinate={{ latitude: item.place.lat as number, longitude: item.place.lng as number }}
            title={item.place.name}
            description={
              item.scores?.avg_overall != null
                ? `${formatScore(item.scores.avg_overall)} su 10`
                : 'Ancora nessun voto'
            }
            pinColor={theme.colors.accentBase}
            onPress={() => setSelected(item)}
          />
        ))}
      </MapView>

      {/* Selettore di gruppo sovrapposto: la mappa segue il gruppo attivo. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + theme.spacing[2],
          left: 0,
          right: 0,
          paddingHorizontal: theme.spacing[4],
          gap: theme.spacing[2],
        }}
      >
        {groups.length > 0 ? <GroupSwitcher groups={groups} /> : null}
        {missingCoords > 0 ? (
          <Chip
            label={`${missingCoords} senza posizione`}
            icon="info"
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </View>

      <View
        style={{
          position: 'absolute',
          right: theme.spacing[4],
          bottom: insets.bottom + theme.spacing[5],
          gap: theme.spacing[2],
        }}
      >
        <IconButton
          icon="plus"
          accessibilityLabel="Aggiungi un posto"
          variant="filled"
          size={52}
          onPress={() => router.push('/place/add')}
        />
      </View>

      {/* Scheda del pin selezionato */}
      {selected ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spacing[4],
            right: theme.spacing[4],
            bottom: insets.bottom + theme.spacing[5],
          }}
        >
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`Apri ${selected.place.name}`}
            onPress={() => router.push(`/place/${selected.place.id}`)}
          >
            <Card elevation={3}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {selected.place.name}
                  </Text>
                  {selected.place.address ? (
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {selected.place.address}
                    </Text>
                  ) : null}
                </View>
                <ScoreBadge score={selected.scores?.avg_overall ?? null} />
              </View>
            </Card>
          </PressScale>
        </View>
      ) : pinned.length === 0 && !places.isLoading ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spacing[4],
            right: theme.spacing[4],
            bottom: insets.bottom + theme.spacing[5],
          }}
        >
          <Card elevation={3}>
            <EmptyState
              icon="pin"
              title="Nessun posto sulla mappa"
              message="I posti con una posizione compaiono qui."
              actionLabel="Aggiungi un posto"
              onAction={() => router.push('/place/add')}
            />
          </Card>
        </View>
      ) : null}
    </View>
  );
}
