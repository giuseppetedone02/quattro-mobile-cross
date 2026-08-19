import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { EmptyState } from './States';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type GroupPickerItem = { id: string; name: string; isPersonal: boolean };

export type GroupPickerRowProps = {
  groups: GroupPickerItem[];
  onPick: (groupId: string) => void;
  /** id del gruppo su cui l'operazione e' in corso. */
  busyId?: string | null;
};

/** Lista verticale di gruppi selezionabili, usata per lo spostamento. */
export function GroupPickerRow({ groups, onPick, busyId = null }: GroupPickerRowProps) {
  const theme = useTheme();

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Nessun altro gruppo"
        message="Crea un altro gruppo per poterci spostare le recensioni."
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing[2] }}>
      {groups.map((g) => (
        <PressScale
          key={g.id}
          accessibilityRole="button"
          accessibilityLabel={`Sposta in ${g.name}`}
          accessibilityState={{ busy: busyId === g.id }}
          disabled={busyId !== null}
          onPress={() => onPick(g.id)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[3],
            padding: theme.spacing[4],
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.bgSurface,
            opacity: busyId !== null && busyId !== g.id ? 0.5 : 1,
          }}
        >
          <Icon
            name={g.isPersonal ? 'star' : 'users'}
            size={20}
            color={theme.colors.accentBase}
          />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {g.name}
          </Text>
          <Icon name="move" size={18} color={theme.colors.textSecondary} />
        </PressScale>
      ))}
    </View>
  );
}
