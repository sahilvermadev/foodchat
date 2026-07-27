import {
  recipeReaderContent,
  recipeSupplementFromMarkdown,
  structuredRecipeFromMarkdown,
} from './content';

describe('recipe reader content', () => {
  test('extracts recipe data into metrics without losing surrounding prose', () => {
    const content = recipeReaderContent(`# Pizza

Long fermented and crisp.

## Recipe Data

| Field | Value |
| --- | --- |
| Yield | 4 pizzas |
| Prep time | 20 minutes |
| Rise time | 2 hours or overnight |

## Ingredients

- Flour`);

    expect(content.beforeMetrics).toContain('Long fermented and crisp.');
    expect(content.metrics).toEqual([
      { label: 'Yield', value: '4 pizzas' },
      { label: 'Prep time', value: '20 minutes' },
      { label: 'Rise time', value: '2 hours or overnight' },
    ]);
    expect(content.afterMetrics).toContain('## Ingredients');
  });

  test('leaves markdown intact when no recipe data table exists', () => {
    const markdown = '## Ingredients\n\n- Tomatoes';
    expect(recipeReaderContent(markdown)).toEqual({
      afterMetrics: '',
      beforeMetrics: markdown,
      metrics: [],
    });
  });
});

describe('structuredRecipeFromMarkdown', () => {
  test('recovers interactive ingredients and steps from canonical markdown', () => {
    const fallback = {
      description: '',
      ingredients: [],
      notes: [],
      servings: 2,
      steps: [],
      tags: [],
      timing: { cookMinutes: 10, prepMinutes: 5, totalMinutes: 15 },
      title: 'Soup',
    };
    const recipe = structuredRecipeFromMarkdown(
      '# Soup\n\n## Ingredients\n- 2 cups stock\n- Salt\n\n## Method\n1. Simmer the stock.\n2. Season.',
      fallback,
    );
    expect(recipe?.ingredients.map((item) => item.originalText)).toEqual(['2 cups stock', 'Salt']);
    expect(recipe?.steps.map((step) => step.text)).toEqual(['Simmer the stock.', 'Season.']);
  });

  test('recovers ingredient tables and embedded cooking timers', () => {
    const fallback = {
      description: '',
      ingredients: [],
      notes: [],
      servings: 4,
      steps: [],
      tags: [],
      timing: { cookMinutes: 10, prepMinutes: 5, totalMinutes: 15 },
      title: 'Eggplant',
    };
    const recipe = structuredRecipeFromMarkdown(
      '# Eggplant\n\n## Ingredients\n| Ingredient | Quantity |\n| --- | --- |\n| Eggplant | 900 g |\n| Salt | to taste |\n| **Garnish** | |\n| Mint (optional) | 1 tbsp |\n\n## Instructions\n1. **Char the eggplant:** Cook for 10 minutes [timer:600].',
      fallback,
    );
    expect(recipe?.ingredients).toEqual([
      expect.objectContaining({ item: 'Eggplant', quantity: 900, unit: 'g' }),
      expect.objectContaining({ item: 'Salt', quantityType: 'to_taste' }),
      expect.objectContaining({ group: 'Garnish', item: 'Mint (optional)', optional: true }),
    ]);
    expect(recipe?.steps[0]).toEqual(
      expect.objectContaining({
        text: 'Char the eggplant: Cook for 10 minutes.',
        timers: [expect.objectContaining({ durationSeconds: 600 })],
      }),
    );
  });

  test('extracts optional supporting recipe sections without inventing content', () => {
    const supplement = recipeSupplementFromMarkdown(
      '## Equipment\n- Blender\n\n## Storage\nKeep chilled for 3 days.\n\n## Nutrition\n| Nutrient | Amount |\n| --- | --- |\n| Protein | 8 g |',
    );
    expect(supplement.equipment).toEqual(['Blender']);
    expect(supplement.storage).toEqual(['Keep chilled for 3 days.']);
    expect(supplement.nutrition).toEqual(['Protein: 8 g']);
    expect(supplement.safety).toEqual([]);
  });
});
