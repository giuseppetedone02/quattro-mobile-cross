import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { Button, Card, Text } from '@/components/ui';

export type GoogleSyncCompareProps = {
  mine: { name: string; address: string };
  official: { name: string; address: string };
  onKeep: () => void;
  onReplace: () => void;
  busy?: boolean;
};

/**
 * Confronto affiancato del requisito 3.2.1.
 *
 * Le due risposte non sono "collega" e "non collegare": in entrambi i casi il
 * google_place_id viene scritto. Cambia solo se i dati ufficiali sostituiscono
 * quelli inseriti a mano -- e se l'utente li mantiene, il flag
 * official_override_pending resta acceso e il pulsante di sostituzione resta
 * disponibile nella scheda.
 */
export function GoogleSyncCompare({
  mine,
  official,
  onKeep,
  onReplace,
  busy = false,
}: GoogleSyncCompareProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing[5] }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
        <Column
          title="I tuoi dati"
          icon="user"
          name={mine.name}
          address={mine.address}
          accent={false}
        />
        <Column
          title="Da Google Maps"
          icon="google"
          name={official.name}
          address={official.address}
          accent
        />
      </View>

      <Text variant="subheading" align="center">
        Vuoi sostituire i dati che hai inserito con quelli ufficiali di Google Maps?
      </Text>

      <View style={{ gap: theme.spacing[3] }}>
        <Button
          label="Usa gli ufficiali"
          icon="check"
          onPress={onReplace}
          loading={busy}
          disabled={busy}
          full
        />
        <Button label="Mantieni i miei" variant="secondary" onPress={onKeep} disabled={busy} full />
      </View>
    </View>
  );
}

function Column({
  title,
  icon,
  name,
  address,
  accent,
}: {
  title: string;
  icon: 'user' | 'google';
  name: string;
  address: string;
  accent: boolean;
}) {
  const theme = useTheme();

  return (
    <Card
      style={{
        flex: 1,
        gap: theme.spacing[2],
        borderWidth: 1.5,
        borderColor: accent ? theme.colors.accentBase : theme.colors.borderSubtle,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Icon
          name={icon}
          size={14}
          color={accent ? theme.colors.accentBase : theme.colors.textSecondary}
        />
        <Text variant="label" uppercase color={accent ? 'accent' : 'secondary'}>
          {title}
        </Text>
      </View>
      <Text variant="bodyStrong">{name || '--'}</Text>
      <Text variant="caption" color="secondary">
        {address || 'Nessun indirizzo'}
      </Text>
    </Card>
  );
}
