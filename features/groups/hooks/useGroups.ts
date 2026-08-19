import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import { BUCKETS, uploadPhoto, type PreparedPhoto } from '@/lib/photos';
import type { Group, MemberRole, Profile } from '@/lib/database.types';
import * as Crypto from 'expo-crypto';

/**
 * Gruppi, membri e permessi.
 *
 * Nota sulle join: `lib/database.types.ts` non dichiara Relationships, quindi
 * le select innestate di PostgREST (`profiles(...)`) non sono tipizzabili e
 * darebbero `SelectQueryError`. Qui si fanno due letture piatte e si unisce
 * lato client: e' tipizzato senza un solo `as any`, e su liste di questa
 * dimensione (decine di righe) il costo e' irrilevante.
 */

export type GroupSummary = {
  group: Group;
  memberCount: number;
  placeCount: number;
  role: MemberRole;
};

export type MemberProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>;

export type GroupMemberWithProfile = {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  profile: MemberProfile;
};

const PROFILE_FIELDS = 'id, username, display_name, avatar_path';

/**
 * L'id utente non arriva da features/auth: le feature non si importano fra
 * loro. getSession() legge lo storage locale, non fa rete.
 */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new Error('Sessione scaduta. Accedi di nuovo.');
  return id;
}

/** Messaggio unico: il gruppo personale non si rinomina, non si elimina, non si lascia. */
export const PERSONAL_GROUP_LOCKED =
  "Il gruppo personale non si puo' rinominare, eliminare o lasciare: e' sempre tuo.";

export function isPersonalGroup(group: Pick<Group, 'is_personal'> | null | undefined): boolean {
  return Boolean(group?.is_personal);
}

/** Solo owner e admin modificano un gruppo condiviso. */
export function canEditGroup(
  group: Pick<Group, 'is_personal'> | null | undefined,
  role: MemberRole | undefined,
): boolean {
  if (!group || group.is_personal) return false;
  return role === 'owner' || role === 'admin';
}

export function canDeleteGroup(
  group: Pick<Group, 'is_personal'> | null | undefined,
  role: MemberRole | undefined,
): boolean {
  if (!group || group.is_personal) return false;
  return role === 'owner';
}

export function canLeaveGroup(group: Pick<Group, 'is_personal'> | null | undefined): boolean {
  return Boolean(group) && !group?.is_personal;
}

export function canManageMembers(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Il gruppo personale sta SEMPRE per primo: e' il contenitore predefinito e
 * la lista non deve farlo cercare. Gli altri in ordine alfabetico italiano.
 */
function sortSummaries(rows: GroupSummary[]): GroupSummary[] {
  return [...rows].sort((a, b) => {
    if (a.group.is_personal !== b.group.is_personal) return a.group.is_personal ? -1 : 1;
    return a.group.name.localeCompare(b.group.name, 'it', { sensitivity: 'base' });
  });
}

async function fetchGroupSummaries(): Promise<GroupSummary[]> {
  const userId = await requireUserId();

  const memberships = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', userId);
  if (memberships.error) throw memberships.error;

  const ids = (memberships.data ?? []).map((m) => m.group_id);
  if (ids.length === 0) return [];

  const [groups, members, places] = await Promise.all([
    supabase.from('groups').select('*').in('id', ids),
    supabase.from('group_members').select('group_id').in('group_id', ids),
    supabase.from('group_places').select('group_id').in('group_id', ids),
  ]);
  if (groups.error) throw groups.error;
  if (members.error) throw members.error;
  if (places.error) throw places.error;

  const roleOf = new Map<string, MemberRole>(
    (memberships.data ?? []).map((m) => [m.group_id, m.role]),
  );
  const memberCount = tally((members.data ?? []).map((r) => r.group_id));
  const placeCount = tally((places.data ?? []).map((r) => r.group_id));

  const summaries = (groups.data ?? []).map((group) => ({
    group,
    memberCount: memberCount.get(group.id) ?? 1,
    placeCount: placeCount.get(group.id) ?? 0,
    role: roleOf.get(group.id) ?? 'member',
  }));

  return sortSummaries(summaries);
}

function tally(keys: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

export function useGroups() {
  return useQuery({ queryKey: qk.groups(), queryFn: fetchGroupSummaries });
}

/**
 * Il gruppo personale si deriva dalla stessa query, con `select`: una sola
 * voce in cache invece di due che possono divergere.
 */
export function usePersonalGroup() {
  return useQuery({
    queryKey: qk.groups(),
    queryFn: fetchGroupSummaries,
    select: (rows: GroupSummary[]) => rows.find((r) => r.group.is_personal) ?? null,
  });
}

export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.group(groupId ?? 'none'),
    enabled: Boolean(groupId),
    queryFn: async (): Promise<Group> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.members(groupId ?? 'none'),
    enabled: Boolean(groupId),
    queryFn: async (): Promise<GroupMemberWithProfile[]> => {
      const members = await supabase
        .from('group_members')
        .select('user_id, role, joined_at')
        .eq('group_id', groupId as string);
      if (members.error) throw members.error;

      const rows = members.data ?? [];
      if (rows.length === 0) return [];

      const profiles = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .in(
          'id',
          rows.map((r) => r.user_id),
        );
      if (profiles.error) throw profiles.error;

      const byId = new Map<string, MemberProfile>((profiles.data ?? []).map((p) => [p.id, p]));

      return rows
        .map((r) => ({
          userId: r.user_id,
          role: r.role,
          joinedAt: r.joined_at,
          profile:
            // Il profilo puo' mancare se le RLS lo nascondono: la riga resta
            // visibile invece di far sparire un membro dalla lista.
            byId.get(r.user_id) ?? {
              id: r.user_id,
              username: null,
              display_name: null,
              avatar_path: null,
            },
        }))
        .sort(byRoleThenName);
    },
  });
}

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };

function byRoleThenName(a: GroupMemberWithProfile, b: GroupMemberWithProfile): number {
  if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
  const an = a.profile.display_name ?? a.profile.username ?? '';
  const bn = b.profile.display_name ?? b.profile.username ?? '';
  return an.localeCompare(bn, 'it', { sensitivity: 'base' });
}

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  photo?: PreparedPhoto | null;
};

/**
 * Creazione in tre passi deliberati: gruppo, riga di appartenenza, immagine.
 *
 * L'immagine si carica DOPO l'inserimento della riga in group_members, perche'
 * le policy dello Storage riconoscono chi appartiene al gruppo: caricare prima
 * significherebbe farsi rifiutare il file. `is_personal` non si passa: il
 * default e' false e le RLS impediscono comunque un secondo gruppo personale.
 */
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description, photo }: CreateGroupInput): Promise<Group> => {
      const userId = await requireUserId();

      const created = await supabase
        .from('groups')
        .insert({ name: name.trim(), description: description?.trim() || null, owner_id: userId })
        .select('*')
        .single();
      if (created.error) throw created.error;
      const group = created.data;

      const membership = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: userId, role: 'owner' });
      if (membership.error) throw membership.error;

      if (!photo) return group;

      const uploaded = await uploadPhoto(
        BUCKETS.groupImages,
        `${group.id}/${Crypto.randomUUID()}.webp`,
        photo,
      );
      const updated = await supabase
        .from('groups')
        .update({ image_path: uploaded.path })
        .eq('id', group.id)
        .select('*')
        .single();
      if (updated.error) throw updated.error;
      return updated.data;
    },
    onError: (e) => friendlyError(e, 'groups'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.groups() });
    },
  });
}

export type UpdateGroupInput = {
  groupId: string;
  name?: string;
  description?: string | null;
  photo?: PreparedPhoto | null;
  /** true = rimuove l'immagine attuale. */
  removeImage?: boolean;
};

export function useUpdateGroup() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      name,
      description,
      photo,
      removeImage,
    }: UpdateGroupInput): Promise<Group> => {
      const patch: { name?: string; description?: string | null; image_path?: string | null } = {};
      if (name !== undefined) patch.name = name.trim();
      if (description !== undefined) patch.description = description?.trim() || null;
      if (removeImage) patch.image_path = null;
      if (photo) {
        const uploaded = await uploadPhoto(
          BUCKETS.groupImages,
          `${groupId}/${Crypto.randomUUID()}.webp`,
          photo,
        );
        patch.image_path = uploaded.path;
      }

      const { data, error } = await supabase
        .from('groups')
        .update(patch)
        .eq('id', groupId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    // Ottimistico su nome e descrizione: l'immagine dipende dall'upload e
    // arriva con l'invalidazione, il testo si vede subito.
    onMutate: async ({ groupId, name, description, removeImage }: UpdateGroupInput) => {
      await qc.cancelQueries({ queryKey: qk.group(groupId) });
      const previousGroup = qc.getQueryData<Group>(qk.group(groupId));
      const previousList = qc.getQueryData<GroupSummary[]>(qk.groups());

      const apply = (g: Group): Group => ({
        ...g,
        name: name !== undefined ? name.trim() : g.name,
        description: description !== undefined ? description?.trim() || null : g.description,
        image_path: removeImage ? null : g.image_path,
      });

      if (previousGroup) qc.setQueryData(qk.group(groupId), apply(previousGroup));
      if (previousList) {
        qc.setQueryData(
          qk.groups(),
          sortSummaries(
            previousList.map((s) => (s.group.id === groupId ? { ...s, group: apply(s.group) } : s)),
          ),
        );
      }

      return { previousGroup, previousList };
    },

    onError: (e, variables, context) => {
      if (context?.previousGroup)
        qc.setQueryData(qk.group(variables.groupId), context.previousGroup);
      if (context?.previousList) qc.setQueryData(qk.groups(), context.previousList);
      return friendlyError(e, 'groups');
    },

    onSettled: (_data, _e, variables) => {
      void qc.invalidateQueries({ queryKey: qk.group(variables.groupId) });
      void qc.invalidateQueries({ queryKey: qk.groups() });
    },
  });
}

/**
 * Uscire da un gruppo = cancellare la propria riga in group_members.
 * Sul gruppo personale si rifiuta qui, con un messaggio, invece di far
 * arrivare all'utente un errore di RLS.
 */
export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string): Promise<string> => {
      const userId = await requireUserId();
      if (await isPersonalGroupId(qc, groupId)) throw new Error(PERSONAL_GROUP_LOCKED);

      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) throw error;
      return groupId;
    },

    onMutate: async (groupId: string) => {
      const previousList = qc.getQueryData<GroupSummary[]>(qk.groups());
      if (previousList) {
        qc.setQueryData(
          qk.groups(),
          previousList.filter((s) => s.group.id !== groupId),
        );
      }
      return { previousList };
    },

    onError: (e, _groupId, context) => {
      if (context?.previousList) qc.setQueryData(qk.groups(), context.previousList);
      return friendlyError(e, 'group_members');
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.groups() });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string): Promise<string> => {
      const userId = await requireUserId();
      const group = await supabase.from('groups').select('*').eq('id', groupId).single();
      if (group.error) throw group.error;
      if (group.data.is_personal) throw new Error(PERSONAL_GROUP_LOCKED);
      if (group.data.owner_id !== userId) {
        throw new Error("Solo chi ha creato il gruppo lo puo' eliminare.");
      }

      const { error } = await supabase.from('groups').delete().eq('id', groupId);
      if (error) throw error;
      return groupId;
    },

    onMutate: async (groupId: string) => {
      const previousList = qc.getQueryData<GroupSummary[]>(qk.groups());
      if (previousList) {
        qc.setQueryData(
          qk.groups(),
          previousList.filter((s) => s.group.id !== groupId),
        );
      }
      return { previousList };
    },

    onError: (e, _groupId, context) => {
      if (context?.previousList) qc.setQueryData(qk.groups(), context.previousList);
      return friendlyError(e, 'groups');
    },

    onSettled: (_data, _e, groupId) => {
      void qc.invalidateQueries({ queryKey: qk.groups() });
      void qc.removeQueries({ queryKey: qk.group(groupId) });
    },
  });
}

/** Legge dalla cache dei gruppi ed evita un giro di rete quando basta. */
async function isPersonalGroupId(
  qc: ReturnType<typeof useQueryClient>,
  groupId: string,
): Promise<boolean> {
  const cached = qc.getQueryData<GroupSummary[]>(qk.groups());
  const hit = cached?.find((s) => s.group.id === groupId);
  if (hit) return hit.group.is_personal;

  const { data, error } = await supabase
    .from('groups')
    .select('is_personal')
    .eq('id', groupId)
    .single();
  if (error) throw error;
  return data.is_personal;
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) throw error;
    },

    onMutate: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      await qc.cancelQueries({ queryKey: qk.members(groupId) });
      const previous = qc.getQueryData<GroupMemberWithProfile[]>(qk.members(groupId));
      if (previous) {
        qc.setQueryData(
          qk.members(groupId),
          previous.filter((m) => m.userId !== userId),
        );
      }
      return { previous };
    },

    onError: (e, variables, context) => {
      if (context?.previous) qc.setQueryData(qk.members(variables.groupId), context.previous);
      return friendlyError(e, 'group_members');
    },

    onSettled: (_data, _e, variables) => {
      void qc.invalidateQueries({ queryKey: qk.members(variables.groupId) });
      void qc.invalidateQueries({ queryKey: qk.groups() });
    },
  });
}

export function useChangeMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      userId,
      role,
    }: {
      groupId: string;
      userId: string;
      role: MemberRole;
    }) => {
      const { error } = await supabase
        .from('group_members')
        .update({ role })
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) throw error;
    },

    onMutate: async ({
      groupId,
      userId,
      role,
    }: {
      groupId: string;
      userId: string;
      role: MemberRole;
    }) => {
      await qc.cancelQueries({ queryKey: qk.members(groupId) });
      const previous = qc.getQueryData<GroupMemberWithProfile[]>(qk.members(groupId));
      if (previous) {
        qc.setQueryData(
          qk.members(groupId),
          previous.map((m) => (m.userId === userId ? { ...m, role } : m)),
        );
      }
      return { previous };
    },

    onError: (e, variables, context) => {
      if (context?.previous) qc.setQueryData(qk.members(variables.groupId), context.previous);
      return friendlyError(e, 'group_members');
    },

    onSettled: (_data, _e, variables) => {
      void qc.invalidateQueries({ queryKey: qk.members(variables.groupId) });
    },
  });
}
