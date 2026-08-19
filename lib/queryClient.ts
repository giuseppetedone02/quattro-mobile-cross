import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: (failureCount, error) => {
        // Non ritentare gli errori permanenti: e' la stessa distinzione che
        // NotionService faceva in WantABook fra 429/5xx e 401/403/404.
        const code = (error as { code?: string } | null)?.code;
        if (code && ['42501', '23505', '23503', 'PGRST116', 'P0002'].includes(code)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: 0 },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 2000,
  key: 'quattro-query-cache',
});

export const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) => {
      // I dati Google non si persistono: i termini di servizio non lo
      // consentono e i nomi delle foto scadono comunque. La conformita' vale
      // anche per la cache client, non solo per il database.
      if (query.queryKey[0] === 'google') return false;
      return query.state.status === 'success';
    },
  },
} as const;

/**
 * TanStack Query non lo fa da se' su mobile: refetchOnWindowFocus e' solo web.
 * Va cablato a mano una volta, all'avvio.
 */
export function wireQueryClientToReactNative() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
  );

  const sub = AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });

  return () => sub.remove();
}
