import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import { BUCKETS, uploadPhoto, type PreparedPhoto } from '@/lib/photos';
import type { Profile } from '@/lib/database.types';
import type { PaletteFamily } from '@/theme/tokens';
import type { ThemePreference } from '@/theme/ThemeProvider';
import { parseTheme, serializeTheme } from '../theme';

/**
 * Modifiche al proprio profilo. La lettura sta in features/auth (useProfile
 * della sessione): qui ci sono solo le scritture, cosi' le due feature non si
 * importano fra loro.
 */

export { parseTheme, serializeTheme } from '../theme';
export type { ParsedTheme } from '../theme';

/** Le feature non si importano fra loro: la sessione si legge da supabase. */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new Error('Sessione scaduta. Accedi di nuovo.');
  return id;
}

export type UpdateProfileInput = {
  displayName?: string;
  /** Nuovo avatar gia' ridimensionato da lib/photos. */
  photo?: PreparedPhoto | null;
  removeAvatar?: boolean;
};

/**
 * Il percorso dell'avatar e' `{userId}/{uuid}.webp`: la prima cartella e' la
 * chiave su cui la policy dello Storage verifica il proprietario, e l'uuid
 * evita che la CDN serva la foto vecchia a chi ha ancora l'URL in cache.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      displayName,
      photo,
      removeAvatar,
    }: UpdateProfileInput): Promise<Profile> => {
      const userId = await requireUserId();

      const patch: { display_name?: string | null; avatar_path?: string | null } = {};
      if (displayName !== undefined) patch.display_name = displayName.trim() || null;
      if (removeAvatar) patch.avatar_path = null;
      if (photo) {
        const uploaded = await uploadPhoto(
          BUCKETS.avatars,
          `${userId}/${Crypto.randomUUID()}.webp`,
          photo,
        );
        patch.avatar_path = uploaded.path;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    onMutate: async ({ displayName, removeAvatar }: UpdateProfileInput) => {
      const userId = await requireUserId();
      const key = qk.profile(userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Profile>(key);

      if (previous) {
        qc.setQueryData<Profile>(key, {
          ...previous,
          display_name:
            displayName !== undefined ? displayName.trim() || null : previous.display_name,
          avatar_path: removeAvatar ? null : previous.avatar_path,
        });
      }
      return { previous, key };
    },

    onError: (e, _variables, context) => {
      if (context?.previous && context.key) qc.setQueryData(context.key, context.previous);
      return friendlyError(e, 'profiles');
    },

    onSuccess: (profile) => {
      qc.setQueryData(qk.profile(profile.id), profile);
    },

    onSettled: (_data, _e, _variables, context) => {
      if (context?.key) void qc.invalidateQueries({ queryKey: context.key });
    },
  });
}

/**
 * claim_username serve anche per i cambi di nome utente: la RPC controlla il
 * formato, la disponibilita' e il limite di frequenza in una sola transazione.
 * Un update diretto sulla tabella lascerebbe la finestra fra il controllo di
 * disponibilita' e la scrittura.
 */
export function useUpdateUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      username,
      displayName,
    }: {
      username: string;
      displayName?: string | null;
    }): Promise<Profile> => {
      const { data, error } = await supabase.rpc('claim_username', {
        p_username: username.trim().toLowerCase(),
        p_display_name: displayName ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      qc.setQueryData(qk.profile(profile.id), profile);
    },
    onError: (e) => friendlyError(e, 'profiles'),
    onSettled: (profile) => {
      if (profile) void qc.invalidateQueries({ queryKey: qk.profile(profile.id) });
    },
  });
}

export type SyncThemeInput = { family: PaletteFamily; preference: ThemePreference };

/**
 * Salva il tema scelto su `profiles.theme` come "famiglia:preferenza".
 *
 * Non e' la fonte di verita' per l'aspetto -- quella e' lo store persistito,
 * che si applica all'avvio senza rete -- ma serve a ritrovare il proprio tema
 * su un secondo dispositivo. Per questo il fallimento non e' bloccante: si
 * ripristina la cache e si mostra il messaggio, l'app resta col tema scelto.
 */
export function useSyncThemeToProfile() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ family, preference }: SyncThemeInput): Promise<string> => {
      const userId = await requireUserId();
      const theme = serializeTheme(family, preference);
      const { error } = await supabase.from('profiles').update({ theme }).eq('id', userId);
      if (error) throw error;
      return theme;
    },

    onMutate: async ({ family, preference }: SyncThemeInput) => {
      const userId = await requireUserId();
      const key = qk.profile(userId);
      const previous = qc.getQueryData<Profile>(key);
      if (previous) {
        qc.setQueryData<Profile>(key, { ...previous, theme: serializeTheme(family, preference) });
      }
      return { previous, key };
    },

    onError: (e, _variables, context) => {
      if (context?.previous && context.key) qc.setQueryData(context.key, context.previous);
      return friendlyError(e, 'profiles');
    },
  });

  /** Comodita' per la galleria dei temi: un solo argomento per volta. */
  const sync = useCallback(
    (input: SyncThemeInput) => {
      mutation.mutate(input);
    },
    [mutation],
  );

  return { ...mutation, sync };
}

/** Tema salvato sul profilo, pronto da applicare allo store. */
export function themeFromProfile(profile: Profile | null | undefined) {
  return parseTheme(profile?.theme);
}
