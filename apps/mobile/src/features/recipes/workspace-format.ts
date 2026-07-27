import type { Ingredient } from 'librechat-data-provider';

export type UnitMode = 'original' | 'metric' | 'imperial';

export const scaledYieldText = ({
  baseServings,
  currentServings,
  yieldText,
}: {
  baseServings: number;
  currentServings: number;
  yieldText?: string;
}) => {
  const source = yieldText?.trim();
  if (!source) return undefined;
  if (currentServings === baseServings) return source;
  const leadingCount = source.match(/^\d+(?:\s*[–-]\s*\d+)?\s*(.*)$/);
  if (leadingCount) {
    return [currentServings, leadingCount[1]].filter(Boolean).join(' ');
  }
  if (/^serves?\s+\d+/i.test(source)) {
    return source.replace(/^(serves?\s+)\d+/i, `$1${currentServings}`);
  }
  return undefined;
};

const fractionText = (value: number) => {
  const whole = Math.floor(value);
  const fraction = value - whole;
  const eighths = Math.round(fraction * 8);
  if (!eighths) return String(whole);
  if (eighths === 8) return String(whole + 1);
  let divisor = 1;
  if (eighths % 4 === 0) divisor = 4;
  else if (eighths % 2 === 0) divisor = 2;
  const numerator = eighths / divisor;
  const denominator = 8 / divisor;
  return [whole || '', `${numerator}/${denominator}`].filter(Boolean).join(' ');
};

export const formatQuantity = (value: number, mode: UnitMode = 'original') => {
  if (value < 0.01) return value.toFixed(2);
  if (Number.isInteger(value)) return String(value);
  if (mode === 'metric') {
    if (value >= 100) return String(Math.round(value / 5) * 5);
    if (value >= 10) return String(Math.round(value));
    return String(Math.round(value * 10) / 10);
  }
  if (value <= 10) return fractionText(value);
  return String(Math.round(value * 10) / 10);
};

const convertUnit = (quantity: number, unit: string, mode: UnitMode) => {
  const normalized = unit.toLocaleLowerCase().replace(/\.$/, '');
  if (mode === 'metric') {
    if (['oz', 'ounce', 'ounces'].includes(normalized)) return [quantity * 28.3495, 'g'] as const;
    if (['lb', 'lbs', 'pound', 'pounds'].includes(normalized))
      return [quantity * 453.592, 'g'] as const;
    if (['cup', 'cups'].includes(normalized)) return [quantity * 236.588, 'ml'] as const;
    if (['tbsp', 'tablespoon', 'tablespoons'].includes(normalized))
      return [quantity * 14.7868, 'ml'] as const;
    if (['tsp', 'teaspoon', 'teaspoons'].includes(normalized))
      return [quantity * 4.92892, 'ml'] as const;
  }
  if (mode === 'imperial') {
    if (normalized === 'kg') return [quantity * 2.20462, 'lb'] as const;
    if (['g', 'gram', 'grams'].includes(normalized)) return [quantity / 28.3495, 'oz'] as const;
    if (['l', 'liter', 'liters', 'litre', 'litres'].includes(normalized))
      return [quantity * 4.22675, 'cups'] as const;
    if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(normalized)) {
      return quantity >= 118
        ? ([quantity / 236.588, 'cups'] as const)
        : ([quantity / 14.7868, 'tbsp'] as const);
    }
  }
  return [quantity, unit] as const;
};

export const ingredientParts = (ingredient: Ingredient, scale: number, unitMode: UnitMode) => {
  if (!ingredient.quantity || !ingredient.item) {
    const leadingAmount = ingredient.originalText.match(/^(pinch|dash|handful)\s+(.+)$/i);
    if (leadingAmount) return { amount: leadingAmount[1], name: leadingAmount[2] };
    const trailingAmount = ingredient.originalText.match(/^(.+?)\s+(to taste|as needed)$/i);
    if (trailingAmount) return { amount: trailingAmount[2], name: trailingAmount[1] };
    return { amount: '', name: ingredient.originalText };
  }
  const [quantity, unit] = convertUnit(
    ingredient.quantity * scale,
    ingredient.unit ?? '',
    unitMode,
  );
  return {
    amount: [formatQuantity(quantity, unitMode), unit].filter(Boolean).join(' '),
    name: [ingredient.item, ingredient.preparation].filter(Boolean).join(', '),
  };
};

export const ingredientText = (ingredient: Ingredient, scale: number, unitMode: UnitMode) => {
  const parts = ingredientParts(ingredient, scale, unitMode);
  if (/^(to taste|as needed)$/i.test(parts.amount)) {
    return `${parts.name} ${parts.amount}`;
  }
  return [parts.amount, parts.name].filter(Boolean).join(' ');
};
