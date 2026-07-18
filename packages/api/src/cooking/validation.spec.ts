import { personalizeRecipe } from './validation';
import type { StructuredRecipe } from 'librechat-data-provider';

describe('Recipe Personalization Engine', () => {
  const baseRecipe = (): StructuredRecipe => ({
    title: 'Chocolate Chip Cookies',
    description: 'Classic chocolate chip cookies',
    servings: 12,
    timing: { prepMinutes: 15, cookMinutes: 10, totalMinutes: 25 },
    ingredients: [
      {
        id: 'ing-1',
        originalText: '2 tsp kosher salt',
        item: 'kosher salt',
        quantity: 2,
        unit: 'tsp',
        quantityType: 'measured',
      },
      {
        id: 'ing-2',
        originalText: '2 cups all-purpose flour',
        item: 'all-purpose flour',
        quantity: 2,
        unit: 'cups',
        quantityType: 'measured',
      },
      {
        id: 'ing-3',
        originalText: '1 cup packed brown sugar',
        item: 'packed brown sugar',
        quantity: 1,
        unit: 'cup',
        quantityType: 'measured',
      },
      {
        id: 'ing-4',
        originalText: '1 cup heavy whipping cream',
        item: 'heavy whipping cream',
        quantity: 1,
        unit: 'cup',
        quantityType: 'measured',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Preheat oven to 375°F and bake.',
        ingredientIds: ['ing-1', 'ing-2'],
        timers: [],
        warnings: [],
        tips: [],
        temperature: {
          value: 375,
          unit: 'F',
          appliance: 'oven',
        },
      },
    ],
    notes: [],
    tags: [],
  });

  test('should return original recipe if no preferences provided', () => {
    const recipe = baseRecipe();
    const result = personalizeRecipe(recipe);
    expect(result.recipe).toEqual(recipe);
    expect(result.adjustments).toEqual([]);
  });

  test('should personalize ingredients for India location', () => {
    const preferences = '## Location\n- Dwarka, Delhi, India.';
    const result = personalizeRecipe(baseRecipe(), preferences);
    const { recipe, adjustments } = result;

    // Kosher salt should convert to fine table salt with half amount
    const salt = recipe.ingredients.find((i) => i.id === 'ing-1');
    expect(salt?.item).toBe('fine table salt');
    expect(salt?.quantity).toBe(1);
    expect(salt?.originalText).toBe('1 tsp fine table salt');
    expect(adjustments.some((a) => a.includes('Converted kosher salt'))).toBe(true);

    // All purpose flour should map to maida
    const flour = recipe.ingredients.find((i) => i.id === 'ing-2');
    expect(flour?.item).toBe('maida (AP flour)');
    expect(flour?.originalText).toContain('maida (AP flour)');
    expect(adjustments.some((a) => a.includes('Mapped All-Purpose Flour'))).toBe(true);

    // Brown sugar should include substitute warning
    const sugar = recipe.ingredients.find((i) => i.id === 'ing-3');
    expect(sugar?.originalText).toContain('or white sugar + 1 tsp honey/molasses per cup');
    expect(adjustments.some((a) => a.includes('brown sugar substitution'))).toBe(true);

    // Heavy whipping cream should include Amul fresh cream fat warning
    const cream = recipe.ingredients.find((i) => i.id === 'ing-4');
    expect(cream?.originalText).toContain("Note: Amul fresh cream has 25% fat and won't whip");
    expect(adjustments.some((a) => a.includes('whipping cream fat-content warning'))).toBe(true);
  });

  test('should adjust oven temperatures for convection/fan ovens', () => {
    const preferences = '## Kitchen\n- I have a convection oven.';
    const result = personalizeRecipe(baseRecipe(), preferences);
    const { recipe, adjustments } = result;

    const step = recipe.steps[0];
    expect(step.temperature?.value).toBe(350); // 375 - 25
    expect(step.tips).toContain(
      'Adjusted baking temperature down by 25°F for your convection/fan oven.',
    );
    expect(adjustments.some((a) => a.includes('Adjusted baking temperature'))).toBe(true);
  });
});
