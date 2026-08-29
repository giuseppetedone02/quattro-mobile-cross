import React, { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/theme';
import { Avatar, Chip, Text } from '@/components/ui';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { useActiveGroup } from '@/lib/store';
import type { GroupSummary } from '../hooks/useGroups';

export type GroupSwitcherProps = { groups: GroupSummary[] };

/**
 * Selettore globale del gruppo, condiviso da Posti e Mappa.
 *
 * Sta nello store persistito e non in un parametro di rotta: il gruppo scelto
 * deve sopravvivere al cambio di tab e alla chiusura dell'app. Fila orizzontale
 * di chip da 38 px con l'avatar del gruppo: si raggiunge col pollice e non
 * ruba altezza alla lista.
 */
export function GroupSwitcher({ groups }: GroupSwitcherProps) {
  const theme = useTheme();
  const { groupId, setGroupId } = useActiveGroup();

  // Ordine garantito anche se chi chiama passa una lista non ordinata:
  // il gruppo personale e' sempre la prima chip.
  const ordered = [...groups].sort((a, b) => {
    if (a.group.is_personal !== b.group.is_personal) return a.group.is_personal ? -1 : 1;
    return a.group.name.localeCompare(b.group.name, 'it', { sensitivity: 'base' });
  });

  const fallbackId = ordered[0]?.group.id ?? null;
  const known = ordered.some((s) => s.group.id === groupId);
  const activeId = known ? groupId : fallbackId;

  // Prima apertura, o gruppo lasciato/eliminato: si torna al personale.
  useEffect(() => {
    if (!known && fallbackId && groupId !== fallbackId) setGroupId(fallbackId);
  }, [known, fallbackId, groupId, setGroupId]);

  if (ordered.length === 0) return null;

  return (
    <View accessibilityRole="tablist" accessibilityLabel="Gruppo attivo">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // NIENTE paddingHorizontal qui: chi usa <GroupSwitcher> (la tab Posti,
        // la tab Mappa) lo mette gia' dentro un contenitore che ha il proprio
        // paddingHorizontal: theme.spacing[4]. Aggiungerlo anche qui sommava i
        // due inset (32px totali) e faceva partire le chip piu' a destra di
        // titolo, barra di ricerca e card della lista (tutti fermi a 16px) --
        // il disallineamento a sinistra segnalato in cima alla lista posti.
        contentContainerStyle={{
          gap: theme.spacing[2],
          paddingVertical: theme.spacing[2],
        }}
      >
        {ordered.map((summary) => {
          const selected = summary.group.id === activeId;
          return (
            <Chip
              key={summary.group.id}
              label={summary.group.name}
              selected={selected}
              icon={summary.group.is_personal ? 'star' : undefined}
              onPress={() => setGroupId(summary.group.id)}
              leading={
                <Avatar
                  uri={publicUrl(BUCKETS.groupImages, summary.group.image_path)}
                  name={summary.group.name}
                  seed={summary.group.id}
                  size={24}
                  square
                />
              }
              style={{ maxWidth: 220 }}
            />
          );
        })}
      </ScrollView>
      {/* Il cambio di gruppo cambia il contenuto delle liste: va annunciato. */}
      <Text accessibilityLiveRegion="polite" style={{ height: 0, opacity: 0 }} numberOfLines={1}>
        {ordered.find((s) => s.group.id === activeId)?.group.name ?? ''}
      </Text>
    </View>
  );
}
