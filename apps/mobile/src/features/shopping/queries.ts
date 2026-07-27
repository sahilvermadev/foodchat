import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type {
  AddShoppingItemInput,
  AddShoppingItemsRequest,
  ShoppingList,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import { useAuth } from '@/features/auth/provider';
import { isOnlineNow } from '@/features/connectivity/provider';
import {
  cacheOfflineShoppingList,
  countOfflineShoppingMutations,
  deleteOfflineShoppingMutation,
  getOfflineShoppingList,
  listOfflineShoppingMutations,
  queueOfflineShoppingMutation,
} from '@/features/offline/shopping';
import { ApiError, apiFetch } from '@/lib/api/client';
import { applyOfflineShoppingMutation } from './model';
import type { OfflineShoppingMutation } from './model';

export const shoppingKeys = {
  all: ['shopping-list'] as const,
  pending: ['shopping-list', 'pending'] as const,
};

const localId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const emptyList = (): ShoppingList => {
  const now = new Date().toISOString();
  return {
    _id: 'offline-shopping-list',
    name: 'Shopping list',
    items: [],
    createdAt: now,
    updatedAt: now,
  };
};

const withInputIds = (items: AddShoppingItemInput[], mutationId: string) =>
  items.map((item, index) => ({
    ...item,
    id: item.id ?? `${mutationId}:item:${index}`,
    contributionId:
      item.contributionId ??
      (item.recipeReference ? undefined : `${mutationId}:contribution:${index}`),
  }));

async function executeMutation(mutation: OfflineShoppingMutation): Promise<ShoppingList> {
  if (mutation.type === 'add') {
    return apiFetch<ShoppingList>('/api/shopping-list/items', {
      body: mutation.request,
      method: 'POST',
    });
  }
  const request = {
    headers: { 'Idempotency-Key': mutation.id },
  };
  if (mutation.type === 'update') {
    return apiFetch<ShoppingList>(
      `/api/shopping-list/items/${encodeURIComponent(mutation.itemId)}`,
      { ...request, body: mutation.patch, method: 'PATCH' },
    );
  }
  if (mutation.type === 'delete') {
    return apiFetch<ShoppingList>(
      `/api/shopping-list/items/${encodeURIComponent(mutation.itemId)}`,
      { ...request, method: 'DELETE' },
    );
  }
  if (mutation.type === 'remove_contribution') {
    return apiFetch<ShoppingList>(
      `/api/shopping-list/items/${encodeURIComponent(mutation.itemId)}/contributions/${encodeURIComponent(mutation.contributionId)}`,
      { ...request, method: 'DELETE' },
    );
  }
  if (mutation.type === 'merge_items') {
    return apiFetch<ShoppingList>(
      `/api/shopping-list/items/${encodeURIComponent(mutation.targetId)}/merge/${encodeURIComponent(mutation.sourceId)}`,
      { ...request, method: 'POST' },
    );
  }
  return apiFetch<ShoppingList>('/api/shopping-list/clear-purchased', {
    ...request,
    method: 'POST',
  });
}

export async function syncPendingShoppingMutations(userId: string) {
  const pending = await listOfflineShoppingMutations(userId);
  let latest: ShoppingList | null = null;
  for (const entry of pending) {
    latest = await executeMutation(entry.mutation);
    await cacheOfflineShoppingList(userId, latest);
    await deleteOfflineShoppingMutation(entry.id);
  }
  return latest;
}

async function mutateShoppingList(userId: string, mutation: OfflineShoppingMutation) {
  if (isOnlineNow()) {
    try {
      const list = await executeMutation(mutation);
      await cacheOfflineShoppingList(userId, list);
      return list;
    } catch (error) {
      if (error instanceof ApiError) throw error;
    }
  }
  const current = (await getOfflineShoppingList(userId)) ?? emptyList();
  const next = applyOfflineShoppingMutation(current, mutation, () => localId('shopping-item'));
  await cacheOfflineShoppingList(userId, next);
  await queueOfflineShoppingMutation(userId, mutation.id, mutation);
  return next;
}

export function useShoppingList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: shoppingKeys.all,
    queryFn: async () => {
      if (!user) return emptyList();
      if (!isOnlineNow()) return (await getOfflineShoppingList(user.id)) ?? emptyList();
      try {
        await syncPendingShoppingMutations(user.id);
        const list = await apiFetch<ShoppingList>('/api/shopping-list');
        await cacheOfflineShoppingList(user.id, list);
        return list;
      } catch (error) {
        const local = await getOfflineShoppingList(user.id);
        if (local) return local;
        throw error;
      }
    },
    enabled: Boolean(user),
    networkMode: 'always',
  });
}

export function useShoppingPendingCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: shoppingKeys.pending,
    queryFn: () => (user ? countOfflineShoppingMutations(user.id) : 0),
    enabled: Boolean(user),
    networkMode: 'always',
  });
}

function useShoppingMutation<T>(
  mutation: (input: T, mutationId: string) => OfflineShoppingMutation,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pending = useRef(new Map<T, OfflineShoppingMutation>());
  const resolve = (input: T) => {
    const existing = pending.current.get(input);
    if (existing) return existing;
    const next = mutation(input, localId('shopping-mutation'));
    pending.current.set(input, next);
    return next;
  };
  return useMutation({
    mutationFn: async (input: T) => {
      if (!user) throw new Error('Sign in to update your shopping list.');
      return mutateShoppingList(user.id, resolve(input));
    },
    onMutate: async (input: T) => {
      await queryClient.cancelQueries({ queryKey: shoppingKeys.all });
      const previous = queryClient.getQueryData<ShoppingList>(shoppingKeys.all);
      if (previous) {
        queryClient.setQueryData(
          shoppingKeys.all,
          applyOfflineShoppingMutation(previous, resolve(input), () => localId('shopping-item')),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(shoppingKeys.all, context.previous);
    },
    onSuccess: (list) => queryClient.setQueryData(shoppingKeys.all, list),
    onSettled: (_data, _error, input) => {
      pending.current.delete(input);
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.pending });
    },
    networkMode: 'always',
  });
}

export const useAddShoppingItems = () =>
  useShoppingMutation<AddShoppingItemInput[]>((items, mutationId) => ({
    id: mutationId,
    type: 'add',
    request: {
      items: withInputIds(items, mutationId),
      mutationId,
    } satisfies AddShoppingItemsRequest,
  }));

export const useUpdateShoppingItem = () =>
  useShoppingMutation<{ itemId: string; patch: UpdateShoppingItemRequest }>((input, id) => ({
    id,
    type: 'update',
    itemId: input.itemId,
    patch: input.patch,
  }));

export const useDeleteShoppingItem = () =>
  useShoppingMutation<string>((itemId, id) => ({ id, type: 'delete', itemId }));

export const useRemoveShoppingContribution = () =>
  useShoppingMutation<{ contributionId: string; itemId: string }>((input, id) => ({
    id,
    type: 'remove_contribution',
    ...input,
  }));

export const useMergeShoppingItems = () =>
  useShoppingMutation<{ sourceId: string; targetId: string }>((input, id) => ({
    id,
    type: 'merge_items',
    ...input,
  }));

export const useClearPurchasedShoppingItems = () =>
  useShoppingMutation<void>((_input, id) => ({ id, type: 'clear_purchased' }));
