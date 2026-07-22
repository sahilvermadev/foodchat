import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import type {
  SocialImport,
  SocialImportsResponse,
  SocialPlaylistSubscriptionsResponse,
} from 'librechat-data-provider';

import { useAuth } from '@/features/auth/provider';
import { useConnectivity } from '@/features/connectivity/provider';
import type { RecipeDetail } from '@/features/recipes/types';
import { apiFetch } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { readLastSync } from './database';
import { replaceOfflineImports, replaceOfflinePlaylists } from './imports';
import { cacheOfflineMedia } from './media';
import { replaceOfflineRecipes } from './recipes';

type OfflineRecipesPayload = { recipes: RecipeDetail[]; syncedAt: string; nextCursor?: string };

type OfflineContextValue = {
  isSyncing: boolean;
  lastSyncedAt?: string;
  syncNow(): Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

async function fetchAllImports() {
  const imports: SocialImport[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    const page = await apiFetch<SocialImportsResponse>(`/api/social-imports?${query.toString()}`);
    imports.push(...page.imports);
    cursor = page.nextCursor;
  } while (cursor);
  return imports;
}

async function fetchAllRecipes() {
  const recipes: RecipeDetail[] = [];
  let cursor: string | undefined;
  let syncedAt = new Date().toISOString();
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = await apiFetch<OfflineRecipesPayload>(`/api/recipes/offline?${query.toString()}`);
    recipes.push(...page.recipes);
    syncedAt = page.syncedAt;
    cursor = page.nextCursor;
  } while (cursor);
  return { recipes, syncedAt };
}

async function syncOfflineLibrary(userId: string) {
  const fallbackSyncTime = new Date().toISOString();
  const results = await Promise.allSettled([
    fetchAllRecipes().then(async (payload) => {
      const syncedAt = payload.syncedAt || fallbackSyncTime;
      await replaceOfflineRecipes(userId, payload.recipes, syncedAt);
      await cacheOfflineMedia(payload.recipes, []);
    }),
    fetchAllImports().then(async (imports) => {
      await replaceOfflineImports(userId, imports, fallbackSyncTime);
      await cacheOfflineMedia([], imports);
    }),
    apiFetch<SocialPlaylistSubscriptionsResponse>('/api/social-imports/playlists').then((payload) =>
      replaceOfflinePlaylists(userId, payload.subscriptions, fallbackSyncTime),
    ),
  ]);
  if (results.every((result) => result.status === 'rejected')) {
    const failed = results.find((result) => result.status === 'rejected');
    throw failed?.reason instanceof Error ? failed.reason : new Error('Offline sync failed');
  }
  return (await readLastSync(userId)) ?? fallbackSyncTime;
}

export function OfflineProvider({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  const { isOnline } = useConnectivity();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const activeSync = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || !user) {
      setLastSyncedAt(undefined);
      return;
    }
    void readLastSync(user.id).then(setLastSyncedAt);
  }, [status, user]);

  const syncNow = useCallback(async () => {
    if (!user || !isOnline) return;
    if (activeSync.current) return activeSync.current;
    const task = (async () => {
      setIsSyncing(true);
      try {
        const syncedAt = await syncOfflineLibrary(user.id);
        setLastSyncedAt(syncedAt);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['recipes'], refetchType: 'active' }),
          queryClient.invalidateQueries({ queryKey: ['social-imports'], refetchType: 'active' }),
        ]);
      } finally {
        setIsSyncing(false);
        activeSync.current = null;
      }
    })();
    activeSync.current = task;
    return task;
  }, [isOnline, user]);

  useEffect(() => {
    if (status === 'signedIn' && isOnline) void syncNow().catch(() => undefined);
  }, [isOnline, status, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && status === 'signedIn' && isOnline) {
        void syncNow().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [isOnline, status, syncNow]);

  const value = useMemo(
    () => ({ isSyncing, lastSyncedAt, syncNow }),
    [isSyncing, lastSyncedAt, syncNow],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineLibrary() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOfflineLibrary must be used inside OfflineProvider');
  return value;
}
