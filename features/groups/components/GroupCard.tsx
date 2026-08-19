import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Avatar, Card, Text } from '@/components/ui';
import { Icon } from '@/components/icons';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { pluralize } from '@/lib/format';
import type { GroupSummary } from '../hooks/useGroups';

export type GroupCardProps = {
  summary: GroupSummary;
  onPress?: () => void;
  /** Evidenzia il gruppo attivo nella lista. */
  selected?: boolean;
};

/**
 * Riga di un gruppo. L'icona distingue i due tipi anche senza leggere la
 * didascalia: stella per il gruppo personale, persone per quelli condivisi.
 * Il colore da solo non basterebbe.
 */
export function GroupCard({ summary, onPress, selected = false }: GroupCardProps) {
  const theme = useTheme();
  const { group, memberCount, placeCount } = summary;
  const personal = group.is_personal;

  const caption = personal
    ? `personale · ${pluralize(placeCount, 'posto', 'posti')}`
    : `${pluralize(memberCount, 'membro', 'membri')} · ${pluralize(placeCount, 'posto', 'posti')}`;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${group.name}. ${caption}`}
      accessibilityHint={onPress ? 'Apri il gruppo' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.accentBase : 'transparent',
      }}
    >
      <Avatar
        uri={publicUrl(BUCKETS.groupImages, group.image_path)}
        name={group.name}
        seed={group.id}
        size={52}
        square
      />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
          <Icon
            name={personal ? 'star' : 'users'}
            size={15}
            color={personal ? theme.colors.accentBase : theme.colors.textSecondary}
          />
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {group.name}
          </Text>
        </View>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {caption}
        </Text>
      </View>

      {onPress ? <Icon name="chevronRight" size={18} color={theme.colors.textSecondary} /> : null}
    </Card>
  );
}
