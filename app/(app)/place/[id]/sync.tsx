import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import {
  Card, EmptyState, ErrorState, LoadingState, PressScale, SearchField, Text,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import {
  GoogleSyncCompare, getPlaceDetails, useGooglePlaceSearch, useLinkPlaceToGoogle, usePlace,
  type GooglePlaceDetails,
} from '@/features/places';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Requisito 3.2.1. Il punto sottile e' il ramo "Mantieni i miei":
 * il collegamento avviene COMUNQUE, e official_override_pending resta true,
 * cosi' il pulsante di sostituzione resta disponibile nella scheda.
 */
export default function SyncWithGoogle() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const placeId = id ?? '';

  const { active } = useActiveGroupResolved();
  const place = usePlace(placeId);
  const search = useGooglePlaceSearch();
  const link = useLinkPlaceToGoogle();

  const [candidate, setCandidate] = useState<GooglePlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precompila la ricerca col nome inserito a mano: nove volte su dieci basta.
  const [primed, setPrimed] = useState(false);
  if (!primed && place.data?.name) {
    setPrimed(true);
    search.setQuery(place.data.name);
  }

  async function pick(googlePlaceId: string) {
    setError(null);
    setLoadingDetails(true);
    try {
      setCandidate(await getPlaceDetails(googlePlaceId));
      search.resetSession();
    } catch (e) {
      setError(friendlyError(e).message);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function apply(overwrite: boolean) {
    if (!candidate) return;
    setError(null);
    try {
      await link.mutateAsync({
        placeId,
        googlePlaceId: candidate.placeId,
        overwrite,
        officialName: candidate.displayName,
        officialAddress: candidate.formattedAddress,
        lat: candidate.location?.latitude ?? null,
        lng: candidate.location?.longitude ?? null,
        groupId: active?.group.id,
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

  return (
    <Screen scroll avoidKeyboard>
      <Header close title="Sincronizza con Google Maps" subtitle={place.data.name} />

      {error ? <ErrorState compact message={error} /> : null}

      {candidate ? (
        <GoogleSyncCompare
          mine={{ name: place.data.name, address: place.data.address ?? '' }}
          official={{ name: candidate.displayName, address: candidate.formattedAddress }}
          busy={link.isPending}
          onKeep={() => void apply(false)}
          onReplace={() => void apply(true)}
        />
      ) : (
        <View style={{ gap: theme.spacing[4] }}>
          <Card elevation={0} style={{ backgroundColor: theme.colors.bgRaised }}>
            <Text variant="caption" color="secondary">
              Trova il locale su Google Maps per collegarlo. Il collegamento porta valutazione,
              orari e fascia di prezzo ufficiali, che restano sempre aggiornati.
            </Text>
          </Card>

          <SearchField
            value={search.query}
            onChangeText={search.setQuery}
            placeholder="Nome del locale o via"
            accessibilityLabel="Cerca il locale su Google Maps"
            loading={search.isSearching}
          />

          {loadingDetails ? <LoadingState label="Carico la scheda..." /> : null}

          {search.results.length > 0 ? (
            <View style={{ gap: theme.spacing[2] }}>
              {search.results.map((r) => (
                <PressScale
                  key={r.placeId}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.mainText}, ${r.secondaryText}`}
                  onPress={() => void pick(r.placeId)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing[3],
                    padding: theme.spacing[3],
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.bgSurface,
                  }}
                >
                  <Icon name="link" size={19} color={theme.colors.accentBase} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {r.mainText}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {r.secondaryText}
                    </Text>
                  </View>
                </PressScale>
              ))}
            </View>
          ) : search.query.trim().length >= 3 && !search.isSearching ? (
            <EmptyState
              icon="search"
              title="Nessun risultato"
              message="Prova col nome ufficiale del locale, o con la via."
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
