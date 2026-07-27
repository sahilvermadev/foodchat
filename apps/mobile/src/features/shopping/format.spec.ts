import type { ShoppingList } from 'librechat-data-provider';
import { createShoppingItem } from 'librechat-data-provider/mobile';
import { shoppingItemAmount, shoppingListText } from './format';

const now = '2026-07-27T00:00:00.000Z';

describe('shopping list formatting', () => {
  it('formats fractions without the malformed source spacing', () => {
    const item = createShoppingItem(
      { displayName: 'red onion', quantity: 0.5, unit: 'medium' },
      'onion',
      now,
    );
    expect(shoppingItemAmount(item)).toBe('1/2 medium');
  });

  it('shares only items still needed and prefers purchase quantities', () => {
    const needed = createShoppingItem(
      { displayName: 'hummus', purchaseQuantity: '1 tub' },
      'hummus',
      now,
    );
    const pantry = { ...createShoppingItem({ displayName: 'salt' }, 'salt', now), pantry: true };
    const purchased = {
      ...createShoppingItem({ displayName: 'tomato' }, 'tomato', now),
      purchased: true,
    };
    const list: ShoppingList = {
      _id: 'list',
      name: 'Shopping list',
      items: [needed, pantry, purchased],
      createdAt: now,
      updatedAt: now,
    };
    expect(shoppingListText(list)).toBe('Shopping list\n\n• 1 tub hummus');
  });
});
