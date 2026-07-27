import type { StructuredRecipe } from 'librechat-data-provider';

export type IngredientGroup = {
  title?: string;
  ingredients: StructuredRecipe['ingredients'];
};

export function groupRecipeIngredients(recipe?: StructuredRecipe): IngredientGroup[] {
  const result: IngredientGroup[] = [];
  for (const ingredient of recipe?.ingredients ?? []) {
    const last = result[result.length - 1];
    if (last && last.title === ingredient.group) {
      last.ingredients.push(ingredient);
    } else {
      result.push({ title: ingredient.group, ingredients: [ingredient] });
    }
  }
  return result;
}
