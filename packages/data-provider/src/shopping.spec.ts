import {
  canonicalShoppingName,
  combineShoppingItems,
  compatibleShoppingUnits,
  createShoppingItem,
  mergeShoppingItem,
  normalizeShoppingList,
  possibleShoppingDuplicates,
  removeShoppingContribution,
  shoppingCategory,
} from './shopping';

describe('shopping list normalization', () => {
  it('removes preparation details without losing the ingredient identity', () => {
    expect(canonicalShoppingName('Roma tomato, Diced')).toBe('roma tomato');
    expect(canonicalShoppingName('Extra-virgin olive oil, liquid')).toBe('olive oil');
  });

  it('categorizes common ingredients for an in-store layout', () => {
    expect(shoppingCategory('roma tomato')).toBe('produce');
    expect(shoppingCategory('feta cheese')).toBe('dairy');
    expect(shoppingCategory('olive oil')).toBe('pantry');
  });

  it('only considers quantities compatible within the same measurement family', () => {
    expect(compatibleShoppingUnits('g', 'kg')).toBe(true);
    expect(compatibleShoppingUnits('tbsp', 'ml')).toBe(true);
    expect(compatibleShoppingUnits('cups', 'g')).toBe(false);
    expect(compatibleShoppingUnits(undefined, 'piece')).toBe(false);
  });

  it('merges compatible quantities and keeps recipe provenance', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const existing = createShoppingItem(
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
      'item-a',
      now,
    );
    const merged = mergeShoppingItem(
      existing,
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
      now,
    );
    expect(merged.quantity).toBeCloseTo(1500);
    expect(merged.contributions).toHaveLength(2);
  });

  it('replaces a contribution when the same recipe ingredient is added again', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const reference = {
      ingredientId: 'tomato-a',
      recipeId: 'recipe-a',
      recipeTitle: 'Salad',
      quantity: 2,
      unit: 'whole',
    };
    const existing = createShoppingItem(
      { displayName: 'tomato', quantity: 2, unit: 'whole', recipeReference: reference },
      'tomato',
      now,
    );
    const merged = mergeShoppingItem(
      existing,
      {
        displayName: 'tomato',
        quantity: 4,
        unit: 'whole',
        recipeReference: { ...reference, quantity: 4 },
      },
      now,
    );
    expect(merged.quantity).toBe(4);
    expect(merged.contributions).toHaveLength(1);
  });

  it('keeps identity-changing qualifiers while discarding preparation details', () => {
    expect(canonicalShoppingName('Flour (gluten-free)')).toBe('flour gluten-free');
    expect(canonicalShoppingName('Onion (finely chopped)')).toBe('onion');
  });

  it('moves a purchased item back to buy when a recipe increases its requirement', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const reference = {
      ingredientId: 'chicken',
      recipeId: 'recipe-a',
      recipeTitle: 'Chicken',
      quantity: 500,
      unit: 'g',
    };
    const existing = {
      ...createShoppingItem(
        { displayName: 'chicken', quantity: 500, unit: 'g', recipeReference: reference },
        'chicken',
        now,
      ),
      purchased: true,
    };
    const merged = mergeShoppingItem(
      existing,
      {
        displayName: 'chicken',
        quantity: 1000,
        unit: 'g',
        recipeReference: { ...reference, quantity: 1000 },
      },
      now,
    );
    expect(merged.purchased).toBe(false);
    expect(merged.quantity).toBe(1000);
  });

  it('removes one recipe contribution and recalculates the total', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const first = createShoppingItem(
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
      'garlic',
      now,
    );
    const merged = mergeShoppingItem(
      first,
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
      now,
    );
    const next = removeShoppingContribution(merged, 'recipe:a:garlic-a', now);
    expect(next?.quantity).toBe(2);
    expect(next?.contributions).toHaveLength(1);
  });

  it('suggests uncertain identity matches without merging them automatically', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const tomato = createShoppingItem(
      { displayName: 'tomato', quantity: 2, unit: 'whole' },
      'tomato',
      now,
    );
    const roma = createShoppingItem(
      { displayName: 'roma tomato', quantity: 3, unit: 'whole' },
      'roma',
      now,
    );
    expect(possibleShoppingDuplicates([tomato, roma])).toHaveLength(1);
    expect(combineShoppingItems(tomato, roma, now)?.quantity).toBe(5);
  });

  it('upgrades cached legacy recipe references into contributions', () => {
    const now = '2026-07-27T00:00:00.000Z';
    const list = normalizeShoppingList({
      _id: 'list',
      name: 'Shopping list',
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
      createdAt: now,
      updatedAt: now,
    });
    expect(list.items[0].contributions[0]).toMatchObject({
      id: 'recipe:recipe-a:garlic',
      recipeId: 'recipe-a',
    });
  });
});
