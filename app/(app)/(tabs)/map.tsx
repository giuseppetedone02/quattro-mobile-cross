import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, {
  Callout,
  Marker,
  PROVIDER_GOOGLE,
  type LatLng,
  type Region,
} from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Chip, EmptyState, IconButton, ScoreBadge, Text, PressScale } from '@/components/ui';
import { Icon } from '@/components/icons';
import { GroupSwitcher } from '@/features/groups';
import { cuisineOptionsFrom, usePlaces, type PlaceListItem } from '@/features/places';
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

/** Un punto di interesse di Google Maps toccato sulla mappa (non ancora un
 *  posto dell'app): solo cio' che l'evento nativo ci da', nessuna copia di
 *  contenuto Google oltre il place_id -- la conferma/i dati veri arrivano
 *  dalla nostra Edge Function quando l'utente sceglie "Aggiungi posto",
 *  esattamente come nel percorso di ricerca (vedi §12 del piano). */
type MapPoi = { placeId: string; name: string; coordinate: LatLng };

export default function MapTab() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

  const { groups, active } = useActiveGroupResolved();
  const places = usePlaces(active?.group.id);
  const [selected, setSelected] = useState<PlaceListItem | null>(null);
  const [poi, setPoi] = useState<MapPoi | null>(null);
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);

  const pinned = useMemo(
    () => (places.data ?? []).filter((i) => i.place.lat != null && i.place.lng != null),
    [places.data],
  );

  // Categorie derivate dai posti pinnati del gruppo attivo (il campo
  // "cuisine" e' testo libero, non un enum: non c'e' un elenco fisso di tipi
  // lato server, quindi il filtro propone quelle davvero presenti fra i posti
  // mostrabili sulla mappa). Stessa funzione usata da PlaceForm per
  // l'autocomplete in fase di inserimento, li' pero' su tutti i posti del
  // gruppo e non solo quelli con coordinate.
  const cuisineOptions = useMemo(() => cuisineOptionsFrom(pinned), [pinned]);

  const filtered = useMemo(() => {
    if (!cuisineFilter) return pinned;
    return pinned.filter(
      (item) => (item.place.cuisine ?? '').trim().toLowerCase() === cuisineFilter,
    );
  }, [pinned, cuisineFilter]);

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

  function closeCards() {
    setSelected(null);
    setPoi(null);
  }

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
        onPress={closeCards}
        // Tap su un punto di interesse gia' disegnato da Google Maps (un
        // ristorante, una pizzeria...) NON ancora aggiunto all'app.
        // react-native-maps lo supporta su Android sempre, e su iOS solo con
        // PROVIDER_GOOGLE -- che e' esattamente il provider usato qui su
        // entrambe le piattaforme (vedi il commento sul provider piu' sopra),
        // quindi il pulsante "Aggiungi posto" del POI funziona ovunque.
        onPoiClick={(e) => {
          setSelected(null);
          setPoi({
            placeId: e.nativeEvent.placeId,
            name: e.nativeEvent.name,
            coordinate: e.nativeEvent.coordinate,
          });
        }}
      >
        {filtered.map((item) => (
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
            onPress={() => {
              setPoi(null);
              setSelected(item);
            }}
          >
            {/* Un <Callout> vuoto e "tooltip" sostituisce quello di default:
                senza, oltre alla nostra card in fondo allo schermo compariva
                ANCHE il fumetto bianco del sistema (titolo in grassetto +
                sottotitolo, nessuno stile) -- un doppio riquadro per lo
                stesso tap. title/description restano sul Marker per il
                lettore di schermo, ma non disegnano piu' nulla di visibile:
                la card qui sotto e' l'unica UI di dettaglio, pensata per il
                tema dell'app. */}
            <Callout tooltip>
              <View />
            </Callout>
          </Marker>
        ))}

        {poi ? (
          <Marker
            coordinate={poi.coordinate}
            title={poi.name}
            pinColor={theme.colors.criterionLocation}
          >
            <Callout tooltip>
              <View />
            </Callout>
          </Marker>
        ) : null}
      </MapView>

      {/* Selettore di gruppo e filtro tipo locale, sovrapposti: la mappa
          segue il gruppo attivo e il filtro resta locale a questa vista. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + theme.spacing[2],
          left: 0,
          right: 0,
          gap: theme.spacing[2],
        }}
      >
        <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[2] }}>
          {groups.length > 0 ? <GroupSwitcher groups={groups} /> : null}
        </View>

        {cuisineOptions.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing[2],
              paddingHorizontal: theme.spacing[4],
            }}
          >
            <Chip
              label="Tutti"
              selected={cuisineFilter === null}
              onPress={() => setCuisineFilter(null)}
            />
            {cuisineOptions.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={cuisineFilter === c.toLowerCase()}
                onPress={() =>
                  setCuisineFilter(cuisineFilter === c.toLowerCase() ? null : c.toLowerCase())
                }
              />
            ))}
          </View>
        ) : null}

        {missingCoords > 0 ? (
          <Chip
            label={`${missingCoords} senza posizione`}
            icon="info"
            style={{ alignSelf: 'flex-start', marginLeft: theme.spacing[4] }}
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

      {/* Scheda del pin selezionato: un posto gia' nell'app */}
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
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.accentMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="pin" size={20} color={theme.colors.accentBase} />
                </View>
                <View style={{ flex: 1, gap: theme.spacing[1] }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {selected.place.name}
                  </Text>
                  {selected.place.address ? (
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {selected.place.address}
                    </Text>
                  ) : null}
                  {selected.place.cuisine ? (
                    <Chip label={selected.place.cuisine} style={{ alignSelf: 'flex-start' }} />
                  ) : null}
                </View>
                <ScoreBadge score={selected.scores?.avg_overall ?? null} />
              </View>
            </Card>
          </PressScale>
        </View>
      ) : poi ? (
        // Scheda di un POI di Google Maps non ancora nell'app: lo stesso
        // ruolo del risultato di ricerca in "Aggiungi posto", raggiunto da
        // un tap sulla mappa invece che dalla barra di ricerca.
        <View
          style={{
            position: 'absolute',
            left: theme.spacing[4],
            right: theme.spacing[4],
            bottom: insets.bottom + theme.spacing[5],
          }}
        >
          <Card elevation={3}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.bgRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="map" size={20} color={theme.colors.criterionLocation} />
              </View>
              <View style={{ flex: 1, gap: theme.spacing[1] }}>
                <Text variant="subheading" numberOfLines={1}>
                  {poi.name}
                </Text>
                <Text variant="caption" color="secondary">
                  Da Google Maps · non ancora nell app
                </Text>
              </View>
            </View>
            <View style={{ marginTop: theme.spacing[3] }}>
              <Chip
                label="Aggiungi posto"
                icon="plus"
                selected
                onPress={() =>
                  router.push({ pathname: '/place/add', params: { placeId: poi.placeId } })
                }
              />
            </View>
          </Card>
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
      ) : filtered.length === 0 && cuisineFilter && !places.isLoading ? (
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
              icon="search"
              title="Nessun posto in questa categoria"
              message="Prova un altro filtro, o mostra di nuovo tutti i posti."
              actionLabel="Mostra tutti"
              onAction={() => setCuisineFilter(null)}
            />
          </Card>
        </View>
      ) : null}
    </View>
  );
}
