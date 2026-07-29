import { recipeIngredientParts, recipeIngredientText, scaledYieldText } from './recipe-format';
import type { Ingredient } from './types/cooking';

const ingredient: Ingredient = {
  id: 'flour',
  item: 'flour',
  originalText: '2 cups flour',
  quantity: 2,
  quantityType: 'measured',
  unit: 'cups',
};

describe('cross-platform recipe formatting', () => {
  it('produces the same scaled display model for browser and native clients', () => {
    expect(recipeIngredientParts(ingredient, 1.5, 'original')).toEqual({
      amount: '3 cups',
      name: 'flour',
    });
    expect(recipeIngredientText(ingredient, 1, 'metric')).toBe('475 ml flour');
  });

  it('preserves a descriptive yield while changing its serving count', () => {
    expect(
      scaledYieldText({ baseServings: 24, currentServings: 12, yieldText: '24 meatballs' }),
    ).toBe('12 meatballs');
  });
});
