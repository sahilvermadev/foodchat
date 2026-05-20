import type {
  RecipeCategorization,
  RecipeDifficulty,
  RecipeTimeBucket,
  SavedRecipe,
  StructuredRecipe,
} from 'librechat-data-provider';

const arrayLimit = 8;
const requestTimeoutMs = 20000;
const difficultyValues = new Set<RecipeDifficulty>(['beginner', 'intermediate', 'advanced']);
const timeBucketValues = new Set<RecipeTimeBucket>([
  'under_15',
  'under_30',
  'under_60',
  'long_cook',
]);

type LlmCategorization = {
  shortDescription?: string;
  cuisine?: string[];
  mealType?: string[];
  dishType?: string[];
  diet?: string[];
  difficulty?: string;
  timeBucket?: string;
  occasion?: string[];
  equipment?: string[];
  mainIngredients?: string[];
  techniques?: string[];
  flavorProfile?: string[];
  confidence?: number;
};

export type RecipeCategorizationResult = {
  categorization: RecipeCategorization;
  shortDescription: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class RecipeCategorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeCategorizationError';
  }
}

function cleanCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(cleanCategory).filter(Boolean))].slice(0, arrayLimit);
}

function normalizeDifficulty(value: string | undefined): RecipeDifficulty | undefined {
  const clean = cleanCategory(value ?? '').replace(/\s/g, '_') as RecipeDifficulty;
  return difficultyValues.has(clean) ? clean : undefined;
}

function normalizeTimeBucket(value: string | undefined): RecipeTimeBucket | undefined {
  const clean = cleanCategory(value ?? '').replace(/\s/g, '_') as RecipeTimeBucket;
  return timeBucketValues.has(clean) ? clean : undefined;
}

function normalizeShortDescription(value: string | undefined): string {
  const clean = (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[{}]/g, '')
    .trim();

  if (!clean) {
    throw new RecipeCategorizationError('Recipe categorization returned no short description.');
  }

  const withoutBadMetadata = clean
    .replace(/\b(serves|servings?)\s+\d+\b/gi, '')
    .replace(/\b\d+\s+servings?\b/gi, '')
    .replace(/\bready in [^.]+/gi, '')
    .replace(/\b\d+[- ]?minute\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const description = withoutBadMetadata || clean;

  if (description.length <= 170) {
    return description.replace(/\s+([.,;:!?])/g, '$1');
  }

  return `${description.slice(0, 169).trimEnd().replace(/[.,;:!?-]+$/, '')}…`;
}

export function inferTimeBucket(recipe?: StructuredRecipe): RecipeTimeBucket | undefined {
  const totalMinutes = recipe?.timing?.totalMinutes;
  if (typeof totalMinutes !== 'number' || !Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return undefined;
  }
  if (totalMinutes <= 15) {
    return 'under_15';
  }
  if (totalMinutes <= 30) {
    return 'under_30';
  }
  if (totalMinutes <= 60) {
    return 'under_60';
  }
  return 'long_cook';
}

export function normalizeCategorization(
  value: LlmCategorization,
  params: { model?: string; recipe?: StructuredRecipe; updatedAt?: Date } = {},
): RecipeCategorization {
  const confidence =
    typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : undefined;
  const timeBucket = normalizeTimeBucket(value.timeBucket) ?? inferTimeBucket(params.recipe);
  const difficulty = normalizeDifficulty(value.difficulty);

  return {
    cuisine: normalizeArray(value.cuisine),
    mealType: normalizeArray(value.mealType),
    dishType: normalizeArray(value.dishType),
    diet: normalizeArray(value.diet),
    ...(difficulty ? { difficulty } : {}),
    ...(timeBucket ? { timeBucket } : {}),
    occasion: normalizeArray(value.occasion),
    equipment: normalizeArray(value.equipment),
    mainIngredients: normalizeArray(value.mainIngredients),
    techniques: normalizeArray(value.techniques),
    flavorProfile: normalizeArray(value.flavorProfile),
    ...(confidence != null ? { confidence } : {}),
    source: 'llm',
    ...(params.model ? { model: params.model } : {}),
    updatedAt: (params.updatedAt ?? new Date()).toISOString(),
  };
}

function config() {
  const apiKey = process.env.RECIPE_CATEGORIZATION_API_KEY ?? process.env.OPENROUTER_KEY;
  return {
    apiKey,
    baseUrl: process.env.RECIPE_CATEGORIZATION_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: process.env.RECIPE_CATEGORIZATION_MODEL ?? 'openai/gpt-4o-mini',
  };
}

function parseJson(content: string): LlmCategorization {
  const trimmed = content.trim();
  const json = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : trimmed;
  const parsed = JSON.parse(json) as LlmCategorization;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RecipeCategorizationError('Categorization JSON is malformed.');
  }
  return parsed;
}

function promptFor(recipe: Pick<SavedRecipe, 'title' | 'documentMarkdown' | 'recipe'>): string {
  return JSON.stringify({
    title: recipe.title,
    documentMarkdown: recipe.documentMarkdown.slice(0, 12000),
    structuredRecipe: recipe.recipe,
  });
}

export async function categorizeRecipe(
  recipe: Pick<SavedRecipe, 'title' | 'documentMarkdown' | 'recipe'>,
): Promise<RecipeCategorizationResult> {
  const { apiKey, baseUrl, model } = config();
  if (!apiKey) {
    throw new RecipeCategorizationError('Recipe categorization API key is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Categorize the recipe and write a card description. Return only JSON. Required shortDescription: one concise sentence describing what makes the dish distinct; do not mention servings, yield, prep time, cook time, equipment, or generic metadata. Required arrays: cuisine, mealType, dishType, diet, occasion, equipment, mainIngredients, techniques, flavorProfile. Optional difficulty: beginner|intermediate|advanced. Optional timeBucket: under_15|under_30|under_60|long_cook. Optional confidence: 0..1.',
        },
        { role: 'user', content: promptFor(recipe) },
      ],
      temperature: 0.1,
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new RecipeCategorizationError(`Recipe categorization failed with ${response.status}.`);
  }

  const body = (await response.json()) as ChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new RecipeCategorizationError('Recipe categorization returned no content.');
  }

  const parsed = parseJson(content);
  return {
    categorization: normalizeCategorization(parsed, { model, recipe: recipe.recipe }),
    shortDescription: normalizeShortDescription(parsed.shortDescription),
  };
}
