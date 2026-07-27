import type { StructuredRecipe } from 'librechat-data-provider';
import { categorizeRecipe, inferTimeBucket, normalizeCategorization } from './categorize';

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
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.RECIPE_CATEGORIZATION_API_KEY;
  });

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

  test('combines LLM suggestions with deterministic safety verification and provenance', async () => {
    process.env.RECIPE_CATEGORIZATION_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                shortDescription: 'A creamy lentil soup.',
                cuisine: [],
                mealType: ['dinner'],
                dishType: ['soup'],
                diet: ['vegan', 'gluten free'],
                occasion: [],
                equipment: ['Dutch oven'],
                mainIngredients: ['lentils'],
                techniques: ['simmering'],
                flavorProfile: ['savory'],
              }),
            },
          },
        ],
      }),
    } as Response);
    const dairyRecipe: StructuredRecipe = {
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        {
          id: 'ingredient-2',
          item: 'yogurt',
          originalText: '1 cup yogurt',
          quantityType: 'measured',
        },
      ],
    };

    const result = await categorizeRecipe({
      title: dairyRecipe.title,
      documentMarkdown: '# Soup',
      recipe: dairyRecipe,
    });

    expect(result.categorization.diet).toEqual(['gluten free']);
    expect(result.categorization.potentialAllergens).toEqual(['Dairy']);
    expect(result.categorization.source).toBe('hybrid');
    expect(result.categorization.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'allergen', source: 'ingredient_rules', value: 'Dairy' }),
      ]),
    );
  });
});
