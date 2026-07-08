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

function savedCountry(markdown: string | undefined): string | undefined {
  if (!markdown) {
    return undefined;
  }
  const match = markdown.match(/(?:^|\n)##\s+Location\s*\n([\s\S]*?)(?=\n##\s+|\s*$)/i);
  const locationBody = match?.[1];
  if (!locationBody) {
    return undefined;
  }

  if (
    /\bindia\b|\bdelhi\b|\bdwarka\b|\bmumbai\b|\bbengaluru\b|\bbangalore\b|\bkolkata\b|\bchennai\b|\bhyderabad\b/i.test(
      locationBody,
    )
  ) {
    return 'India';
  }
  if (/\bunited states\b|\busa\b|\bu\.s\.\b|\bnew york\b|\bcalifornia\b/i.test(locationBody)) {
    return 'United States';
  }
  if (/\bunited kingdom\b|\buk\b|\blondon\b/i.test(locationBody)) {
    return 'United Kingdom';
  }
  return undefined;
}

export function personalizeRecipe(
  recipe: StructuredRecipe,
  preferencesMarkdown?: string,
): { recipe: StructuredRecipe; adjustments: string[] } {
  const adjustments: string[] = [];
  if (!preferencesMarkdown) {
    return { recipe, adjustments };
  }

  const country = savedCountry(preferencesMarkdown);

  const ingredients = recipe.ingredients.map((ing) => {
    let originalText = ing.originalText;
    let quantity = ing.quantity;
    let unit = ing.unit;
    let item = ing.item;

    const lowerItem = item.toLowerCase();

    if (country === 'India' || country === 'United Kingdom') {
      if (lowerItem.includes('kosher salt')) {
        item = 'fine table salt';
        if (quantity != null) {
          quantity = Number((quantity * 0.5).toFixed(2));
          if (unit) {
            originalText = `${quantity} ${unit} fine table salt`;
          } else {
            originalText = `${quantity} fine table salt`;
          }
        } else {
          originalText = originalText.replace(/kosher salt/i, 'fine table salt (use half the amount)');
        }
        adjustments.push(`Converted kosher salt to fine table salt (adjusted quantity from ${ing.quantity ?? ''} to ${quantity ?? ''}) for user location (${country}).`);
      }

      if (country === 'India' && (lowerItem.includes('all-purpose flour') || lowerItem.includes('all purpose flour'))) {
        item = 'maida (AP flour)';
        originalText = originalText.replace(/all-purpose flour|all purpose flour/i, 'maida (AP flour)');
        adjustments.push(`Mapped All-Purpose Flour to Maida (AP flour) for user location (India).`);
      }
    }

    if (lowerItem.includes('packed brown sugar') || lowerItem.includes('dark brown sugar') || lowerItem.includes('light brown sugar')) {
      if (country === 'India') {
        originalText = `${originalText} (or white sugar + 1 tsp honey/molasses per cup)`;
        adjustments.push('Added local brown sugar substitution tip (white sugar + honey/molasses) for India.');
      }
    }

    if (lowerItem.includes('heavy whipping cream') || lowerItem.includes('heavy cream') || lowerItem.includes('double cream')) {
      if (country === 'India' && !lowerItem.includes('whipped')) {
        originalText = `${originalText} (Note: Amul fresh cream has 25% fat and won't whip; use whipping cream with 35%+ fat)`;
        adjustments.push('Added whipping cream fat-content warning (Amul fresh cream fat limitations) for India.');
      }
    }

    return {
      ...ing,
      item,
      quantity,
      originalText,
    };
  });

  const hasConvection = /convection\s*oven|fan\s*oven|fan-forced\s*oven/i.test(preferencesMarkdown);
  const steps = recipe.steps.map((step) => {
    if (step.temperature && hasConvection) {
      let tempVal = step.temperature.value;
      const tempUnit = step.temperature.unit?.toUpperCase() ?? 'F';
      if (tempUnit === 'F' || tempUnit === 'FAHRENHEIT') {
        tempVal = Math.round(tempVal - 25);
      } else if (tempUnit === 'C' || tempUnit === 'CELSIUS') {
        tempVal = Math.round(tempVal - 20);
      }
      adjustments.push(`Adjusted baking temperature from ${step.temperature.value}°${tempUnit} to ${tempVal}°${tempUnit} for user's convection/fan oven.`);
      return {
        ...step,
        temperature: {
          ...step.temperature,
          value: tempVal,
        },
        tips: [
          ...(step.tips ?? []),
          `Adjusted baking temperature down by ${tempUnit === 'C' ? '20°C' : '25°F'} for your convection/fan oven.`,
        ],
      };
    }
    return step;
  });

  return {
    recipe: {
      ...recipe,
      ingredients,
      steps,
    },
    adjustments,
  };
}

export function normalizeRecipe(
  recipe: StructuredRecipe,
  preferencesMarkdown?: string,
): StructuredRecipe {
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

  const normalized = {
    title,
    description: cleanText(recipe.description, ''),
    servings: Math.max(1, Number(recipe.servings)),
    timing: { prepMinutes, cookMinutes, totalMinutes },
    ingredients,
    steps,
    notes: notes.map((note) => note.trim()).filter(Boolean),
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
  };

  return personalizeRecipe(normalized, preferencesMarkdown).recipe;
}
