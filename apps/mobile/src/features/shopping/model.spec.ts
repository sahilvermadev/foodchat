import type { ShoppingList } from 'librechat-data-provider';
import { applyOfflineShoppingMutation } from './model';

const now = '2026-07-27T00:00:00.000Z';
const list = (): ShoppingList => ({
  _id: 'list-1',
  name: 'Shopping list',
  items: [],
  createdAt: now,
  updatedAt: now,
});

describe('offline shopping mutations', () => {
  it('uses the same compatible merge behavior as the server', () => {
    const first = applyOfflineShoppingMutation(
      list(),
      {
        id: 'add-1',
        type: 'add',
        request: {
          mutationId: 'add-1',
          items: [{ contributionId: 'manual-1', displayName: 'feta', quantity: 500, unit: 'g' }],
        },
      },
      () => 'item-1',
      now,
    );
    const merged = applyOfflineShoppingMutation(
      first,
      {
        id: 'add-2',
        type: 'add',
        request: {
          mutationId: 'add-2',
          items: [{ contributionId: 'manual-2', displayName: 'feta', quantity: 1, unit: 'kg' }],
        },
      },
      () => 'item-2',
      now,
    );
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].quantity).toBeCloseTo(1500);
  });

  it('applies update, delete, and clear operations locally', () => {
    const added = applyOfflineShoppingMutation(
      list(),
      {
        type: 'add',
        id: 'add-items',
        request: {
          mutationId: 'add-items',
          items: [{ displayName: 'tomato' }, { displayName: 'milk' }],
        },
      },
      (() => {
        let index = 0;
        return () => `item-${++index}`;
      })(),
      now,
    );
    const purchased = applyOfflineShoppingMutation(
      added,
      { id: 'purchase', type: 'update', itemId: 'item-1', patch: { purchased: true } },
      () => 'unused',
      now,
    );
    const cleared = applyOfflineShoppingMutation(
      purchased,
      { id: 'clear', type: 'clear_purchased' },
      () => 'unused',
      now,
    );
    expect(cleared.items.map((item) => item.canonicalName)).toEqual(['milk']);
    const deleted = applyOfflineShoppingMutation(
      cleared,
      { id: 'delete', type: 'delete', itemId: 'item-2' },
      () => 'unused',
      now,
    );
    expect(deleted.items).toHaveLength(0);
  });

  it('removes contributions and merges confirmed duplicates offline', () => {
    const added = applyOfflineShoppingMutation(
      list(),
      {
        id: 'add-recipes',
        type: 'add',
        request: {
          mutationId: 'add-recipes',
          items: [
            {
              displayName: 'tomato',
              quantity: 2,
              unit: 'whole',
              recipeReference: { ingredientId: 'tomato', recipeId: 'a', recipeTitle: 'A' },
            },
            { displayName: 'roma tomato', quantity: 3, unit: 'whole' },
          ],
        },
      },
      (() => {
        let index = 0;
        return () => `item-${++index}`;
      })(),
      now,
    );
    const merged = applyOfflineShoppingMutation(
      added,
      { id: 'merge', type: 'merge_items', targetId: 'item-1', sourceId: 'item-2' },
      () => 'unused',
      now,
    );
    expect(merged.items[0].quantity).toBe(5);
    const removed = applyOfflineShoppingMutation(
      merged,
      {
        id: 'remove',
        type: 'remove_contribution',
        itemId: 'item-1',
        contributionId: 'recipe:a:tomato',
      },
      () => 'unused',
      now,
    );
    expect(removed.items[0].quantity).toBe(3);
  });
});
