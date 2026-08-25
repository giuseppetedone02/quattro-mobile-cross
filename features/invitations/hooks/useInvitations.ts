import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import type { Group, Invitation, Profile } from '@/lib/database.types';

/**
 * Inviti in entrata e in uscita.
 *
 * Come in useGroups le join si fanno lato client: i tipi generati non
 * dichiarano Relationships, quindi le select innestate di PostgREST non
 * sarebbero tipizzabili.
 */

export type InviterProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>;
export type InvitationGroup = Pick<Group, 'id' | 'name' | 'image_path' | 'description'>;

export type InvitationWithContext = {
  invitation: Invitation;
  group: InvitationGroup;
  inviter: InviterProfile;
};

export type SentInvitation = {
  invitation: Invitation;
  /** null quando l'invito e' stato mandato a un'email non ancora registrata. */
  invitee: InviterProfile | null;
};

export type PersonResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
};

const PROFILE_FIELDS = 'id, username, display_name, avatar_path';
const GROUP_FIELDS = 'id, name, image_path, description';

/** Le feature non si importano fra loro: la sessione si legge da supabase. */
async function currentUser(): Promise<{ id: string; email: string | null }> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error('Sessione scaduta. Accedi di nuovo.');
  return { id: user.id, email: user.email ?? null };
}

function placeholderProfile(id: string): InviterProfile {
  return { id, username: null, display_name: null, avatar_path: null };
}

async function fetchInbox(): Promise<InvitationWithContext[]> {
  const me = await currentUser();

  // Gli inviti si ricevono per id (utente gia' registrato) oppure per email
  // (invito mandato prima della registrazione): servono entrambi i rami.
  const targets = me.email ? `invitee_id.eq.${me.id},invitee_email.eq.${me.email}` : null;

  let query = supabase
    .from('group_invitations')
    .select('*')
    .eq('status', 'pending')
    // Un invito scaduto resta 'pending' finche' un job non lo chiude: la
    // scadenza va filtrata anche qui, altrimenti l'utente vede inviti morti.
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  query = targets ? query.or(targets) : query.eq('invitee_id', me.id);

  const invitations = await query;
  if (invitations.error) throw invitations.error;

  const rows = invitations.data ?? [];
  if (rows.length === 0) return [];

  const [groups, inviters] = await Promise.all([
    supabase
      .from('groups')
      .select(GROUP_FIELDS)
      .in(
        'id',
        rows.map((r) => r.group_id),
      ),
    supabase
      .from('profiles')
      .select(PROFILE_FIELDS)
      .in(
        'id',
        rows.map((r) => r.inviter_id),
      ),
  ]);
  if (groups.error) throw groups.error;
  if (inviters.error) throw inviters.error;

  const groupById = new Map<string, InvitationGroup>((groups.data ?? []).map((g) => [g.id, g]));
  const profileById = new Map<string, InviterProfile>((inviters.data ?? []).map((p) => [p.id, p]));

  return rows.map((invitation) => ({
    invitation,
    group: groupById.get(invitation.group_id) ?? {
      id: invitation.group_id,
      name: 'Gruppo',
      image_path: null,
      description: null,
    },
    inviter: profileById.get(invitation.inviter_id) ?? placeholderProfile(invitation.inviter_id),
  }));
}

export function useInboxInvitations() {
  return useQuery({ queryKey: qk.invitesInbox(), queryFn: fetchInbox });
}

/**
 * Contatore per il badge del tab. Stessa chiave della lista, con `select`:
 * badge e lista non possono mostrare numeri diversi.
 */
export function useInvitationBadgeCount(): number {
  const { data } = useQuery({
    queryKey: qk.invitesInbox(),
    queryFn: fetchInbox,
    select: (rows: InvitationWithContext[]) => rows.length,
  });
  return data ?? 0;
}

export function useSentInvitations(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.invitesSent(groupId ?? 'none'),
    enabled: Boolean(groupId),
    queryFn: async (): Promise<SentInvitation[]> => {
      const invitations = await supabase
        .from('group_invitations')
        .select('*')
        .eq('group_id', groupId as string)
        .order('created_at', { ascending: false });
      if (invitations.error) throw invitations.error;

      const rows = invitations.data ?? [];
      const inviteeIds = rows
        .map((r) => r.invitee_id)
        .filter((id): id is string => typeof id === 'string');

      if (inviteeIds.length === 0) return rows.map((invitation) => ({ invitation, invitee: null }));

      const profiles = await supabase.from('profiles').select(PROFILE_FIELDS).in('id', inviteeIds);
      if (profiles.error) throw profiles.error;
      const byId = new Map<string, InviterProfile>((profiles.data ?? []).map((p) => [p.id, p]));

      return rows.map((invitation) => ({
        invitation,
        invitee: invitation.invitee_id ? (byId.get(invitation.invitee_id) ?? null) : null,
      }));
    },
  });
}

/**
 * L'invito passa dalla RPC, non da un insert: e' la funzione che decide se
 * l'identificatore e' uno username o un'email, che verifica i permessi e che
 * rifiuta i doppioni. I suoi RAISE sono messaggi italiani gia' pronti, e
 * friendlyError li mostra cosi' come sono.
 */
export function useInviteToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      identifier,
    }: {
      groupId: string;
      identifier: string;
    }): Promise<Invitation> => {
      const { data, error } = await supabase.rpc('invite_to_group', {
        p_group_id: groupId,
        p_identifier: identifier.trim(),
      });
      if (error) throw error;
      return data;
    },
    onError: (e) => friendlyError(e, 'group_members'),
    onSettled: (_data, _e, variables) => {
      void qc.invalidateQueries({ queryKey: qk.invitesSent(variables.groupId) });
    },
  });
}

export function useRespondToInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      token,
      accept,
    }: {
      token: string;
      accept: boolean;
    }): Promise<Invitation> => {
      const { data, error } = await supabase.rpc('respond_to_invitation', {
        p_token: token,
        p_accept: accept,
      });
      if (error) throw error;
      return data;
    },

    // L'invito sparisce subito dalla posta in arrivo: in entrambi i casi non
    // e' piu' una cosa in sospeso.
    onMutate: async ({ token }: { token: string; accept: boolean }) => {
      await qc.cancelQueries({ queryKey: qk.invitesInbox() });
      const previous = qc.getQueryData<InvitationWithContext[]>(qk.invitesInbox());
      if (previous) {
        qc.setQueryData(
          qk.invitesInbox(),
          previous.filter((i) => i.invitation.token !== token),
        );
      }
      return { previous };
    },

    onError: (e, _variables, context) => {
      if (context?.previous) qc.setQueryData(qk.invitesInbox(), context.previous);
      return friendlyError(e, 'group_members');
    },

    onSuccess: (_data, variables) => {
      // Accettando si entra in un gruppo nuovo: la lista dei gruppi cambia.
      if (variables.accept) void qc.invalidateQueries({ queryKey: qk.groups() });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.invitesInbox() });
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invitationId }: { groupId: string; invitationId: string }) => {
      const { error } = await supabase
        .from('group_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId);
      if (error) throw error;
    },

    onMutate: async ({ groupId, invitationId }: { groupId: string; invitationId: string }) => {
      await qc.cancelQueries({ queryKey: qk.invitesSent(groupId) });
      const previous = qc.getQueryData<SentInvitation[]>(qk.invitesSent(groupId));
      if (previous) {
        qc.setQueryData(
          qk.invitesSent(groupId),
          previous.map((row) =>
            row.invitation.id === invitationId
              ? { ...row, invitation: { ...row.invitation, status: 'revoked' as const } }
              : row,
          ),
        );
      }
      return { previous };
    },

    onError: (e, variables, context) => {
      if (context?.previous) qc.setQueryData(qk.invitesSent(variables.groupId), context.previous);
      return friendlyError(e, 'group_members');
    },

    onSettled: (_data, _e, variables) => {
      void qc.invalidateQueries({ queryKey: qk.invitesSent(variables.groupId) });
    },
  });
}

export const PEOPLE_SEARCH_MIN_CHARS = 3;

/**
 * Un'email vale come ricerca solo se e' COMPLETA (chiocciola e almeno un punto
 * dopo di essa). La RPC search_people cerca gli username per prefisso, ma le
 * email solo per corrispondenza esatta: e' la misura anti-enumerazione, e
 * cercare "mar" non deve poter rivelare mario@esempio.it.
 */
export function looksLikeFullEmail(query: string): boolean {
  const value = query.trim();
  const at = value.indexOf('@');
  if (at <= 0) return false;
  const dot = value.indexOf('.', at + 2);
  return dot > 0 && dot < value.length - 1;
}

/**
 * Stessa soglia del server: almeno 3 caratteri per lo username, oppure
 * un'email completa. Il client e' una cortesia, il server e' la regola --
 * cosi' non si manda una richiesta che sarebbe comunque rifiutata.
 */
export function canSearchPeople(query: string): boolean {
  return query.trim().length >= PEOPLE_SEARCH_MIN_CHARS || looksLikeFullEmail(query);
}

/**
 * Codice/link di invito del gruppo. Idempotente sul server: se il gruppo
 * ha gia' un codice, la RPC lo restituisce senza generarne un secondo. Per
 * questo si può richiamare a ogni apertura della schermata "Invita" senza
 * preoccuparsi di sprecare codici o di doverne tenere traccia lato client.
 */
export function useGroupInviteLink(groupId: string | undefined) {
  return useQuery({
    queryKey: qk.inviteLink(groupId ?? 'none'),
    enabled: Boolean(groupId),
    // Il codice non cambia da solo: niente da rinfrescare in background finche'
    // non lo si rigenera esplicitamente (vedi useRegenerateGroupInviteLink).
    staleTime: Infinity,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('get_or_create_group_invite_code', {
        p_group_id: groupId as string,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Rigenera il codice: quello vecchio smette immediatamente di funzionare.
 * Serve per "revocare" un link condiviso per errore o con la persona sbagliata.
 */
export function useRegenerateGroupInviteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('regenerate_group_invite_code', {
        p_group_id: groupId,
      });
      if (error) throw error;
      return data;
    },
    onError: (e) => friendlyError(e, 'group_members'),
    onSuccess: (code, groupId) => {
      qc.setQueryData(qk.inviteLink(groupId), code);
    },
  });
}

/**
 * Entrare in un gruppo tramite codice/link, invece che accettando un invito
 * nominale. Usata sia dalla schermata di deep link (quattro://join/<code>)
 * sia da un eventuale inserimento manuale del codice.
 */
export function useJoinGroupViaCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<Group> => {
      const { data, error } = await supabase.rpc('join_group_via_code', {
        p_code: code.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Si entra in un gruppo nuovo: la lista dei gruppi cambia.
      void qc.invalidateQueries({ queryKey: qk.groups() });
    },
  });
}

/**
 * quattro://join/<code> — lo schema che l'app sa gestire direttamente (usato
 * anche dagli inviti nominali). Funziona SOLO se chi lo apre ha gia' Quattro
 * installata e lo apre da un punto che lo tratta come link (non incollato
 * in una casella di ricerca): tra amici e' comodo, ma la maggior parte delle
 * app di messaggistica non lo trasforma in un link cliccabile perche' non
 * riconoscono schemi personalizzati oltre a http/https.
 */
export function buildAppDeepLink(code: string): string {
  return `quattro://join/${code}`;
}

/**
 * Pagina statica di fallback su GitHub Pages (nessun costo, nessun dominio
 * proprio necessario -- la stessa scelta indicata nel piano per la pagina di
 * fallback degli inviti). E' un link https vero: ogni app di messaggistica
 * lo rende cliccabile, e la pagina stessa tenta poi l'handoff verso
 * quattro://join/<code> per chi ha l'app, mostrando il codice in chiaro per
 * chi deve ancora installarla. Questo e' il link da condividere con "una
 * persona comune": buildAppDeepLink esiste solo per test diretti (adb, o
 * dentro l'app stessa).
 */
const INVITE_WEB_BASE_URL = 'https://giuseppetedone02.github.io/quattro-mobile-cross/join/';

export function buildJoinWebLink(code: string, groupName?: string): string {
  const params = new URLSearchParams({ code });
  if (groupName) params.set('n', groupName);
  return `${INVITE_WEB_BASE_URL}?${params.toString()}`;
}

/** Testo predefinito per il pulsante "Condividi": un link https che chiunque
 *  può aprire, con il codice ripetuto in chiaro come ultima spiaggia. */
export function buildInviteShareMessage(groupName: string, code: string): string {
  return (
    `Ti invito nel gruppo «${groupName}» su Quattro!\n\n` +
    `Apri questo link per entrare: ${buildJoinWebLink(code, groupName)}\n\n` +
    `Se il link non apre l'app, usa il codice ${code} dalla schermata "Ho un codice".`
  );
}

export function useSearchPeople(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: qk.people(trimmed.toLowerCase()),
    enabled: canSearchPeople(trimmed),
    // I risultati invecchiano male (un username puo' essere appena cambiato)
    // ma entro pochi minuti sono validi: evita di ripetere la stessa ricerca.
    staleTime: 60_000,
    queryFn: async (): Promise<PersonResult[]> => {
      const { data, error } = await supabase.rpc('search_people', { p_query: trimmed });
      if (error) throw error;
      return data ?? [];
    },
  });
}
