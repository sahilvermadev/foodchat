import type { CookingDocument } from 'librechat-data-provider';

type RecipeDisplayContent = {
  ingredients: Array<{ item?: string; originalText: string }>;
  steps: Array<{ text: string }>;
};

export function hasUsableStructuredRecipe(recipe: RecipeDisplayContent): boolean {
  const placeholderIngredient =
    recipe.ingredients.length === 1 &&
    (!recipe.ingredients[0]?.item || recipe.ingredients[0].item.trim().toLowerCase() === 'item') &&
    recipe.ingredients[0]?.originalText.trim().toLowerCase() === '1 item';
  const placeholderStep =
    recipe.steps.length === 1 &&
    recipe.steps[0]?.text.trim().toLowerCase() === 'prepare the recipe.';

  return !(placeholderIngredient && placeholderStep);
}

export function shouldRenderRecipeMarkdown(content: {
  documentMarkdown?: string;
  recipe?: RecipeDisplayContent;
}): boolean {
  return Boolean(
    content.documentMarkdown?.trim() &&
      (!content.recipe || !hasUsableStructuredRecipe(content.recipe)),
  );
}

export function shouldRenderCanonicalMarkdown(document: CookingDocument): boolean {
  return document.documentType === 'recipe' && shouldRenderRecipeMarkdown(document);
}
