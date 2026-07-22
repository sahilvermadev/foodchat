import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const CACHE_KEY = 'rekky.query-cache.v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

export const queryPersister: Persister = {
  persistClient: (client: PersistedClient) =>
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(client)),
  async restoreClient() {
    const stored = await AsyncStorage.getItem(CACHE_KEY);
    if (!stored) return undefined;
    try {
      return JSON.parse(stored) as PersistedClient;
    } catch {
      await AsyncStorage.removeItem(CACHE_KEY);
      return undefined;
    }
  },
  removeClient: () => AsyncStorage.removeItem(CACHE_KEY),
};

export const clearPersistedQueryCache = () => queryPersister.removeClient();
