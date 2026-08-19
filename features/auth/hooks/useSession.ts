import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase, startSessionAutoRefresh } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { Profile } from '@/lib/database.types';

export type SessionState = {
  session: Session | null;
  /** true finche' non sappiamo se c'e' una sessione: evita di far lampeggiare
   *  la schermata di login a chi e' gia' autenticato. */
  loading: boolean;
};

export function useSupabaseSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    startSessionAutoRefresh();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Il profilo e' "completo" quando lo username esiste. E' cosi' che i due
 * percorsi di registrazione -- email e Google SSO -- convergono sulla stessa
 * schermata di scelta username, che e' il requisito 1.
 */
export function isOnboarded(profile: Profile | undefined | null): boolean {
  return Boolean(profile?.username);
}
