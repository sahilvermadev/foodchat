import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSocialImportDraftRequest,
  CreateSocialImportRequest,
  SocialImport,
  SocialImportDraftResponse,
  SocialImportsQuery,
  SocialImportsResponse,
  SocialPlaylistSubscription,
  SocialPlaylistSubscriptionResponse,
  SocialPlaylistSubscriptionsResponse,
  UpdateSocialImportRequest,
} from 'librechat-data-provider';

import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/features/auth/provider';
import { isOnlineNow } from '@/features/connectivity/provider';
import {
  cacheOfflineImports,
  listOfflineImports,
  listOfflinePlaylists,
  replaceOfflinePlaylists,
} from '@/features/offline/imports';
import { useOfflineLibrary } from '@/features/offline/provider';
import { cacheOfflineMedia } from '@/features/offline/media';

const queryString = (params: SocialImportsQuery, cursor?: string) => {
  const query = new URLSearchParams({ limit: '500' });
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim()) query.set(key, String(value));
  });
  if (cursor) query.set('cursor', cursor);
  return query.toString();
};

export const importKeys = {
  all: ['social-imports'] as const,
  list: (params: SocialImportsQuery) => ['social-imports', 'list', params] as const,
  playlists: ['social-imports', 'playlists'] as const,
};

export function useSocialImports(params: SocialImportsQuery) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: importKeys.list(params),
    queryFn: async ({ pageParam }) => {
      if (!isOnlineNow() && user) return listOfflineImports(user.id, params);
      try {
        const response = await apiFetch<SocialImportsResponse>(
          `/api/social-imports?${queryString(params, pageParam)}`,
        );
        if (user) {
          await cacheOfflineImports(user.id, response.imports);
          void cacheOfflineMedia([], response.imports);
        }
        return response;
      } catch (error) {
        if (!user) throw error;
        const local = await listOfflineImports(user.id, params);
        if (!isOnlineNow() || local.total > 0) return local;
        throw error;
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (query) => {
      const processing = query.state.data?.pages.some((page) =>
        page.imports.some((item) => item.status === 'processing'),
      );
      return isOnlineNow() && processing ? 10_000 : false;
    },
    networkMode: 'always',
  });
}

export function useSocialPlaylists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: importKeys.playlists,
    queryFn: async () => {
      if (!isOnlineNow() && user) return listOfflinePlaylists(user.id);
      try {
        const response = await apiFetch<SocialPlaylistSubscriptionsResponse>(
          '/api/social-imports/playlists',
        );
        if (user)
          await replaceOfflinePlaylists(user.id, response.subscriptions, new Date().toISOString());
        return response;
      } catch (error) {
        if (!user) throw error;
        const local = await listOfflinePlaylists(user.id);
        if (!isOnlineNow() || local.subscriptions.length > 0) return local;
        throw error;
      }
    },
    networkMode: 'always',
  });
}

export function useImportMutations() {
  const queryClient = useQueryClient();
  const { syncNow } = useOfflineLibrary();
  const refreshImports = async () => {
    await queryClient.invalidateQueries({ queryKey: importKeys.all });
    void syncNow().catch(() => undefined);
  };
  const refreshPlaylists = async () => {
    await queryClient.invalidateQueries({ queryKey: importKeys.playlists });
    void syncNow().catch(() => undefined);
  };

  const createImport = useMutation({
    mutationFn: (payload: CreateSocialImportRequest) =>
      apiFetch<SocialImport>('/api/social-imports', { method: 'POST', body: payload }),
    onSuccess: refreshImports,
  });
  const createPlaylist = useMutation({
    mutationFn: (sourceUrl: string) =>
      apiFetch<SocialPlaylistSubscriptionResponse>('/api/social-imports/playlists', {
        method: 'POST',
        body: { sourceUrl },
      }),
    onSuccess: async () => Promise.all([refreshImports(), refreshPlaylists()]),
  });
  const updateImport = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSocialImportRequest }) =>
      apiFetch<SocialImport>(`/api/social-imports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: payload,
      }),
    onSuccess: refreshImports,
  });
  const createDraft = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: CreateSocialImportDraftRequest }) =>
      apiFetch<SocialImportDraftResponse>(`/api/social-imports/${encodeURIComponent(id)}/draft`, {
        method: 'POST',
        body: payload ?? {},
      }),
    onSuccess: refreshImports,
  });
  const retryImport = useMutation({
    mutationFn: (id: string) =>
      apiFetch<SocialImport>(`/api/social-imports/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: refreshImports,
  });
  const deleteImport = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/social-imports/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: refreshImports,
  });
  const updatePlaylist = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SocialPlaylistSubscription['status'] }) =>
      apiFetch<SocialPlaylistSubscription>(
        `/api/social-imports/playlists/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: { status },
        },
      ),
    onSuccess: refreshPlaylists,
  });
  const syncPlaylist = useMutation({
    mutationFn: (id: string) =>
      apiFetch<SocialPlaylistSubscriptionResponse>(
        `/api/social-imports/playlists/${encodeURIComponent(id)}/sync`,
        { method: 'POST', body: {} },
      ),
    onSuccess: async () => Promise.all([refreshImports(), refreshPlaylists()]),
  });
  const deletePlaylist = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/social-imports/playlists/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: refreshPlaylists,
  });

  return {
    createDraft,
    createImport,
    createPlaylist,
    deleteImport,
    deletePlaylist,
    retryImport,
    syncPlaylist,
    updateImport,
    updatePlaylist,
  };
}
