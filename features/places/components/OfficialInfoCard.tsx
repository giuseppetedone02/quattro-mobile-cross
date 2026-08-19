import React, { useCallback } from 'react';
import { Linking, View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { Button, Card, ErrorState, IconButton, LoadingState, Text } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { formatScore, pluralize } from '@/lib/format';
import { priceLevelLabel } from '@/features/places/api/googlePlaces';
import { useGooglePlaceDetails } from '@/features/places/hooks/usePlaces';

export type OfficialInfoCardProps = {
  /** L'id della scheda ufficiale. Con null il pannello non si mostra. */
  googlePlaceId: string | null;
};

/**
 * Pannello dei dati ufficiali della scheda luogo.
 *
 * NIENTE di quello che si vede qui viene salvato: valutazione, numero di voti,
 * fascia di prezzo e orari arrivano a ogni apertura dalla Edge Function
 * places-details, la cui unica cache e' lato server con TTL breve. Nel client
 * la chiave di query inizia con 'google' e il persister la scarta, quindi non
 * finisce nemmeno su disco. L'attribuzione "Da Google Maps" e' obbligatoria.
 */
export function OfficialInfoCard({ googlePlaceId }: OfficialInfoCardProps) {
  const theme = useTheme();
  const details = useGooglePlaceDetails(googlePlaceId);

  const openInMaps = useCallback(() => {
    const uri = details.data?.googleMapsUri;
    if (uri) void Linking.openURL(uri);
  }, [details.data?.googleMapsUri]);

  if (!googlePlaceId) return null;

  const data = details.data;
  const todayHours = data?.weekdayDescriptions ? hoursForToday(data.weekdayDescriptions) : null;
  const price = priceLevelLabel(data?.priceLevel);

  return (
    <Card style={{ gap: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Icon name="google" size={16} color={theme.colors.textSecondary} />
        <Text variant="label" uppercase color="secondary" style={{ flex: 1 }}>
          Da Google Maps
        </Text>
        <IconButton
          icon="refresh"
          accessibilityLabel="Aggiorna i dati ufficiali"
          size={36}
          disabled={details.isFetching}
          onPress={() => void details.refetch()}
        />
      </View>

      {details.isPending ? (
        <LoadingState label="Leggo la scheda ufficiale..." />
      ) : details.isError ? (
        <ErrorState
          message={friendlyError(details.error).message}
          onRetry={() => void details.refetch()}
          compact
        />
      ) : data ? (
        <View style={{ gap: theme.spacing[3] }} accessibilityLiveRegion="polite">
          <View
            accessible
            accessibilityLabel={
              data.rating != null
                ? `Valutazione Google ${formatScore(data.rating)} su 5, ${pluralize(
                    data.userRatingCount ?? 0,
                    'voto',
                    'voti',
                  )}`
                : 'Nessuna valutazione su Google'
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}
          >
            <Icon name="star" size={18} color={theme.colors.warning} />
            <Text variant="bodyStrong">
              {data.rating != null ? formatScore(data.rating) : '--'}
            </Text>
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              {data.userRatingCount != null
                ? pluralize(data.userRatingCount, 'voto', 'voti')
                : 'nessun voto'}
            </Text>
            {price ? (
              <Text variant="caption" color="secondary">
                {price}
              </Text>
            ) : null}
          </View>

          {data.openNow != null || todayHours ? (
            <View
              accessible
              accessibilityLabel={[
                data.openNow == null ? null : data.openNow ? 'Aperto adesso' : 'Chiuso adesso',
                todayHours,
              ]
                .filter(Boolean)
                .join('. ')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: theme.radii.full,
                  backgroundColor: data.openNow ? theme.colors.success : theme.colors.danger,
                }}
              />
              <Text variant="caption" color={data.openNow ? 'success' : 'secondary'}>
                {data.openNow == null ? 'Orari' : data.openNow ? 'Aperto adesso' : 'Chiuso adesso'}
              </Text>
              {todayHours ? (
                <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                  {todayHours}
                </Text>
              ) : null}
            </View>
          ) : null}

          {data.googleMapsUri ? (
            <Button
              label="Apri in Maps"
              variant="secondary"
              size="sm"
              iconRight="external"
              onPress={openInMaps}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Google restituisce weekdayDescriptions a partire da lunedi', mentre
 * Date.getDay() parte da domenica: senza la rotazione si mostrerebbero gli
 * orari del giorno sbagliato.
 */
export function hoursForToday(descriptions: string[], now: Date = new Date()): string | null {
  if (descriptions.length !== 7) return descriptions[0] ?? null;
  const index = (now.getDay() + 6) % 7;
  return descriptions[index] ?? null;
}
