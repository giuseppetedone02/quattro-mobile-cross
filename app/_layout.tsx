import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Slot } from 'expo-router';

import { persistOptions, queryClient, wireQueryClientToReactNative } from '@/lib/queryClient';
import { useAppearance } from '@/lib/store';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
            <ThemedShell />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
