import type { CookingDocument, StructuredRecipe } from 'librechat-data-provider';

import {
  hasUsableStructuredRecipe,
  shouldRenderCanonicalMarkdown,
  shouldRenderRecipeMarkdown,
} from './document';

const placeholderRecipe = (): StructuredRecipe => ({
  title: 'Vegetable Lasagna',
  description: '',
  servings: 2,
  timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
  ingredients: [
    {
      id: 'ingredient-1',
      item: 'item',
      originalText: '1 item',
      quantityType: 'estimated',
    },
  ],
  steps: [
    {
      id: 'step-1',
      ingredientIds: ['ingredient-1'],
      order: 1,
      text: 'Prepare the recipe.',
      timers: [],
      tips: [],
      warnings: [],
    },
  ],
  notes: [],
  tags: [],
});

const document = (recipe: StructuredRecipe, documentMarkdown?: string): CookingDocument => ({
  _id: 'document-1',
  user: 'user-1',
  conversationId: 'conversation-1',
  prompt: recipe.title,
  status: 'active',
  documentType: 'recipe',
  selected: true,
  documentMarkdown,
  recipe,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
});

describe('cooking canvas document selection', () => {
  test('uses canonical markdown when structured data is only the server fallback', () => {
    const recipe = placeholderRecipe();
    const markdown = '# Vegetable Lasagna\n\n## Ingredients\n\n- Pasta\n\n## Method\n\n1. Bake.';

    expect(hasUsableStructuredRecipe(recipe)).toBe(false);
    expect(shouldRenderCanonicalMarkdown(document(recipe, markdown))).toBe(true);
  });

  test('keeps native controls for a complete structured recipe', () => {
    const recipe = placeholderRecipe();
    recipe.ingredients = [
      {
        id: 'ingredient-1',
        item: 'lasagna sheets',
        originalText: '8 lasagna sheets',
        quantityType: 'measured',
      },
    ];
    recipe.steps[0] = { ...recipe.steps[0]!, text: 'Layer and bake the lasagna.' };

    expect(hasUsableStructuredRecipe(recipe)).toBe(true);
    expect(shouldRenderCanonicalMarkdown(document(recipe, '# Vegetable Lasagna'))).toBe(false);
  });

  test('does not replace the fallback when no complete markdown exists', () => {
    expect(shouldRenderCanonicalMarkdown(document(placeholderRecipe()))).toBe(false);
  });

  test('uses saved recipe markdown even when the API detail omits structured-only fields', () => {
    expect(
      shouldRenderRecipeMarkdown({
        documentMarkdown: '# Mangalorean Chicken Ghee Roast\n\n## Ingredients\n\n- Chicken',
        recipe: {
          ingredients: [{ originalText: '1 item' }],
          steps: [{ text: 'Prepare the recipe.' }],
        },
      }),
    ).toBe(true);
  });
});
