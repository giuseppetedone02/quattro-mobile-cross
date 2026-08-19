import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { friendlyError } from '@/lib/errors';
import { signInWithGoogle, signOutGoogle } from '../providers/google';
import { fieldError, usernameSchema, type SignInInput, type SignUpInput } from '../schema';

/** Il redirect deve essere fra le Redirect URLs del progetto Supabase. */
export function authRedirectUri(path = 'auth/callback'): string {
  return Linking.createURL(path);
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, username, password }: SignUpInput) => {
      // Lo username viaggia nei metadata: il trigger handle_new_user lo
      // rivendica. Se collide, il trigger lascia NULL e l'app manda alla
      // schermata di scelta invece di far fallire la registrazione.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: authRedirectUri() },
      });
      if (error) throw error;
      return data;
    },
    onError: (e) => friendlyError(e, 'profiles'),
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: SignInInput) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignInWithGoogle() {
  return useMutation({
    mutationFn: async () => {
      const outcome = await signInWithGoogle();
      if (outcome.kind === 'error') throw new Error(outcome.message);
      return outcome;
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await signOutGoogle();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      // Svuota tutta la cache: i dati di un utente non devono restare
      // visibili al successivo che accede sullo stesso dispositivo.
      qc.clear();
    },
  });
}

export function useResendConfirmation() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authRedirectUri() },
      });
      if (error) throw error;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUri('auth/reset'),
      });
      if (error) throw error;
    },
  });
}

export function useClaimUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, displayName }: { username: string; displayName?: string }) => {
      const { data, error } = await supabase.rpc('claim_username', {
        p_username: username,
        p_display_name: displayName ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      qc.setQueryData(qk.profile(profile.id), profile);
    },
    onError: (e) => friendlyError(e, 'profiles'),
  });
}

export type UsernameCheck =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'error'; message: string };

/**
 * Controllo dal vivo della disponibilita dello username, con debounce.
 *
 * E' una cortesia, non la verita': claim_username ricontrolla al momento
 * della scrittura e il vincolo unique e' l'ultima parola. Senza questo
 * doppio livello, due utenti che digitano lo stesso username nello stesso
 * momento vedrebbero entrambi "libero".
 */
export function useUsernameAvailability(username: string, debounceMs = 400): UsernameCheck {
  const trimmed = username.trim().toLowerCase();
  const formatError = trimmed.length === 0 ? null : fieldError(usernameSchema, trimmed);
  const shouldQuery = trimmed.length > 0 && formatError === null;

  // Solo l'esito della rete e' stato: idle e "formato non valido" si derivano.
  const [remote, setRemote] = useState<{ term: string; taken: boolean } | { term: string; error: string } | null>(
    null,
  );

  useEffect(() => {
    if (!shouldQuery) return;
    let cancelled = false;

    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: trimmed });
      if (cancelled) return;
      if (error) setRemote({ term: trimmed, error: friendlyError(error).message });
      else setRemote({ term: trimmed, taken: !data });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, shouldQuery, debounceMs]);

  if (trimmed.length === 0) return { state: 'idle' };
  if (formatError) return { state: 'invalid', message: formatError };

  // Un esito che riguarda un termine precedente non va mostrato per quello
  // corrente: si torna a "checking" finche' non arriva la risposta giusta.
  if (!remote || remote.term !== trimmed) return { state: 'checking' };
  if ('error' in remote) return { state: 'error', message: remote.error };
  return remote.taken ? { state: 'taken' } : { state: 'available' };
}

/**
 * Gestione del deep link di conferma email / reset password.
 *
 * Il flusso documentato per React Native passa i token nel FRAGMENT dell'URL
 * (#access_token=...), non come query, e va convertito in sessione a mano.
 */
export function useAuthDeepLink() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    // I token arrivano nel FRAGMENT (#access_token=...), non come query:
    // e' il flusso documentato per React Native, e va convertito a mano.
    const fragment = url.split('#')[1];
    if (!fragment) return;

    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return;

    void supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error: e }) => {
        if (!cancelled && e) setError(friendlyError(e).message);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { error };
}
