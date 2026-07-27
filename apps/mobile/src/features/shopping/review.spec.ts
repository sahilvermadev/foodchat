import type { Ingredient, StructuredRecipe } from 'librechat-data-provider';

import { groupRecipeIngredients } from './review-model';

const ingredient = (id: string, group?: string): Ingredient => ({
  group,
  id,
  item: id,
  originalText: id,
  quantityType: 'estimated',
});

describe('groupRecipeIngredients', () => {
  it('is safe while recipe data is unavailable', () => {
    expect(groupRecipeIngredients(undefined)).toEqual([]);
  });

  it('keeps adjacent ingredient sections in document order', () => {
    const recipe = {
      ingredients: [ingredient('chicken', 'Main'), ingredient('salt', 'Main'), ingredient('oil')],
    } as StructuredRecipe;

    expect(groupRecipeIngredients(recipe)).toEqual([
      { title: 'Main', ingredients: recipe.ingredients.slice(0, 2) },
      { title: undefined, ingredients: recipe.ingredients.slice(2) },
    ]);
  });

  it('starts a group when the first ingredient has no section heading', () => {
    const recipe = {
      ingredients: [ingredient('chicken'), ingredient('curd')],
    } as StructuredRecipe;

    expect(groupRecipeIngredients(recipe)).toEqual([
      { title: undefined, ingredients: recipe.ingredients },
    ]);
  });
});
