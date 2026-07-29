import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  publicRecipe,
  publicRecipes,
  recipe,
  recipeFacets,
  recipes,
} from 'librechat-data-provider/mobile';

import { useAuth } from '@/features/auth/provider';
import { isOnlineNow } from '@/features/connectivity/provider';
import {
  cacheOfflineRecipe,
  cacheOfflineRecipeSummaries,
  deleteOfflineRecipeMutation,
  deleteOfflineRecipe,
  failOfflineRecipeMutation,
  getOfflineRecipe,
  getOfflineRecipeFacets,
  listOfflineRecipes,
  listOfflineRecipeMutations,
  queueOfflineRecipeMutation,
} from '@/features/offline/recipes';
import { mutationFailureDisposition } from '@/features/offline/conflict';
import { ApiError, apiFetch } from '@/lib/api/client';
import type {
  PublicRecipeDetail,
  PublicRecipesResponse,
  RecipeDetail,
  RecipeFilters,
  RecipeFacets,
  RecipesResponse,
  RecipeUpdate,
} from './types';

const queryString = (filters: RecipeFilters, cursor?: string, limit = 20) => {
  const query = new URLSearchParams({ limit: String(limit) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  if (cursor) query.set('cursor', cursor);
  return query.toString();
};

export const recipeKeys = {
  all: ['recipes'] as const,
  list: (filters: RecipeFilters) => ['recipes', 'list', filters] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
  public: (limit: number) => ['recipes', 'public', limit] as const,
  publicDetail: (id: string) => ['recipes', 'public-detail', id] as const,
  facets: (query: { q?: string; saveList?: string }) => ['recipes', 'facets', query] as const,
};

const mutationId = () =>
  `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

async function executeRecipeMutation(
  mutation: import('@/features/offline/recipes').OfflineRecipeMutation,
) {
  if (mutation.type === 'delete') {
    await apiFetch<void>(recipe(mutation.recipeId), {
      method: 'DELETE',
    });
    return null;
  }
  return apiFetch<RecipeDetail>(recipe(mutation.recipeId), {
    body: mutation.patch,
    method: 'PATCH',
  });
}

export async function syncPendingRecipeMutations(userId: string) {
  const pending = await listOfflineRecipeMutations(userId);
  for (const mutation of pending) {
    try {
      const recipe = await executeRecipeMutation(mutation);
      if (recipe) await cacheOfflineRecipe(userId, recipe);
      else await deleteOfflineRecipe(userId, mutation.recipeId);
      await deleteOfflineRecipeMutation(mutation.id);
    } catch (error) {
      await failOfflineRecipeMutation(
        mutation.id,
        error instanceof Error ? error.message : 'Recipe synchronization failed',
      );
      const disposition = mutationFailureDisposition(
        error instanceof ApiError ? error.status : undefined,
        mutation.type === 'delete',
      );
      if (disposition !== 'resolved') throw error;
      await deleteOfflineRecipe(userId, mutation.recipeId);
      await deleteOfflineRecipeMutation(mutation.id);
    }
  }
}

export function useRecipeFacets(query: { q?: string; saveList?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: recipeKeys.facets(query),
    queryFn: async () => {
      if (!isOnlineNow() && user) {
        return getOfflineRecipeFacets(user.id, {
          q: query.q,
          saveList: query.saveList as RecipeFilters['saveList'],
        });
      }
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.saveList) params.set('saveList', query.saveList);
      try {
        return await apiFetch<RecipeFacets>(recipeFacets(params.toString()));
      } catch (error) {
        if (!user) throw error;
        return getOfflineRecipeFacets(user.id, {
          q: query.q,
          saveList: query.saveList as RecipeFilters['saveList'],
        });
      }
    },
    networkMode: 'always',
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RecipeUpdate }) => {
      const mutation = { id: mutationId(), patch, recipeId: id, type: 'update' as const };
      if (isOnlineNow()) {
        try {
          return (await executeRecipeMutation(mutation)) as RecipeDetail;
        } catch (error) {
          if (error instanceof ApiError && error.status < 500) throw error;
        }
      }
      const current = user ? await getOfflineRecipe(user.id, id) : null;
      if (!user || !current)
        throw new Error('Open this recipe online once before editing offline.');
      const updatedAt = new Date().toISOString();
      const { workspaceState: workspacePatch, ...recipePatch } = patch;
      const recipe: RecipeDetail = {
        ...current,
        ...recipePatch,
        ...(workspacePatch ? { workspaceState: { ...workspacePatch, updatedAt } } : {}),
        updatedAt,
      };
      await cacheOfflineRecipe(user.id, recipe);
      await queueOfflineRecipeMutation(user.id, mutation);
      return recipe;
    },
    onSuccess: async (recipe) => {
      queryClient.setQueryData(recipeKeys.detail(recipe._id), recipe);
      if (user) await cacheOfflineRecipe(user.id, recipe);
      void queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const mutation = { id: mutationId(), recipeId: id, type: 'delete' as const };
      if (isOnlineNow()) {
        try {
          await executeRecipeMutation(mutation);
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status < 500) throw error;
        }
      }
      if (!user) throw new Error('Sign in to delete this recipe.');
      await deleteOfflineRecipe(user.id, id);
      await queueOfflineRecipeMutation(user.id, mutation);
    },
    onSuccess: async (_, id) => {
      if (user) await deleteOfflineRecipe(user.id, id);
      queryClient.removeQueries({ queryKey: recipeKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

export function useRecipes(filters: RecipeFilters, limit = 20) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: recipeKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      if (!isOnlineNow() && user) return listOfflineRecipes(user.id, filters);
      try {
        const response = await apiFetch<RecipesResponse>(
          recipes(queryString(filters, pageParam, limit)),
        );
        if (user) await cacheOfflineRecipeSummaries(user.id, response.recipes);
        return response;
      } catch (error) {
        if (!user) throw error;
        const local = await listOfflineRecipes(user.id, filters);
        if (!isOnlineNow() || local.total > 0) return local;
        throw error;
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
    networkMode: 'always',
  });
}

export function useRecentRecipes(limit = 6) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...recipeKeys.all, 'recent', limit],
    queryFn: async () => {
      if (!isOnlineNow() && user) {
        const local = await listOfflineRecipes(user.id, {});
        return { ...local, recipes: local.recipes.slice(0, limit), total: local.total };
      }
      try {
        const response = await apiFetch<RecipesResponse>(recipes(`limit=${limit}`));
        if (user) await cacheOfflineRecipeSummaries(user.id, response.recipes);
        return response;
      } catch (error) {
        if (!user) throw error;
        const local = await listOfflineRecipes(user.id, {});
        if (!isOnlineNow() || local.total > 0) {
          return { ...local, recipes: local.recipes.slice(0, limit), total: local.total };
        }
        throw error;
      }
    },
    networkMode: 'always',
  });
}

export function usePublicRecipes(limit = 8) {
  return useQuery({
    queryKey: recipeKeys.public(limit),
    queryFn: () => apiFetch<PublicRecipesResponse>(publicRecipes(`limit=${limit}`)),
  });
}

export function useRecipe(id: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: recipeKeys.detail(id ?? ''),
    queryFn: async () => {
      const recipeId = id ?? '';
      if (!isOnlineNow() && user) {
        const local = await getOfflineRecipe(user.id, recipeId);
        if (local) return local;
        throw new Error('This recipe has not been saved for offline use yet.');
      }
      try {
        const detail = await apiFetch<RecipeDetail>(recipe(recipeId));
        if (user) await cacheOfflineRecipe(user.id, detail);
        return detail;
      } catch (error) {
        if (!user) throw error;
        const local = await getOfflineRecipe(user.id, recipeId);
        if (local) return local;
        throw error;
      }
    },
    enabled: Boolean(id),
    networkMode: 'always',
    refetchInterval: (query) => {
      const status = query.state.data?.categorizationStatus;
      return status === 'pending' || status === 'processing' ? 1500 : false;
    },
  });
}

export function usePublicRecipe(id: string | null) {
  return useQuery({
    queryKey: recipeKeys.publicDetail(id ?? ''),
    queryFn: () => apiFetch<PublicRecipeDetail>(publicRecipe(id ?? '')),
    enabled: Boolean(id),
  });
}
