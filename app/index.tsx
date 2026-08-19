import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useProfile, useSupabaseSession, isOnboarded } from '@/features/auth/hooks/useSession';
import { useTheme } from '@/theme';

/**
 * Il gate unico dell'app. Tre esiti:
 *   nessuna sessione        -> benvenuto
 *   sessione senza username -> scelta username
 *   sessione completa       -> app
 *
 * Il caso centrale e' il requisito 1: registrazione con email e SSO Google
 * convergono sulla stessa schermata, perche' il trigger handle_new_user crea
 * il profilo con username NULL in entrambi i casi.
 */
export default function Index() {
  const theme = useTheme();
  const { session, loading } = useSupabaseSession();
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id);

  if (loading || (session && profileLoading)) {
    return (
      <View
        accessibilityLabel="Caricamento"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={theme.colors.accentBase} />
      </View>
    );
  }

  if (!session) return <Redirect href="/welcome" />;
  if (!isOnboarded(profile)) return <Redirect href="/username" />;
  return <Redirect href="/places" />;
}
