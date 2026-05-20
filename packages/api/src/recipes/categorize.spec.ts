import type { StructuredRecipe } from 'librechat-data-provider';
import { inferTimeBucket, normalizeCategorization } from './categorize';

const recipe: StructuredRecipe = {
  title: 'Soup',
  description: '',
  servings: 2,
  timing: { prepMinutes: 5, cookMinutes: 20, totalMinutes: 25 },
  ingredients: [
    {
      id: 'ingredient-1',
      originalText: '1 cup lentils',
      item: 'lentils',
      quantityType: 'measured',
    },
  ],
  steps: [
    {
      id: 'step-1',
      order: 1,
      text: 'Cook lentils.',
      ingredientIds: ['ingredient-1'],
      timers: [],
      warnings: [],
      tips: [],
    },
  ],
  notes: [],
  tags: [],
};

describe('recipe categorization helpers', () => {
  test('normalizes category casing, duplicates, array limits, and invalid enums', () => {
    const categorization = normalizeCategorization(
      {
        cuisine: [' Indian ', 'indian', 'North-Indian'],
        mealType: ['Dinner'],
        dishType: ['Soup', 'Stew', 'Curry', 'Dal', 'Bowl', 'Main', 'Side', 'Lunch', 'Extra'],
        diet: ['Vegetarian'],
        difficulty: 'expert',
        timeBucket: 'wrong',
        occasion: [],
        equipment: ['Dutch_Oven'],
        mainIngredients: ['Lentils'],
        techniques: ['Simmering'],
        flavorProfile: ['Savory'],
        confidence: 2,
      },
      { model: 'test-model', recipe, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    );

    expect(categorization.cuisine).toEqual(['indian', 'north indian']);
    expect(categorization.dishType).toHaveLength(8);
    expect(categorization.difficulty).toBeUndefined();
    expect(categorization.timeBucket).toBe('under_30');
    expect(categorization.equipment).toEqual(['dutch oven']);
    expect(categorization.confidence).toBe(1);
    expect(categorization.model).toBe('test-model');
    expect(categorization.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test.each([
    [15, 'under_15'],
    [30, 'under_30'],
    [60, 'under_60'],
    [61, 'long_cook'],
  ])('infers %s minute recipes as %s', (totalMinutes, expected) => {
    expect(
      inferTimeBucket({
        ...recipe,
        timing: { prepMinutes: 0, cookMinutes: totalMinutes, totalMinutes },
      }),
    ).toBe(expected);
  });
});
