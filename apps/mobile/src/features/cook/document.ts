import type { CookingDocument } from 'librechat-data-provider';
import { hasUsableStructuredRecipe } from 'librechat-data-provider/mobile';

export { hasUsableStructuredRecipe } from 'librechat-data-provider/mobile';

type RecipeDisplayContent = {
  ingredients: Array<{ item?: string; originalText: string }>;
  steps: Array<{ text: string }>;
};

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
