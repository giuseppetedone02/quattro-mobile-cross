import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Nota su react-native-url-polyfill: NON serve in un progetto Expo, che
 * installa gia' un URL globale. Le guide Supabase generiche per React Native
 * lo includono, quelle Expo no.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Mancano EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copia .env.example in .env e compilalo.',
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Obbligatorio su native: non esiste una URL di callback nel browser.
    detectSessionInUrl: false,
  },
});

/**
 * Senza questo, autoRefreshToken da solo non basta su mobile: il ciclo di
 * refresh continua a girare in background e non riprende al risveglio,
 * e l'utente si ritrova sloggato senza motivo apparente.
 */
let appStateSubscription: { remove: () => void } | null = null;

export function startSessionAutoRefresh() {
  if (appStateSubscription) return;
  supabase.auth.startAutoRefresh();
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function stopSessionAutoRefresh() {
  appStateSubscription?.remove();
  appStateSubscription = null;
  supabase.auth.stopAutoRefresh();
}
