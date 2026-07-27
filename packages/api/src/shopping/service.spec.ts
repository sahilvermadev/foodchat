import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '@librechat/data-schemas';
import {
  addShoppingItems,
  clearPurchasedShoppingItems,
  deleteShoppingItem,
  deleteShoppingContribution,
  getShoppingList,
  mergeShoppingListItems,
  updateShoppingItem,
} from './service';

jest.setTimeout(60000);

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await mongoose.models.ShoppingList.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('shopping list service', () => {
  test('creates one active list and merges compatible recipe ingredients', async () => {
    await addShoppingItems('user-1', [
      {
        displayName: 'Feta cheese, crumbled',
        quantity: 500,
        unit: 'g',
        recipeReference: {
          ingredientId: 'feta-a',
          recipeId: 'recipe-a',
          recipeTitle: 'Salad',
        },
      },
    ]);
    const list = await addShoppingItems('user-1', [
      {
        displayName: 'feta cheese',
        quantity: 1,
        unit: 'kg',
        recipeReference: {
          ingredientId: 'feta-b',
          recipeId: 'recipe-b',
          recipeTitle: 'Pie',
        },
      },
    ]);

    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      canonicalName: 'feta cheese',
      quantity: 1500,
      unit: 'g',
    });
    expect(list.items[0].contributions).toHaveLength(2);
    await expect(mongoose.models.ShoppingList.countDocuments({ user: 'user-1' })).resolves.toBe(1);
  });

  test('deduplicates replayed manual mutations', async () => {
    const input = { contributionId: 'manual-1', displayName: 'milk', quantity: 1, unit: 'l' };
    await addShoppingItems('user-1', [input], 'mutation-1');
    const replayed = await addShoppingItems('user-1', [input], 'mutation-1');
    expect(replayed.items).toHaveLength(1);
    expect(replayed.items[0].quantity).toBe(1);
  });

  test('serves existing reference-based lists as contribution-based items', async () => {
    const now = '2026-07-27T00:00:00.000Z';
    await mongoose.models.ShoppingList.create({
      user: 'legacy-user',
      items: [
        {
          id: 'garlic',
          canonicalName: 'garlic',
          displayName: 'garlic',
          quantity: 3,
          unit: 'cloves',
          category: 'produce',
          purchased: false,
          optional: false,
          pantry: false,
          recipeReferences: [
            {
              ingredientId: 'garlic',
              quantity: 3,
              recipeId: 'saved:recipe-a',
              recipeTitle: 'Recipe A',
              unit: 'cloves',
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const list = await getShoppingList('legacy-user');
    expect(list.items[0].contributions[0]).toMatchObject({
      id: 'recipe:recipe-a:garlic',
      recipeId: 'recipe-a',
    });
  });

  test('removes one recipe contribution without deleting the merged item', async () => {
    const list = await addShoppingItems('user-1', [
      {
        displayName: 'garlic',
        quantity: 3,
        unit: 'cloves',
        recipeReference: {
          ingredientId: 'garlic-a',
          recipeId: 'a',
          recipeTitle: 'A',
        },
      },
      {
        displayName: 'garlic',
        quantity: 2,
        unit: 'cloves',
        recipeReference: {
          ingredientId: 'garlic-b',
          recipeId: 'b',
          recipeTitle: 'B',
        },
      },
    ]);
    const next = await deleteShoppingContribution(
      'user-1',
      list.items[0].id,
      'recipe:a:garlic-a',
      'remove-a',
    );
    expect(next?.items[0].quantity).toBe(2);
    expect(next?.items[0].contributions).toHaveLength(1);
  });

  test('does not merge incompatible measurements', async () => {
    const list = await addShoppingItems('user-1', [
      { displayName: 'flour', quantity: 2, unit: 'cups' },
      { displayName: 'flour', quantity: 250, unit: 'g' },
    ]);
    expect(list.items).toHaveLength(2);
  });

  test('merges a user-confirmed possible duplicate', async () => {
    const list = await addShoppingItems('user-1', [
      { displayName: 'tomato', quantity: 2, unit: 'whole' },
      { displayName: 'roma tomato', quantity: 3, unit: 'whole' },
    ]);
    const merged = await mergeShoppingListItems(
      'user-1',
      list.items[0].id,
      list.items[1].id,
      'merge-tomatoes',
    );
    expect(merged?.items).toHaveLength(1);
    expect(merged?.items[0].quantity).toBe(5);
  });

  test('isolates lists by user and supports update, delete, and clear purchased', async () => {
    const first = await addShoppingItems('user-1', [
      { displayName: 'tomatoes' },
      { displayName: 'olive oil' },
    ]);
    await addShoppingItems('user-2', [{ displayName: 'milk' }]);
    const tomato = first.items.find((item) => item.canonicalName === 'tomato')!;
    const oil = first.items.find((item) => item.canonicalName === 'olive oil')!;

    const updated = await updateShoppingItem('user-1', tomato.id, { purchased: true });
    expect(updated?.items.find((item) => item.id === tomato.id)?.purchased).toBe(true);
    const cleared = await clearPurchasedShoppingItems('user-1');
    expect(cleared.items.map((item) => item.id)).toEqual([oil.id]);
    const deleted = await deleteShoppingItem('user-1', oil.id);
    expect(deleted?.items).toHaveLength(0);
    await expect(getShoppingList('user-2')).resolves.toMatchObject({
      items: [expect.objectContaining({ canonicalName: 'milk' })],
    });
  });
});
