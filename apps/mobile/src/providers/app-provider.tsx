import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { PropsWithChildren } from 'react';

import { queryClient, queryPersister } from '@/lib/query-client';
import { AuthProvider } from '@/features/auth/provider';
import { ConnectivityProvider } from '@/features/connectivity/provider';
import { OfflineProvider } from '@/features/offline/provider';
import { ThemeProvider } from '@/features/theme/provider';
import { RecipeVoiceProvider } from '@/features/voice/provider';

const persistedQueryRoots = new Set([
  'user',
  'recipes',
  'shopping-list',
  'social-imports',
  'conversations',
]);

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ConnectivityProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              buster: 'mobile-data-v2',
              maxAge: 30 * 24 * 60 * 60 * 1000,
              persister: queryPersister,
              dehydrateOptions: {
                shouldDehydrateQuery: (query) =>
                  query.state.status === 'success' &&
                  persistedQueryRoots.has(String(query.queryKey[0] ?? '')),
              },
            }}
          >
            <AuthProvider>
              <OfflineProvider>
                <RecipeVoiceProvider>{children}</RecipeVoiceProvider>
              </OfflineProvider>
            </AuthProvider>
          </PersistQueryClientProvider>
        </ConnectivityProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
