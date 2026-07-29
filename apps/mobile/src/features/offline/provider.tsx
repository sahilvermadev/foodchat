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
  ShoppingList,
  SocialImport,
  SocialImportsResponse,
  SocialPlaylistSubscriptionsResponse,
} from 'librechat-data-provider';
import {
  offlineRecipes,
  shoppingList,
  socialImports,
  socialPlaylists,
} from 'librechat-data-provider/mobile';

import { useAuth } from '@/features/auth/provider';
import { useConnectivity } from '@/features/connectivity/provider';
import type { RecipeDetail } from '@/features/recipes/types';
import { apiFetch } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { readCompleteSync, readDatasetSync } from './database';
import { mergeOfflineImports, replaceOfflineImports, replaceOfflinePlaylists } from './imports';
import { cacheOfflineMedia } from './media';
import { mergeOfflineRecipes, replaceOfflineRecipes } from './recipes';
import { cacheOfflineShoppingList } from './shopping';
import { syncPendingShoppingMutations } from '@/features/shopping/queries';
import { syncPendingRecipeMutations } from '@/features/recipes/queries';
import { deletePendingImport, failPendingImport, listPendingImports } from './pending';

type OfflineRecipesPayload = {
  deletedIds?: string[];
  recipes: RecipeDetail[];
  syncedAt: string;
  nextCursor?: string;
};

type OfflineContextValue = {
  isSyncing: boolean;
  lastSyncedAt?: string;
  syncError?: string;
  syncNow(): Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

async function fetchImportChanges(since?: string) {
  const imports: SocialImport[] = [];
  const deletedIds = new Set<string>();
  let cursor: string | undefined;
  let syncedAt = new Date().toISOString();
  let until: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '500' });
    if (cursor) query.set('cursor', cursor);
    if (since) query.set('since', since);
    if (until) query.set('until', until);
    const page = await apiFetch<SocialImportsResponse>(socialImports(query.toString()));
    imports.push(...page.imports);
    until ??= page.syncedAt;
    syncedAt = page.syncedAt ?? syncedAt;
    page.deletedIds?.forEach((id) => deletedIds.add(id));
    cursor = page.nextCursor;
  } while (cursor);
  return { deletedIds: [...deletedIds], imports, syncedAt };
}

async function fetchRecipeChanges(since?: string) {
  const recipes: RecipeDetail[] = [];
  const deletedIds = new Set<string>();
  let cursor: string | undefined;
  let syncedAt = new Date().toISOString();
  let until: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    if (since) query.set('since', since);
    if (until) query.set('until', until);
    const page = await apiFetch<OfflineRecipesPayload>(offlineRecipes(query.toString()));
    recipes.push(...page.recipes);
    until ??= page.syncedAt;
    page.deletedIds?.forEach((id) => deletedIds.add(id));
    syncedAt = page.syncedAt;
    cursor = page.nextCursor;
  } while (cursor);
  return { deletedIds: [...deletedIds], recipes, syncedAt };
}

async function syncPendingImports(userId: string) {
  const pending = await listPendingImports(userId);
  let failure: Error | undefined;
  for (const item of pending) {
    try {
      if (item.playlist) {
        await apiFetch(socialPlaylists(), {
          body: { sourceUrl: item.sourceUrl },
          method: 'POST',
        });
      } else {
        await apiFetch(socialImports(), {
          body: { sourceUrl: item.sourceUrl },
          method: 'POST',
        });
      }
      await deletePendingImport(item.id);
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error('Import synchronization failed');
      await failPendingImport(
        item.id,
        error instanceof Error ? error.message : 'Import synchronization failed',
      );
    }
  }
  if (failure) throw failure;
}

async function syncOfflineLibrary(userId: string) {
  const fallbackSyncTime = new Date().toISOString();
  const pendingResults = await Promise.allSettled([
    syncPendingRecipeMutations(userId),
    syncPendingImports(userId),
  ]);
  const recipeCheckpoint = await readDatasetSync(userId, 'recipes');
  const importCheckpoint = await readDatasetSync(userId, 'imports');
  const results = await Promise.allSettled([
    fetchRecipeChanges(recipeCheckpoint).then(async (payload) => {
      const syncedAt = payload.syncedAt || fallbackSyncTime;
      if (recipeCheckpoint) {
        await mergeOfflineRecipes(userId, payload.recipes, payload.deletedIds, syncedAt);
      } else {
        await replaceOfflineRecipes(userId, payload.recipes, syncedAt);
      }
      await cacheOfflineMedia(userId, payload.recipes, []);
    }),
    fetchImportChanges(importCheckpoint).then(async (payload) => {
      if (importCheckpoint) {
        await mergeOfflineImports(userId, payload.imports, payload.deletedIds, payload.syncedAt);
      } else {
        await replaceOfflineImports(userId, payload.imports, payload.syncedAt);
      }
      await cacheOfflineMedia(userId, [], payload.imports);
    }),
    apiFetch<SocialPlaylistSubscriptionsResponse>(socialPlaylists()).then((payload) =>
      replaceOfflinePlaylists(userId, payload.subscriptions, fallbackSyncTime),
    ),
    syncPendingShoppingMutations(userId)
      .then(() => apiFetch<ShoppingList>(shoppingList()))
      .then((list) => cacheOfflineShoppingList(userId, list)),
  ]);
  if (results.every((result) => result.status === 'rejected')) {
    const failed = results.find((result) => result.status === 'rejected');
    throw failed?.reason instanceof Error ? failed.reason : new Error('Offline sync failed');
  }
  return {
    lastSyncedAt: await readCompleteSync(userId),
    partialFailure:
      pendingResults.some((result) => result.status === 'rejected') ||
      results.some((result) => result.status === 'rejected'),
  };
}

export function OfflineProvider({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  const { isOnline } = useConnectivity();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [syncError, setSyncError] = useState<string>();
  const activeSync = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || !user) {
      setLastSyncedAt(undefined);
      setSyncError(undefined);
      return;
    }
    void readCompleteSync(user.id).then(setLastSyncedAt);
  }, [status, user]);

  const syncNow = useCallback(async () => {
    if (!user || !isOnline) return;
    if (activeSync.current) return activeSync.current;
    const task = (async () => {
      setIsSyncing(true);
      setSyncError(undefined);
      try {
        const result = await syncOfflineLibrary(user.id);
        setLastSyncedAt(result.lastSyncedAt);
        if (result.partialFailure) setSyncError('Some saved data could not be synchronized.');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['recipes'], refetchType: 'active' }),
          queryClient.invalidateQueries({ queryKey: ['social-imports'], refetchType: 'active' }),
          queryClient.invalidateQueries({ queryKey: ['shopping-list'], refetchType: 'active' }),
        ]);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Synchronization failed.');
        throw error;
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
    () => ({ isSyncing, lastSyncedAt, syncError, syncNow }),
    [isSyncing, lastSyncedAt, syncError, syncNow],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineLibrary() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOfflineLibrary must be used inside OfflineProvider');
  return value;
}
