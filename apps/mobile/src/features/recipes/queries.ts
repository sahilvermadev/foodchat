import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/provider';
import { isOnlineNow } from '@/features/connectivity/provider';
import {
  cacheOfflineRecipe,
  cacheOfflineRecipeSummaries,
  deleteOfflineRecipe,
  getOfflineRecipe,
  listOfflineRecipes,
} from '@/features/offline/recipes';
import { apiFetch } from '@/lib/api/client';
import type {
  PublicRecipeDetail,
  PublicRecipesResponse,
  RecipeDetail,
  RecipeFilters,
  RecipeFacets,
  RecipesResponse,
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

export function useRecipeFacets(query: { q?: string; saveList?: string }) {
  return useQuery({
    queryKey: recipeKeys.facets(query),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.q) params.set('q', query.q);
      if (query.saveList) params.set('saveList', query.saveList);
      return apiFetch<RecipeFacets>(`/api/recipes/facets?${params.toString()}`);
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RecipeDetail> }) =>
      apiFetch<RecipeDetail>(`/api/recipes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
      }),
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
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
          `/api/recipes?${queryString(filters, pageParam, limit)}`,
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
        const response = await apiFetch<RecipesResponse>(`/api/recipes?limit=${limit}`);
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
    queryFn: () => apiFetch<PublicRecipesResponse>(`/api/recipes/explore?limit=${limit}`),
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
        const recipe = await apiFetch<RecipeDetail>(`/api/recipes/${encodeURIComponent(recipeId)}`);
        if (user) await cacheOfflineRecipe(user.id, recipe);
        return recipe;
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
    queryFn: () =>
      apiFetch<PublicRecipeDetail>(`/api/recipes/explore/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
  });
}
