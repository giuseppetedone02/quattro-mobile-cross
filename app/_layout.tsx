import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Slot } from 'expo-router';
import * as Sentry from '@sentry/react-native';

import { persistOptions, queryClient, wireQueryClientToReactNative } from '@/lib/queryClient';
import { useAppearance } from '@/lib/store';
import { ThemeProvider, useTheme } from '@/theme';
import { EmptyState } from '@/components/ui';

void SplashScreen.preventAutoHideAsync();

/**
 * L'app non passa dagli store: niente raccolta automatica di crash da Play
 * Console/App Store Connect (vedi §22.5 del piano). Sentry e' l'unico modo
 * per scoprire un crash su un dispositivo di un amico prima che te lo scriva
 * lui -- da qui la scelta di inizializzarlo il piu' presto possibile, fuori
 * dal componente, prima ancora che React monti qualcosa.
 *
 * DSN vuoto (progetto Sentry non ancora creato, o .env non compilato) = init
 * saltato: l'app funziona comunque, semplicemente senza crash reporting.
 * Sentry.wrap() sotto resta innocuo anche a init saltato.
 */
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // Solo errori/crash, non performance tracing: il piano gratuito ha un
    // tetto di eventi al mese, e le transazioni di performance lo consumano
    // molto piu' in fretta degli errori per un'app di questa scala.
    tracesSampleRate: 0,
    debug: __DEV__,
  });
}

function RootLayout() {
  const { family, preference } = useAppearance();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  // Cablaggio one-shot: TanStack Query su mobile non rileva da se' rete e
  // foreground (refetchOnWindowFocus e' solo web).
  useEffect(() => wireQueryClientToReactNative(), []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Trattiene la splash finche' i font non sono pronti: senza, il primo frame
  // usa il font di sistema e tutto salta di posizione quando arrivano.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemeProvider family={family} preference={preference}>
            <Sentry.ErrorBoundary fallback={CrashFallback}>
              <ThemedShell />
            </Sentry.ErrorBoundary>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

/**
 * Sostituisce l'intera UI se un errore JS sfugge fino a qui: senza un
 * ErrorBoundary un crash di rendering lascerebbe la schermata bianca o
 * chiuderebbe l'app, senza che chi la usa capisca cosa fare. Sta DENTRO
 * ThemeProvider (vedi sopra il layout) cosi' puo' ancora leggere il tema
 * invece di un fallback che stona col resto dell'app.
 */
function CrashFallback({ resetError }: { error: unknown; resetError: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgCanvas, justifyContent: 'center' }}>
      <EmptyState
        icon="warning"
        title="Qualcosa e andato storto"
        message="L'errore e stato segnalato. Riprova: se il problema persiste, riavvia l'app."
        actionLabel="Riprova"
        onAction={resetError}
      />
    </View>
  );
}

/** Deve stare DENTRO ThemeProvider per poter leggere il tema. */
function ThemedShell() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgCanvas }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </View>
  );
}
