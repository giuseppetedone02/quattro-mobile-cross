import { useEffect, useMemo } from 'react';
import { useActiveGroup } from './store';
import { useGroups, type GroupSummary } from '@/features/groups';

/**
 * Risolve il gruppo attivo. Se non ne e' stato scelto uno, o se quello scelto
 * non esiste piu' (gruppo lasciato o cancellato), ricade sul gruppo personale
 * -- che esiste sempre, perche' lo crea il trigger alla registrazione.
 *
 * Senza questa risoluzione, uscire da un gruppo mentre lo si sta guardando
 * lascerebbe la UI puntata su un id che RLS non restituisce piu', e la
 * schermata resterebbe vuota senza spiegazione.
 */
export function useActiveGroupResolved(): {
  groups: GroupSummary[];
  active: GroupSummary | null;
  isLoading: boolean;
  error: unknown;
} {
  const { groupId, setGroupId } = useActiveGroup();
  const { data: groups = [], isLoading, error } = useGroups();

  const active = useMemo(() => {
    if (groups.length === 0) return null;
    const chosen = groupId ? groups.find((g) => g.group.id === groupId) : undefined;
    if (chosen) return chosen;
    return groups.find((g) => g.group.is_personal) ?? groups[0] ?? null;
  }, [groups, groupId]);

  useEffect(() => {
    if (active && active.group.id !== groupId) setGroupId(active.group.id);
  }, [active, groupId, setGroupId]);

  return { groups, active, isLoading, error };
}
