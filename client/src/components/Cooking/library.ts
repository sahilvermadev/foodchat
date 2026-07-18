import type { RecipeCategorizationStatus } from 'librechat-data-provider';

export function isRecipeCategorizationActive(status: RecipeCategorizationStatus): boolean {
  return status === 'pending' || status === 'processing';
}
