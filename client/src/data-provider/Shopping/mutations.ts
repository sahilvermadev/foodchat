import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  AddShoppingItemInput,
  ShoppingList,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';

const mutationId = () =>
  `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const useShoppingMutation = <TVariables>(
  key: MutationKeys,
  mutationFn: (variables: TVariables) => Promise<ShoppingList>,
): UseMutationResult<ShoppingList, unknown, TVariables> => {
  const queryClient = useQueryClient();
  return useMutation([key], {
    mutationFn,
    onSuccess: (list) => queryClient.setQueryData([QueryKeys.shoppingList], list),
  });
};

export const useAddShoppingItemsMutation = () =>
  useShoppingMutation<AddShoppingItemInput[]>(MutationKeys.addShoppingItems, (items) =>
    dataService.addShoppingItems({ items, mutationId: mutationId() }),
  );

export const useUpdateShoppingItemMutation = () =>
  useShoppingMutation<{ itemId: string; patch: UpdateShoppingItemRequest }>(
    MutationKeys.updateShoppingItem,
    ({ itemId, patch }) =>
      dataService.updateShoppingItem(itemId, { ...patch, mutationId: mutationId() }),
  );

export const useDeleteShoppingItemMutation = () =>
  useShoppingMutation<string>(MutationKeys.deleteShoppingItem, (itemId) =>
    dataService.deleteShoppingItem(itemId, mutationId()),
  );

export const useDeleteShoppingContributionMutation = () =>
  useShoppingMutation<{ contributionId: string; itemId: string }>(
    MutationKeys.deleteShoppingContribution,
    ({ contributionId, itemId }) =>
      dataService.deleteShoppingContribution(itemId, contributionId, mutationId()),
  );

export const useMergeShoppingItemsMutation = () =>
  useShoppingMutation<{ sourceId: string; targetId: string }>(
    MutationKeys.mergeShoppingItems,
    ({ sourceId, targetId }) => dataService.mergeShoppingItems(targetId, sourceId, mutationId()),
  );

export const useClearPurchasedShoppingItemsMutation = () =>
  useShoppingMutation<void>(MutationKeys.clearPurchasedShoppingItems, () =>
    dataService.clearPurchasedShoppingItems(mutationId()),
  );
