import {
  formatRecipeQuantity,
  recipeIngredientParts,
  recipeIngredientText,
  scaledYieldText,
} from 'librechat-data-provider/mobile';
import type { RecipeUnitMode } from 'librechat-data-provider';

export type UnitMode = RecipeUnitMode;

export function restoredTimerState(
  state: { endsAt?: number; remaining: number; running: boolean } | undefined,
  durationSeconds: number,
  now = Date.now(),
) {
  if (!state) return { endsAt: undefined, remaining: durationSeconds, running: false };
  if (!state.running || !state.endsAt) return { ...state, running: false };
  const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  return { endsAt: remaining ? state.endsAt : undefined, remaining, running: remaining > 0 };
}

export const formatQuantity = formatRecipeQuantity;
export const ingredientParts = recipeIngredientParts;
export const ingredientText = recipeIngredientText;
export { scaledYieldText };
