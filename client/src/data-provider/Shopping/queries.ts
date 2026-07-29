import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { ShoppingList } from 'librechat-data-provider';

export const useShoppingListQuery = (): QueryObserverResult<ShoppingList> =>
  useQuery<ShoppingList>([QueryKeys.shoppingList], () => dataService.getShoppingList(), {
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
