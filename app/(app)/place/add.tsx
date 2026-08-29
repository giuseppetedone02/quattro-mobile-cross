import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  PressScale,
  SearchField,
  Text,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import {
  PlaceForm,
  fetchPlaces,
  findSimilarPlace,
  getPlaceDetails,
  useAddPlace,
  useGooglePlaceSearch,
  type GooglePlaceDetails,
  type PlaceListItem,
  type PlaceFormValues,
} from '@/features/places';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

type Mode = 'google' | 'manual';

/**
 * I due percorsi del requisito 3 in una sola modale.
 *
 * Convergono entrambi su PlaceForm: la ricerca Google lo apre precompilato,
 * l'inserimento manuale lo apre vuoto. Un solo componente, due ingressi -- e
 * il form di conferma e' anche cio' che rende i dati salvati contenuto
 * dell'utente e non una copia del database Google (vedi §12 del piano).
 */
export default function AddPlace() {
  const theme = useTheme();
  const router = useRouter();
  // Arriva da un tap su un POI di Google Maps nella tab Mappa (vedi
  // "Aggiungi posto" li'): stesso percorso della ricerca testuale, solo che
  // il place_id e' gia' noto e si salta dritti alla scheda ufficiale, come
  // se l'utente lo avesse cercato e scelto lui dalla barra di ricerca.
  const { placeId: incomingPlaceId } = useLocalSearchParams<{ placeId?: string }>();
  const { groups, active } = useActiveGroupResolved();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>('google');
  const [picked, setPicked] = useState<GooglePlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  // Posto simile gia' nel gruppo (requisito 2.3): un avviso, non un blocco.
  // pendingValues tiene i dati del form finche' l'utente non decide se
  // salvare comunque o aprire quello trovato.
  const [duplicate, setDuplicate] = useState<PlaceListItem | null>(null);
  const [pendingValues, setPendingValues] = useState<PlaceFormValues | null>(null);

  const search = useGooglePlaceSearch();
  const addPlace = useAddPlace();

  const formGroups = useMemo(
    () =>
      groups.map((g) => ({ id: g.group.id, name: g.group.name, isPersonal: g.group.is_personal })),
    [groups],
  );

  async function choose(placeId: string) {
    setError(null);
    setLoadingDetails(true);
    try {
      const details = await getPlaceDetails(placeId);
      setPicked(details);
      // La sessione autocomplete termina qui, con la Place Details: da questo
      // momento il token va scartato.
      search.resetSession();
    } catch (e) {
      setError(friendlyError(e).message);
    } finally {
      setLoadingDetails(false);
    }
  }

  // Precarica automaticamente il posto arrivato da un POI della mappa, una
  // sola volta: senza il guard su `picked`/`loadingDetails` un secondo
  // render (es. dopo "Cambia locale") ripeterebbe la stessa chiamata.
  useEffect(() => {
    if (!incomingPlaceId || picked || loadingDetails) return;
    // queueMicrotask sposta le setState di `choose` fuori dalla fase
    // sincrona dell'effetto: chiamarle direttamente qui dentro (choose e'
    // async ma aggiorna lo stato prima del primo await) e' cio' che
    // react-hooks/set-state-in-effect segnala come cascata di render.
    queueMicrotask(() => void choose(incomingPlaceId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPlaceId]);

  async function save(values: PlaceFormValues) {
    await addPlace.mutateAsync({
      groupId: values.groupId,
      name: values.name,
      address: values.address || null,
      cuisine: values.cuisine || null,
      notes: values.notes || null,
      lat: values.lat,
      lng: values.lng,
      googlePlaceId: values.googlePlaceId,
      source: values.source,
      coverPhoto: values.coverPhoto,
    });
    router.back();
  }

  /**
   * Prima del salvataggio, un controllo di similarita' sul gruppo scelto nel
   * form (non necessariamente quello attivo, se l'utente lo ha cambiato):
   * stesso nome e, quando le coordinate ci sono, entro 200 metri (vedi
   * features/places/duplicates.ts). qc.fetchQuery invece di usePlaces perche'
   * il gruppo non e' noto finche' non si preme "Salva".
   */
  async function submit(values: PlaceFormValues) {
    setError(null);
    setCheckingDuplicate(true);
    try {
      const places = await qc.fetchQuery({
        queryKey: qk.places(values.groupId),
        queryFn: () => fetchPlaces(values.groupId),
      });
      const found = findSimilarPlace(places, {
        name: values.name,
        lat: values.lat,
        lng: values.lng,
      });
      if (found) {
        setDuplicate(found);
        setPendingValues(values);
        return;
      }
      await save(values);
    } catch (e) {
      setError(friendlyError(e, 'places').message);
    } finally {
      setCheckingDuplicate(false);
    }
  }

  function dismissDuplicate() {
    setDuplicate(null);
    setPendingValues(null);
  }

  async function saveAnyway() {
    if (!pendingValues) return;
    const values = pendingValues;
    dismissDuplicate();
    setError(null);
    try {
      await save(values);
    } catch (e) {
      setError(friendlyError(e, 'places').message);
    }
  }

  function openDuplicate() {
    if (!duplicate) return;
    const id = duplicate.place.id;
    dismissDuplicate();
    router.push(`/place/${id}`);
  }

  // Una volta scelto un posto da Google, o passando a mano, si va al form.
  const showForm = mode === 'manual' || picked !== null;

  return (
    <Screen scroll avoidKeyboard>
      <Header
        close
        title="Aggiungi un posto"
        subtitle={picked ? 'Controlla e conferma i dati' : undefined}
      />

      {!showForm ? (
        <View style={{ gap: theme.spacing[4] }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2], justifyContent: 'center' }}>
            <Chip
              label="Cerca su Google"
              icon="search"
              selected={mode === 'google'}
              onPress={() => setMode('google')}
            />
            <Chip
              label="Inserisci a mano"
              icon="edit"
              selected={false}
              onPress={() => setMode('manual')}
            />
          </View>

          <SearchField
            value={search.query}
            onChangeText={search.setQuery}
            placeholder="Nome del locale o via"
            accessibilityLabel="Cerca un locale su Google Maps"
            loading={search.isSearching}
            autoFocus
          />

          <SearchField
            value={search.locality}
            onChangeText={search.setLocality}
            placeholder="Localita (es. Bari, Vicenza, Torino)"
            accessibilityLabel="Filtra per localita"
          />

          {search.error ? <ErrorState compact message={search.error} /> : null}
          {error ? <ErrorState compact message={error} /> : null}

          {loadingDetails ? <LoadingState label="Carico la scheda..." /> : null}

          {(search.query.trim().length > 0 || search.locality.trim().length > 0) &&
          search.query.trim().length < 3 &&
          search.locality.trim().length < 3 ? (
            <Text variant="caption" color="secondary">
              Scrivi almeno tre caratteri, nel nome o nella localita.
            </Text>
          ) : null}

          {search.results.length > 0 ? (
            <View style={{ gap: theme.spacing[2] }}>
              {search.results.map((r) => (
                <PressScale
                  key={r.placeId}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.mainText}, ${r.secondaryText}`}
                  onPress={() => void choose(r.placeId)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing[3],
                    padding: theme.spacing[3],
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.bgSurface,
                  }}
                >
                  <Icon name="pin" size={19} color={theme.colors.accentBase} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {r.mainText}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {r.secondaryText}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={theme.colors.textSecondary} />
                </PressScale>
              ))}
            </View>
          ) : (search.query.trim().length >= 3 || search.locality.trim().length >= 3) &&
            !search.isSearching ? (
            <EmptyState
              icon="search"
              title="Nessun risultato"
              message="Non lo trovi? Inseriscilo a mano: potrai collegarlo a Google Maps in un secondo momento."
              actionLabel="Inserisci a mano"
              onAction={() => setMode('manual')}
            />
          ) : (
            <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised }}>
              <Text variant="caption" color="secondary">
                Cerca il locale su Google Maps. Se non c e, puoi sempre inserirlo a mano e
                collegarlo dopo.
              </Text>
            </Card>
          )}
        </View>
      ) : (
        <View style={{ gap: theme.spacing[4] }}>
          {error ? <ErrorState compact message={error} /> : null}

          {duplicate ? (
            // Sopra il form, non al suo posto: il form resta montato con i
            // dati che l'utente ha gia' scritto, nel caso scelga di
            // correggerli invece di salvare o aprire il posto esistente.
            <Card style={{ gap: theme.spacing[3] }}>
              <Text variant="bodyStrong">
                Esiste gia un posto simile in questo gruppo: {duplicate.place.name}
              </Text>
              <Text variant="caption" color="secondary">
                Vuoi aprire quello invece di salvarne uno nuovo?
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                <Button label="Apri quello" onPress={openDuplicate} />
                <Button
                  label="Salva comunque"
                  variant="ghost"
                  loading={addPlace.isPending}
                  onPress={() => void saveAnyway()}
                />
                <Button label="Modifica" variant="ghost" onPress={dismissDuplicate} />
              </View>
            </Card>
          ) : null}

          <PlaceForm
            groups={formGroups}
            defaultGroupId={active?.group.id ?? formGroups[0]?.id ?? ''}
            googleSource={picked}
            submitting={addPlace.isPending || checkingDuplicate}
            onSubmit={(v) => void submit(v)}
            initial={
              picked
                ? {
                    name: picked.displayName,
                    address: picked.formattedAddress,
                    lat: picked.location?.latitude ?? null,
                    lng: picked.location?.longitude ?? null,
                    googlePlaceId: picked.placeId,
                    source: 'google',
                  }
                : undefined
            }
          />

          <Chip
            label={picked ? 'Cambia locale' : 'Cerca invece su Google'}
            icon="arrowLeft"
            onPress={() => {
              setPicked(null);
              setMode('google');
            }}
          />
        </View>
      )}
    </Screen>
  );
}
