import type {
  Ingredient,
  RecipeMetadataEvidence,
  RecipeStep,
  StructuredRecipe,
} from './types/cooking';

const heading = /^(#{1,6})\s+(.+?)\s*$/;
const ingredientHeading = /^ingredients?$/i;
const instructionHeading = /^(method|directions?|instructions?|steps?)$/i;
const notesHeading = /^notes?$/i;
const equipmentHeading = /^(equipment|tools?|you(?:'|’)ll need)$/i;
const separatorCell = /^:?-{3,}:?$/;

type MarkdownSection = { level: number; lines: string[] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const cleanInline = (value: string) =>
  value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim();

const section = (lines: string[], name: RegExp): MarkdownSection | undefined => {
  const start = lines.findIndex((line) => {
    const match = line.trim().match(heading);
    return Boolean(match && name.test(cleanInline(match[2])));
  });
  if (start < 0) return undefined;
  const match = lines[start].trim().match(heading);
  const level = match?.[1].length ?? 2;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const next = line.trim().match(heading);
    return Boolean(next && next[1].length <= level);
  });
  return { level, lines: end < 0 ? rest : rest.slice(0, end) };
};

const numberFromText = (value: string) => {
  const normalized = value
    .trim()
    .replace(/^(\d+)\s+(\d+)\/(\d+)/, (_, whole, top, bottom) =>
      String(Number(whole) + Number(top) / Number(bottom)),
    );
  const match = normalized.match(/^(\d+(?:\.\d+)?|\d+\/\d+)/);
  if (!match) return undefined;
  if (!match[1].includes('/')) return Number(match[1]);
  const [numerator, denominator] = match[1].split('/').map(Number);
  return denominator ? numerator / denominator : undefined;
};

const ingredient = (
  itemValue: string,
  amountValue: string,
  index: number,
  group?: string,
  preparationValue?: string,
  notesValue?: string,
): Ingredient => {
  const item = cleanInline(itemValue);
  const amount = cleanInline(amountValue);
  const preparation = cleanInline(preparationValue ?? '');
  const notes = cleanInline(notesValue ?? '');
  const quantity = numberFromText(amount);
  const unit =
    quantity === undefined
      ? undefined
      : amount.replace(/^(?:\d+\s+\d+\/\d+|\d+(?:\.\d+)?|\d+\/\d+)/, '').trim() || undefined;
  const optional = /\b(optional|if using)\b/i.test(`${amount} ${item} ${notes}`);
  return {
    id: `markdown-ingredient-${index}`,
    item,
    originalText: [amount, item, preparation ? `(${preparation})` : ''].filter(Boolean).join(' '),
    quantity,
    unit,
    ...(preparation ? { preparation } : {}),
    ...(group ? { group } : {}),
    ...(optional ? { optional: true } : {}),
    quantityType: /\bto taste\b/i.test(amount)
      ? 'to_taste'
      : quantity === undefined
        ? 'estimated'
        : 'measured',
  };
};

const ingredientsFromMarkdown = (markdownLines: string[]): Ingredient[] => {
  const target = section(markdownLines, ingredientHeading);
  if (!target) return [];
  const result: Ingredient[] = [];
  let group: string | undefined;
  let headers: string[] | undefined;
  for (const raw of target.lines) {
    const line = raw.trim();
    if (!line) continue;
    const subheading = line.match(heading);
    if (subheading) {
      group = cleanInline(subheading[2]).replace(/^for\s+(?:the\s+)?/i, '');
      headers = undefined;
      continue;
    }
    if (line.startsWith('|')) {
      const row = cells(line);
      if (row.every((value) => !value || separatorCell.test(value))) continue;
      if (!headers) {
        const normalized = row.map((value) => cleanInline(value).toLowerCase());
        if (normalized.some((value) => /ingredient|item/.test(value))) {
          headers = normalized;
          continue;
        }
        headers = row.map((_, index) => (index === 0 ? 'ingredient' : index === 1 ? 'amount' : ''));
      }
      const ingredientIndex = Math.max(
        0,
        headers.findIndex((value) => /ingredient|item/.test(value)),
      );
      const amountIndex =
        [
          headers.findIndex((value) => /^(original|quantity|amount)$/.test(value)),
          headers.findIndex((value) => /^metric$/.test(value)),
          headers.findIndex((value) => /^imperial$/.test(value)),
          ingredientIndex === 0 ? 1 : 0,
        ].find((value) => value >= 0) ?? 1;
      const preparationIndex = headers.findIndex((value) => /state|form|preparation/.test(value));
      const notesIndex = headers.findIndex((value) => /notes?/.test(value));
      const item = row[ingredientIndex] ?? '';
      const amount = row[amountIndex] ?? '';
      if (!item || /^(ingredient|item)$/i.test(cleanInline(item))) continue;
      const remainingEmpty = row.every((value, index) => index === ingredientIndex || !value);
      if (remainingEmpty && /\*\*|^for\s+/i.test(item)) {
        group = cleanInline(item).replace(/^for\s+(?:the\s+)?/i, '');
        continue;
      }
      result.push(
        ingredient(
          item,
          amount,
          result.length,
          group,
          preparationIndex >= 0 ? row[preparationIndex] : undefined,
          notesIndex >= 0 ? row[notesIndex] : undefined,
        ),
      );
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      const value = cleanInline(bullet[1]);
      const measured = value.match(
        /^((?:\d+\s+\d+\/\d+|\d+(?:\.\d+)?|\d+\/\d+)(?:\s+(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|grams?|g|kilograms?|kg|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|ounces?|oz|pounds?|lbs?|cloves?|small|medium|large|cans?|packages?|slices?|pieces?))?)\s+(.+)$/i,
      );
      if (measured) {
        result.push(ingredient(measured[2], measured[1], result.length, group));
      } else {
        result.push(ingredient(value, '', result.length, group));
      }
    }
  }
  return result;
};

const stepFromText = (value: string, index: number): RecipeStep => {
  const timers: RecipeStep['timers'] = [];
  const warnings: string[] = [];
  const tips: string[] = [];
  let text = cleanInline(value).replace(
    /\[timer:(\d+)(?:\|([^\]]+))?\]/gi,
    (_, seconds: string, label?: string) => {
      const durationSeconds = Number(seconds);
      timers.push({
        durationSeconds,
        id: `markdown-step-${index}-timer-${timers.length}`,
        label: label?.trim() || `${Math.max(1, Math.round(durationSeconds / 60))} min`,
      });
      return '';
    },
  );
  const temperatureMatch = text.match(/(\d{2,3})\s*°\s*([FC])\b/i);
  const warningMatch = text.match(/(?:warning|caution):\s*([^.!?]+[.!?]?)/i);
  if (warningMatch) warnings.push(warningMatch[1].trim());
  const tipMatch = text.match(/(?:tip|note):\s*([^.!?]+[.!?]?)/i);
  if (tipMatch) tips.push(tipMatch[1].trim());
  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return {
    id: `markdown-step-${index}`,
    ingredientIds: [],
    order: index + 1,
    text,
    timers,
    ...(temperatureMatch
      ? {
          temperature: {
            value: Number(temperatureMatch[1]),
            unit: temperatureMatch[2].toUpperCase() as 'F' | 'C',
          },
        }
      : {}),
    warnings,
    tips,
  };
};

const stepsFromMarkdown = (markdownLines: string[]): RecipeStep[] => {
  const target = section(markdownLines, instructionHeading);
  if (!target) return [];
  return target.lines.reduce<RecipeStep[]>((steps, raw) => {
    const line = raw.trim();
    if (!line || line.match(heading) || line.startsWith('|')) return steps;
    const match = line.match(/^(?:\d+[.)]|[-*•])\s+(.+)$/);
    if (!match) return steps;
    return [...steps, stepFromText(match[1], steps.length)];
  }, []);
};

const metric = (lines: string[], labels: RegExp) => {
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      const row = cells(line);
      if (labels.test(cleanInline(row[0] ?? ''))) return cleanInline(row[1] ?? '');
    }
    const match = cleanInline(line)
      .replace(/^[-*•]\s+/, '')
      .match(/^([^:]+):\s*(.+)$/);
    if (match && labels.test(match[1])) return match[2].trim();
  }
  return undefined;
};

const minutes = (value?: string) => {
  if (!value) return 0;
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i)?.[1] ?? 0);
  const mins = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)/i)?.[1] ?? 0);
  if (hours || mins) return Math.round(hours * 60 + mins);
  return Math.max(0, Number(value.match(/\d+(?:\.\d+)?/)?.[0] ?? 0));
};

export function hasUsableStructuredRecipe(recipe?: {
  ingredients: Array<{ item?: string; originalText: string }>;
  steps: Array<{ text: string }>;
}): boolean {
  if (!recipe?.ingredients.length || !recipe.steps.length) return false;
  const placeholderIngredient =
    recipe.ingredients.length === 1 &&
    (!recipe.ingredients[0].item || recipe.ingredients[0].item.trim().toLowerCase() === 'item') &&
    recipe.ingredients[0].originalText.trim().toLowerCase() === '1 item';
  const placeholderStep =
    recipe.steps.length === 1 &&
    recipe.steps[0].text.trim().toLowerCase() === 'prepare the recipe.';
  return !(placeholderIngredient && placeholderStep);
}

export function structuredRecipeFromMarkdown(
  markdown: string,
  fallback?: StructuredRecipe,
): StructuredRecipe | null {
  const lines = markdown.split(/\r?\n/);
  const ingredients = ingredientsFromMarkdown(lines);
  const steps = stepsFromMarkdown(lines);
  if (!ingredients.length || !steps.length) return null;
  const markdownTitle = cleanInline(
    lines.find((line) => /^#\s+/.test(line.trim()))?.replace(/^#\s+/, '') ?? '',
  );
  const title =
    (markdownTitle && !/^[{}]$/.test(markdownTitle) ? markdownTitle : undefined) ??
    fallback?.title ??
    'Recipe';
  const data = section(lines, /^(recipe data|at a glance)$/i)?.lines ?? lines;
  const servingsValue = metric(data, /^(servings?|serves|yield)$/i);
  const prepMinutes = minutes(metric(data, /^prep(?:aration)? time$/i));
  const cookMinutes = minutes(metric(data, /^cook(?:ing)? time$/i));
  const statedTotal = minutes(metric(data, /^total time$/i));
  const difficultyValue = metric(data, /^difficulty$/i)?.toLowerCase();
  const difficulty =
    difficultyValue === 'beginner' ||
    difficultyValue === 'intermediate' ||
    difficultyValue === 'advanced'
      ? difficultyValue
      : undefined;
  const firstHeading = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  const description = lines
    .slice(firstHeading + 1)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('|'));
  const noteLines = section(lines, notesHeading)?.lines ?? [];
  return {
    title,
    description: description ? cleanInline(description) : (fallback?.description ?? ''),
    servings: Math.max(1, numberFromText(servingsValue ?? '') ?? fallback?.servings ?? 1),
    timing: {
      prepMinutes: prepMinutes || fallback?.timing.prepMinutes || 0,
      cookMinutes: cookMinutes || fallback?.timing.cookMinutes || 0,
      totalMinutes:
        statedTotal || Math.max(prepMinutes + cookMinutes, fallback?.timing.totalMinutes ?? 0),
    },
    ...(difficulty
      ? { difficulty }
      : fallback?.difficulty
        ? { difficulty: fallback.difficulty }
        : {}),
    equipment:
      section(lines, equipmentHeading)
        ?.lines.map((line) => cleanInline(line.trim().replace(/^[-*•]\s+/, '')))
        .filter((line) => Boolean(line) && !line.startsWith('|')) ??
      fallback?.equipment ??
      [],
    ingredients,
    steps,
    notes: noteLines
      .map((line) => line.trim().replace(/^[-*•]\s+/, ''))
      .filter((line) => Boolean(line) && !line.match(heading)),
    tags: fallback?.tags ?? [],
  };
}

export function canonicalRecipeFromContent(input: {
  markdown: string;
  recipe?: StructuredRecipe;
}): StructuredRecipe | null {
  const parsed = structuredRecipeFromMarkdown(input.markdown, input.recipe);
  if (!hasUsableStructuredRecipe(input.recipe)) return parsed;
  if (!input.recipe || !parsed) return input.recipe ?? null;
  return {
    ...input.recipe,
    title: parsed.title,
    description: input.recipe.description || parsed.description,
    servings: parsed.servings,
    timing: parsed.timing,
    ...(input.recipe.difficulty || parsed.difficulty
      ? { difficulty: input.recipe.difficulty ?? parsed.difficulty }
      : {}),
    equipment: [...(input.recipe.equipment ?? []), ...(parsed.equipment ?? [])].filter(
      (value, index, all) => all.indexOf(value) === index,
    ),
  };
}

export function recipeCompletenessIssues(recipe?: StructuredRecipe): string[] {
  if (!recipe) return ['structured recipe'];
  const issues: string[] = [];
  if (!recipe.title.trim()) issues.push('title');
  if (!hasUsableStructuredRecipe(recipe)) issues.push('ingredients and instructions');
  if (!Number.isFinite(recipe.servings) || recipe.servings < 1) issues.push('yield');
  if (!Number.isFinite(recipe.timing.totalMinutes) || recipe.timing.totalMinutes <= 0) {
    issues.push('timing');
  }
  return issues;
}

const allergenRules: Array<[RegExp, string]> = [
  [/\b(?:milk|cream|butter|cheese|yogurt|whey|casein)\b/i, 'Dairy'],
  [/\beggs?\b/i, 'Egg'],
  [/\bpeanuts?\b/i, 'Peanut'],
  [/\b(?:almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia)s?\b/i, 'Tree nuts'],
  [/\b(?:wheat|flour|bread|pasta|barley|rye|couscous)\b/i, 'Gluten'],
  [/\b(?:soy|tofu|miso|edamame|tempeh)\b/i, 'Soy'],
  [/\b(?:fish|salmon|tuna|cod|anchovy|anchovies|sardine|sardines)\b/i, 'Fish'],
  [/\b(?:shrimp|prawn|crab|lobster|shellfish|mussel|clam|oyster)s?\b/i, 'Shellfish'],
  [/\b(?:sesame|tahini)\b/i, 'Sesame'],
  [/\bmustard\b/i, 'Mustard'],
];

const equipmentRules: Array<[RegExp, string]> = [
  [/\boven\b/i, 'Oven'],
  [/\bbroiler\b/i, 'Broiler'],
  [/\bgrill|barbecue grate\b/i, 'Grill'],
  [/\bfood processor\b/i, 'Food processor'],
  [/\bblender\b/i, 'Blender'],
  [/\bfine[- ]mesh(?:ed)? sieve|\bstrainer\b/i, 'Fine-mesh sieve'],
  [/\bmixing bowl\b/i, 'Mixing bowl'],
  [/\bskillet|frying pan\b/i, 'Skillet'],
  [/\bsaucepan|\bpot\b/i, 'Saucepan'],
  [/\bbaking (?:sheet|tray)\b/i, 'Baking sheet'],
  [/\bwhisk\b/i, 'Whisk'],
  [/\bthermometer\b/i, 'Thermometer'],
];

const evidence = (value: string, source: RecipeMetadataEvidence['source'], confidence: number) => ({
  value,
  source,
  confidence,
});

export function canonicalEquipmentName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/sieve|strainer/.test(normalized)) return 'Fine-mesh sieve';
  if (/grill|barbecue/.test(normalized)) return 'Grill';
  if (/food processor/.test(normalized)) return 'Food processor';
  if (/mixing bowl/.test(normalized)) return 'Mixing bowl';
  if (/broiler/.test(normalized)) return 'Broiler';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function deriveRecipeFacts(recipe: StructuredRecipe, markdown = '') {
  const ingredientText = recipe.ingredients
    .map((item) => `${item.originalText} ${item.item}`)
    .join(' ');
  const stepText = recipe.steps.map((step) => step.text).join(' ');
  const explicitEquipment =
    section(markdown.split(/\r?\n/), equipmentHeading)
      ?.lines.map((line) => cleanInline(line.trim().replace(/^[-*•]\s+/, '')))
      .filter((line) => Boolean(line) && !line.startsWith('|')) ?? [];
  const potentialAllergens = allergenRules.flatMap(([pattern, label]) =>
    pattern.test(ingredientText) ? [evidence(label, 'ingredient_rules', 0.9)] : [],
  );
  const inferredEquipment = equipmentRules.flatMap(([pattern, label]) =>
    pattern.test(stepText) ? [evidence(label, 'instruction_rules', 0.75)] : [],
  );
  const equipment = [
    ...(recipe.equipment ?? []).map((value) =>
      evidence(canonicalEquipmentName(value), 'source', 0.95),
    ),
    ...explicitEquipment.map((value) => evidence(canonicalEquipmentName(value), 'source', 0.95)),
    ...inferredEquipment,
  ].filter((item, index, all) => all.findIndex((other) => other.value === item.value) === index);
  return { equipment, potentialAllergens };
}

export function verifiedDietClaims(claims: string[], recipe: StructuredRecipe) {
  const ingredients = recipe.ingredients
    .map((item) => `${item.originalText} ${item.item}`)
    .join(' ');
  const animal =
    /\b(?:beef|pork|chicken|turkey|lamb|veal|bacon|ham|sausage|fish|salmon|tuna|anchovy|anchovies|shrimp|prawn|crab|lobster|gelatin)\b/i;
  const landAnimal = /\b(?:beef|pork|chicken|turkey|lamb|veal|bacon|ham|sausage|gelatin)\b/i;
  const dairyEgg = /\b(?:milk|cream|butter|cheese|yogurt|whey|casein|eggs?)\b/i;
  const dairy = /\b(?:milk|cream|butter|cheese|yogurt|whey|casein)\b/i;
  const egg = /\beggs?\b/i;
  const nuts = /\b(?:peanut|almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia)s?\b/i;
  const soy = /\b(?:soy|tofu|miso|edamame|tempeh)\b/i;
  const gluten = /\b(?:wheat|flour|bread|pasta|barley|rye|couscous)\b/i;
  return claims.filter((claim) => {
    const normalized = claim.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (normalized === 'vegan') return !animal.test(ingredients) && !dairyEgg.test(ingredients);
    if (normalized === 'vegetarian') return !animal.test(ingredients);
    if (normalized === 'pescatarian') return !landAnimal.test(ingredients);
    if (normalized === 'gluten free') return !gluten.test(ingredients);
    if (normalized === 'dairy free') return !dairy.test(ingredients);
    if (normalized === 'egg free') return !egg.test(ingredients);
    if (normalized === 'nut free') return !nuts.test(ingredients);
    if (normalized === 'soy free') return !soy.test(ingredients);
    return false;
  });
}
