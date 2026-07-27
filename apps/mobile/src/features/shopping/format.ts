import type { ShoppingList, ShoppingListItem } from 'librechat-data-provider';
import { formatQuantity } from '../recipes/workspace-format';

export const shoppingRequiredAmount = (item: ShoppingListItem) => {
  if (item.quantity == null) return '';
  return [formatQuantity(item.quantity), item.unit].filter(Boolean).join(' ');
};

export const shoppingPurchaseAmount = (item: ShoppingListItem) =>
  item.purchaseQuantity || shoppingRequiredAmount(item);

export const shoppingItemAmount = shoppingPurchaseAmount;

export const shoppingListText = (list: ShoppingList) => {
  const items = list.items
    .filter((item) => !item.purchased && !item.pantry)
    .map((item) => {
      const amount = shoppingItemAmount(item);
      const note = item.note ? ` — ${item.note}` : '';
      return `• ${[amount, item.displayName].filter(Boolean).join(' ')}${note}`;
    });
  return [list.name, '', ...items].join('\n').trim();
};
