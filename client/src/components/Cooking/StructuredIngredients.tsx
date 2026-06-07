import type { Ingredient } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type StructuredIngredientsProps = {
  ingredients: Ingredient[];
};

const PLACEHOLDER_INGREDIENT_VALUES = new Set(['', '-', 'item', 'ingredient']);
const PLACEHOLDER_INGREDIENT_PATTERN = /^(?:\d+(?:\.\d+)?\s*)?(?:items?|ingredients?)$/i;

function cleanIngredientValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

function isPlaceholderIngredientValue(value: string | undefined): boolean {
  const cleanValue = cleanIngredientValue(value);
  return (
    PLACEHOLDER_INGREDIENT_VALUES.has(cleanValue.toLowerCase()) ||
    PLACEHOLDER_INGREDIENT_PATTERN.test(cleanValue)
  );
}

export function isDisplayableIngredient(ingredient: Ingredient): boolean {
  return (
    !isPlaceholderIngredientValue(ingredient.originalText) ||
    !isPlaceholderIngredientValue(ingredient.item)
  );
}

export function hasDisplayableIngredients(ingredients: Ingredient[]): boolean {
  return ingredients.some(isDisplayableIngredient);
}

function quantityLabel(ingredient: Ingredient): string {
  return [ingredient.quantity, ingredient.unit].filter(Boolean).join(' ');
}

function ingredientLabel(ingredient: Ingredient): string {
  const originalText = cleanIngredientValue(ingredient.originalText);
  const name = cleanIngredientValue(ingredient.item);
  const preparation = ingredient.preparation?.trim();
  if (isPlaceholderIngredientValue(name)) {
    return originalText;
  }
  return preparation ? `${name}, ${preparation}` : name;
}

export default function StructuredIngredients({ ingredients }: StructuredIngredientsProps) {
  const localize = useLocalize();

  if (ingredients.length === 0) {
    return null;
  }

  const displayIngredients = ingredients.filter(isDisplayableIngredient);

  if (displayIngredients.length === 0) {
    return null;
  }

  return (
    <section
      className="mb-7 border-b border-border-light pb-7"
      data-testid="structured-ingredients"
    >
      <h2 className="rekky-section-title text-text-primary">
        {localize('com_cooking_ingredients')}
      </h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {displayIngredients.map((ingredient) => {
          const quantity = quantityLabel(ingredient);
          return (
            <label
              key={ingredient.id}
              className="grid cursor-pointer grid-cols-[minmax(3.75rem,auto)_minmax(0,1fr)] gap-2.5 rounded-md border border-border-light bg-surface-primary-alt p-3 transition-colors hover:bg-surface-hover sm:grid-cols-[minmax(4.75rem,auto)_minmax(0,1fr)] sm:gap-3"
            >
              <span className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" aria-label={ingredient.originalText} />
                <span className="rekky-quantity text-sm font-bold text-text-primary">
                  {quantity || '-'}
                </span>
              </span>
              <span className="rekky-body text-sm leading-6 text-text-secondary">
                {ingredientLabel(ingredient)}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
