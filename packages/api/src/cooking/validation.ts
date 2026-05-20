import type { Ingredient, RecipeStep, StructuredRecipe } from 'librechat-data-provider';

export class CookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CookingValidationError';
  }
}

function cleanText(value: string | undefined, fallback: string): string {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : fallback;
}

function normalizeIngredient(ingredient: Ingredient, index: number): Ingredient {
  const id = cleanText(ingredient.id, `ingredient-${index + 1}`);
  const originalText = cleanText(ingredient.originalText, ingredient.item || id);
  const item = cleanText(ingredient.item, originalText);
  const quantityType = ingredient.quantityType ?? 'measured';

  if (!['measured', 'estimated', 'to_taste'].includes(quantityType)) {
    throw new CookingValidationError(`Ingredient ${id} has an invalid quantity type.`);
  }

  return {
    id,
    originalText,
    item,
    quantityType,
    ...(ingredient.quantity != null ? { quantity: Number(ingredient.quantity) } : {}),
    ...(ingredient.unit ? { unit: ingredient.unit.trim() } : {}),
    ...(ingredient.preparation ? { preparation: ingredient.preparation.trim() } : {}),
  };
}

function normalizeStep(step: RecipeStep, index: number, ingredientIds: Set<string>): RecipeStep {
  const id = cleanText(step.id, `step-${index + 1}`);
  const text = cleanText(step.text, '');
  if (!text) {
    throw new CookingValidationError(`Step ${index + 1} requires text.`);
  }

  const rawIngredientIds = Array.isArray(step.ingredientIds) ? step.ingredientIds : [];
  const rawTimers = Array.isArray(step.timers) ? step.timers : [];
  const rawWarnings = Array.isArray(step.warnings) ? step.warnings : [];
  const rawTips = Array.isArray(step.tips) ? step.tips : [];
  const linkedIngredientIds = rawIngredientIds.filter((ingredientId) =>
    ingredientIds.has(ingredientId),
  );

  return {
    id,
    text,
    order: index + 1,
    ingredientIds: linkedIngredientIds,
    timers: rawTimers.map((timer, timerIndex) => ({
      id: cleanText(timer.id, `${id}-timer-${timerIndex + 1}`),
      label: cleanText(timer.label, 'Timer'),
      durationSeconds: Math.max(1, Number(timer.durationSeconds)),
    })),
    ...(step.temperature
      ? {
          temperature: {
            value: Number(step.temperature.value),
            unit: step.temperature.unit,
            ...(step.temperature.appliance ? { appliance: step.temperature.appliance.trim() } : {}),
          },
        }
      : {}),
    warnings: rawWarnings.map((warning) => warning.trim()).filter(Boolean),
    tips: rawTips.map((tip) => tip.trim()).filter(Boolean),
  };
}

export function normalizeRecipe(recipe: StructuredRecipe): StructuredRecipe {
  const title = cleanText(recipe.title, '');
  if (!title) {
    throw new CookingValidationError('Recipe title is required.');
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    throw new CookingValidationError('Recipe requires at least one ingredient.');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    throw new CookingValidationError('Recipe requires at least one step.');
  }

  const ingredients = recipe.ingredients.map(normalizeIngredient);
  const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  const steps = recipe.steps.map((step, index) => normalizeStep(step, index, ingredientIds));
  const prepMinutes = Math.max(0, Number(recipe.timing?.prepMinutes));
  const cookMinutes = Math.max(0, Number(recipe.timing?.cookMinutes));
  const totalMinutes = Math.max(prepMinutes + cookMinutes, Number(recipe.timing?.totalMinutes));
  const notes = Array.isArray(recipe.notes) ? recipe.notes : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];

  return {
    title,
    description: cleanText(recipe.description, ''),
    servings: Math.max(1, Number(recipe.servings)),
    timing: { prepMinutes, cookMinutes, totalMinutes },
    ingredients,
    steps,
    notes: notes.map((note) => note.trim()).filter(Boolean),
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
  };
}
