import type {
  AddShoppingItemsRequest,
  ShoppingList,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import {
  canonicalShoppingName,
  compatibleShoppingUnits,
  combineShoppingItems,
  createShoppingItem,
  mergeShoppingItem,
  removeShoppingContribution,
} from 'librechat-data-provider/mobile';

export type OfflineShoppingMutation =
  | { id: string; type: 'add'; request: AddShoppingItemsRequest }
  | { id: string; type: 'update'; itemId: string; patch: UpdateShoppingItemRequest }
  | { id: string; type: 'delete'; itemId: string }
  | { id: string; type: 'remove_contribution'; itemId: string; contributionId: string }
  | { id: string; type: 'merge_items'; targetId: string; sourceId: string }
  | { id: string; type: 'clear_purchased' };

export function applyOfflineShoppingMutation(
  list: ShoppingList,
  mutation: OfflineShoppingMutation,
  createId: () => string,
  now = new Date().toISOString(),
): ShoppingList {
  if (mutation.type === 'add') {
    const items = [...list.items];
    for (const input of mutation.request.items) {
      const name = canonicalShoppingName(input.displayName);
      const index = items.findIndex(
        (item) => item.canonicalName === name && compatibleShoppingUnits(item.unit, input.unit),
      );
      if (index >= 0) {
        items[index] = mergeShoppingItem(items[index], input, now);
      } else {
        items.push(createShoppingItem(input, input.id ?? createId(), now));
      }
    }
    return { ...list, items, updatedAt: now };
  }
  if (mutation.type === 'update') {
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== mutation.itemId) return item;
        const displayName = mutation.patch.displayName?.trim() || item.displayName;
        return {
          ...item,
          ...mutation.patch,
          canonicalName: canonicalShoppingName(displayName),
          displayName,
          updatedAt: now,
        };
      }),
      updatedAt: now,
    };
  }
  if (mutation.type === 'delete') {
    return {
      ...list,
      items: list.items.filter((item) => item.id !== mutation.itemId),
      updatedAt: now,
    };
  }
  if (mutation.type === 'remove_contribution') {
    return {
      ...list,
      items: list.items.flatMap((item) => {
        if (item.id !== mutation.itemId) return [item];
        const next = removeShoppingContribution(item, mutation.contributionId, now);
        return next ? [next] : [];
      }),
      updatedAt: now,
    };
  }
  if (mutation.type === 'merge_items') {
    const target = list.items.find((item) => item.id === mutation.targetId);
    const source = list.items.find((item) => item.id === mutation.sourceId);
    if (!target || !source) return list;
    const merged = combineShoppingItems(target, source, now);
    if (!merged) return list;
    return {
      ...list,
      items: list.items
        .filter((item) => item.id !== mutation.sourceId)
        .map((item) => (item.id === mutation.targetId ? merged : item)),
      updatedAt: now,
    };
  }
  return {
    ...list,
    items: list.items.filter((item) => !item.purchased),
    updatedAt: now,
  };
}
