import type {
  AddShoppingItemInput,
  LegacyShoppingList,
  LegacyShoppingListItem,
  ShoppingCategory,
  ShoppingContribution,
  ShoppingListItem,
  ShoppingList,
  ShoppingRecipeReference,
} from './types/shopping';

const preparationWords =
  /\b(?:chopped|diced|minced|sliced|peeled|grated|crumbled|ground|crushed|softened|melted|divided|drained|rinsed|pitted|seeded|trimmed|smooth|liquid)\b/gi;
const preparationOnly =
  /^(?:(?:finely|roughly|thinly|freshly)\s+)?(?:chopped|diced|minced|sliced|peeled|grated|crumbled|ground|crushed|softened|melted|divided|drained|rinsed|pitted|seeded|trimmed)(?:\s+and\s+(?:chopped|diced|minced|sliced|peeled|grated|crumbled|ground|crushed|softened|melted|divided|drained|rinsed|pitted|seeded|trimmed))*$/i;

const aliases: Array<[RegExp, string]> = [
  [/\bextra[- ]virgin olive oil\b/i, 'olive oil'],
  [/\bscallions?\b/i, 'green onion'],
  [/\bspring onions?\b/i, 'green onion'],
  [/\bgarbanzo beans?\b/i, 'chickpeas'],
  [/\btomatoes\b/i, 'tomato'],
  [/\bpotatoes\b/i, 'potato'],
  [/\bgreen onions\b/i, 'green onion'],
];

const categoryRules: Array<[RegExp, ShoppingCategory]> = [
  [/\b(?:lemon|lime) juice\b|\bcoconut milk\b|\b(?:broth|stock)\b/i, 'pantry'],
  [
    /\b(?:apple|apricot|avocado|banana|basil|berry|berries|broccoli|cabbage|carrot|celery|chilli|cilantro|coriander|cucumber|eggplant|garlic|ginger|grape|herb|kale|leek|lemon|lettuce|lime|mango|mint|mushroom|onion|orange|parsley|peach|pear|pepper|potato|pumpkin|radish|scallion|spinach|squash|tomato|zucchini)(?:s|es)?\b/i,
    'produce',
  ],
  [/\b(?:bread|bagel|baguette|bun|pita|roti|tortilla)(?:s|es)?\b/i, 'bakery'],
  [/\b(?:butter|cheese|cream|curd|egg|feta|ghee|milk|paneer|yogurt|yoghurt)(?:s|es)?\b/i, 'dairy'],
  [
    /\b(?:beef|chicken|cod|crab|fish|lamb|mutton|pork|prawn|salmon|sausage|shrimp|steak|tuna|turkey)(?:s|es)?\b/i,
    'meat_seafood',
  ],
  [/\b(?:frozen|ice cream)\b/i, 'frozen'],
  [/\b(?:coffee|soda|tea|water|wine)(?:s|es)?\b/i, 'beverages'],
  [
    /\b(?:bean|chickpea|flour|hummus|juice|lentil|molasses|noodle|oil|olive|pasta|pepper flakes|rice|salt|spice|sugar|sumac|tahini|vinegar)(?:s|es)?\b/i,
    'pantry',
  ],
];

const units: Record<string, { family: string; factor: number }> = {
  g: { family: 'mass', factor: 1 },
  gram: { family: 'mass', factor: 1 },
  grams: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.3495 },
  ounce: { family: 'mass', factor: 28.3495 },
  ounces: { family: 'mass', factor: 28.3495 },
  lb: { family: 'mass', factor: 453.592 },
  lbs: { family: 'mass', factor: 453.592 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 4.92892 },
  teaspoon: { family: 'volume', factor: 4.92892 },
  teaspoons: { family: 'volume', factor: 4.92892 },
  tbsp: { family: 'volume', factor: 14.7868 },
  tablespoon: { family: 'volume', factor: 14.7868 },
  tablespoons: { family: 'volume', factor: 14.7868 },
  cup: { family: 'volume', factor: 236.588 },
  cups: { family: 'volume', factor: 236.588 },
};

const normalizedUnit = (unit?: string) => unit?.trim().toLowerCase().replace(/\.$/, '');

export function canonicalShoppingName(value: string): string {
  const cleaned = value
    .replace(/\(([^)]*)\)/g, (_match, content: string) =>
      preparationOnly.test(content.trim()) ? ' ' : ` ${content} `,
    )
    .replace(preparationWords, ' ')
    .replace(/[(),;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return aliases.reduce(
    (name, [pattern, replacement]) => name.replace(pattern, replacement),
    cleaned,
  );
}

export function shoppingCategory(value: string): ShoppingCategory {
  return categoryRules.find(([pattern]) => pattern.test(value))?.[1] ?? 'other';
}

export function compatibleShoppingUnits(first?: string, second?: string): boolean {
  const left = normalizedUnit(first);
  const right = normalizedUnit(second);
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left === right) return true;
  return Boolean(units[left] && units[right] && units[left].family === units[right].family);
}

function quantityInUnit(quantity: number, from: string, to: string): number {
  const source = units[normalizedUnit(from) ?? ''];
  const target = units[normalizedUnit(to) ?? ''];
  if (!source || !target || source.family !== target.family) return quantity;
  return (quantity * source.factor) / target.factor;
}

const referenceKey = (reference: ShoppingRecipeReference) =>
  `${reference.recipeId}:${reference.ingredientId}`;

export const recipeContributionId = (reference: ShoppingRecipeReference) =>
  `recipe:${referenceKey(reference)}`;

function contributionFromInput(input: AddShoppingItemInput, itemId: string): ShoppingContribution {
  if (!input.recipeReference) {
    return {
      id: input.contributionId ?? `manual:${itemId}`,
      kind: 'manual',
      quantity: input.quantity,
      unit: normalizedUnit(input.unit),
      optional: Boolean(input.optional),
    };
  }
  return {
    id: input.contributionId ?? recipeContributionId(input.recipeReference),
    kind: 'recipe',
    quantity: input.quantity ?? input.recipeReference.quantity,
    unit: normalizedUnit(input.unit ?? input.recipeReference.unit),
    optional: Boolean(input.optional),
    recipeId: input.recipeReference.recipeId,
    recipeTitle: input.recipeReference.recipeTitle,
    ingredientId: input.recipeReference.ingredientId,
    servings: input.recipeReference.servings,
  };
}

const contributionQuantity = (contribution: ShoppingContribution, unit?: string) => {
  if (contribution.quantity == null) return 0;
  return quantityInUnit(contribution.quantity, contribution.unit ?? '', unit ?? '');
};

export function shoppingQuantity(contributions: ShoppingContribution[], unit?: string) {
  const quantified = contributions.filter((contribution) => contribution.quantity != null);
  if (!quantified.length) return undefined;
  return quantified.reduce(
    (total, contribution) => total + contributionQuantity(contribution, unit),
    0,
  );
}

export function normalizeShoppingItem(item: LegacyShoppingListItem): ShoppingListItem {
  const references = item.recipeReferences ?? [];
  const contributions: ShoppingContribution[] = item.contributions?.length
    ? item.contributions.map((contribution) => ({
        ...contribution,
        id: contribution.id.replace(/^recipe:saved:/, 'recipe:'),
        recipeId: contribution.recipeId?.replace(/^saved:/, ''),
      }))
    : references.map((reference) => {
        const recipeId = reference.recipeId.replace(/^saved:/, '');
        return {
          id: recipeContributionId({ ...reference, recipeId }),
          kind: 'recipe' as const,
          quantity: reference.quantity,
          unit: normalizedUnit(reference.unit),
          optional: item.optional,
          recipeId,
          recipeTitle: reference.recipeTitle,
          ingredientId: reference.ingredientId,
          servings: reference.servings,
        };
      });
  const recipeQuantity = shoppingQuantity(contributions, item.unit) ?? 0;
  const manualQuantity = item.quantity == null ? undefined : item.quantity - recipeQuantity;
  if (
    !contributions.length ||
    (references.length && manualQuantity != null && manualQuantity > 0.0001)
  ) {
    contributions.push({
      id: `manual:${item.id}`,
      kind: 'manual',
      quantity: contributions.length ? manualQuantity : item.quantity,
      unit: normalizedUnit(item.unit),
      optional: item.optional,
    });
  }
  const { recipeReferences: _references, ...current } = item;
  return {
    ...current,
    canonicalName: canonicalShoppingName(item.displayName) || item.canonicalName,
    category: item.categoryOverride
      ? item.category
      : shoppingCategory(canonicalShoppingName(item.displayName)),
    categoryOverride: Boolean(item.categoryOverride),
    contributions,
    quantity: shoppingQuantity(contributions, item.unit) ?? item.quantity,
  };
}

export function normalizeShoppingList(list: LegacyShoppingList): ShoppingList {
  const items: ShoppingListItem[] = [];
  for (const record of list.items) {
    const item = normalizeShoppingItem(record);
    const index = items.findIndex(
      (existing) =>
        existing.canonicalName === item.canonicalName &&
        compatibleShoppingUnits(existing.unit, item.unit),
    );
    if (index < 0) items.push(item);
    else items[index] = combineShoppingItems(items[index], item, list.updatedAt) ?? items[index];
  }
  return { ...list, items };
}

export function recipeShoppingContributions(item: ShoppingListItem) {
  return item.contributions.filter(
    (
      contribution,
    ): contribution is ShoppingContribution & {
      kind: 'recipe';
      recipeId: string;
      recipeTitle: string;
      ingredientId: string;
    } =>
      contribution.kind === 'recipe' &&
      Boolean(contribution.recipeId && contribution.recipeTitle && contribution.ingredientId),
  );
}

export function mergeShoppingItem(
  existing: ShoppingListItem,
  incoming: AddShoppingItemInput,
  now: string,
): ShoppingListItem {
  const incomingName = canonicalShoppingName(incoming.displayName);
  if (
    existing.canonicalName !== incomingName ||
    !compatibleShoppingUnits(existing.unit, incoming.unit)
  ) {
    return existing;
  }
  const contribution = contributionFromInput(incoming, existing.id);
  const previous = existing.contributions.find((entry) => entry.id === contribution.id);
  const previousQuantity = previous ? contributionQuantity(previous, existing.unit) : 0;
  const incomingQuantity = contributionQuantity(contribution, existing.unit);
  const contributions = [
    ...existing.contributions.filter((entry) => entry.id !== contribution.id),
    contribution,
  ];
  return {
    ...existing,
    quantity: shoppingQuantity(contributions, existing.unit),
    purchaseQuantity: existing.purchaseQuantity ?? incoming.purchaseQuantity,
    note: existing.note ?? incoming.note,
    optional: contributions.every((entry) => entry.optional),
    pantry: existing.pantry || Boolean(incoming.pantry),
    purchased: incomingQuantity > previousQuantity ? false : existing.purchased,
    contributions,
    updatedAt: now,
  };
}

export function removeShoppingContribution(
  existing: ShoppingListItem,
  contributionId: string,
  now: string,
): ShoppingListItem | null {
  const contributions = existing.contributions.filter((entry) => entry.id !== contributionId);
  if (contributions.length === existing.contributions.length) return existing;
  if (!contributions.length) return null;
  return {
    ...existing,
    quantity: shoppingQuantity(contributions, existing.unit),
    optional: contributions.every((entry) => entry.optional),
    contributions,
    updatedAt: now,
  };
}

export function combineShoppingItems(
  target: ShoppingListItem,
  source: ShoppingListItem,
  now: string,
): ShoppingListItem | null {
  if (!compatibleShoppingUnits(target.unit, source.unit)) return null;
  const contributionMap = new Map(target.contributions.map((entry) => [entry.id, entry]));
  for (const contribution of source.contributions)
    contributionMap.set(contribution.id, contribution);
  const contributions = Array.from(contributionMap.values());
  return {
    ...target,
    quantity: shoppingQuantity(contributions, target.unit),
    purchaseQuantity: target.purchaseQuantity ?? source.purchaseQuantity,
    note: target.note ?? source.note,
    purchased: target.purchased && source.purchased,
    optional: contributions.every((entry) => entry.optional),
    pantry: target.pantry || source.pantry,
    contributions,
    updatedAt: now,
  };
}

const identityTokens = (name: string) => new Set(name.split(/\s+/).filter(Boolean));

export function possibleShoppingDuplicates(items: ShoppingListItem[]) {
  const pairs: Array<{ first: ShoppingListItem; second: ShoppingListItem }> = [];
  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    const first = items[firstIndex];
    const firstTokens = identityTokens(first.canonicalName);
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      const second = items[secondIndex];
      if (!compatibleShoppingUnits(first.unit, second.unit)) continue;
      if (first.canonicalName === second.canonicalName) continue;
      const secondTokens = identityTokens(second.canonicalName);
      const overlap = Array.from(firstTokens).filter((token) => secondTokens.has(token)).length;
      const smaller = Math.min(firstTokens.size, secondTokens.size);
      if (!smaller || overlap / smaller < 0.75) continue;
      pairs.push({ first, second });
    }
  }
  return pairs;
}

export function createShoppingItem(
  input: AddShoppingItemInput,
  id: string,
  now: string,
): ShoppingListItem {
  const canonicalName = canonicalShoppingName(input.displayName);
  const contribution = contributionFromInput(input, id);
  return {
    id,
    canonicalName,
    displayName: canonicalName || input.displayName.trim(),
    quantity: contribution.quantity,
    unit: contribution.unit,
    purchaseQuantity: input.purchaseQuantity?.trim() || undefined,
    category: input.category ?? shoppingCategory(canonicalName),
    categoryOverride: Boolean(input.categoryOverride),
    purchased: false,
    note: input.note?.trim() || undefined,
    optional: contribution.optional,
    pantry: Boolean(input.pantry),
    contributions: [contribution],
    createdAt: now,
    updatedAt: now,
  };
}
