import mongoose from 'mongoose';
import type {
  ResolveSpecialtyIngredientRequest,
  SpecialtyIngredientCatalogItem,
  SpecialtyIngredientCatalogResponse,
  SpecialtyIngredientCategory,
} from 'librechat-data-provider';
import type { ISpecialtyIngredient } from '@librechat/data-schemas';
import { specialtyIngredientSchema } from '@librechat/data-schemas';
import { createIllustrationThumbnail, decodeIllustrationDataUrl } from '../illustrations/media';
import type { IllustrationMedia } from '../illustrations/media';

const imageStyle = 'rekky-ingredient-v1';
const requestTimeoutMs = 45000;
const generationLeaseMs = requestTimeoutMs * 2;
const maxSuggestions = 12;
const activeIllustrationJobs = new Set<string>();

type ImageGenerationResponse = {
  choices?: Array<{
    message?: {
      images?: Array<{
        image_url?: { url?: string };
        imageUrl?: { url?: string };
      }>;
    };
  }>;
};

const aliases = new Map<string, string>([
  ['gochujang paste', 'gochujang'],
  ['korean chili paste', 'gochujang'],
  ['korean chilli paste', 'gochujang'],
  ['white miso paste', 'white miso'],
  ['red miso paste', 'red miso'],
  ['miso paste', 'miso'],
  ['fish sauce bottle', 'fish sauce'],
  ['parmesan cheese', 'parmesan'],
  ['cheddar cheese', 'cheddar'],
  ['mozzarella cheese', 'mozzarella'],
  ['preserved lemon', 'preserved lemons'],
]);

const quantityPrefixes = [
  'a',
  'an',
  'the',
  'of',
  'some',
  'jar',
  'jars',
  'bottle',
  'bottles',
  'packet',
  'packets',
  'pack',
  'packs',
  'tin',
  'tins',
  'can',
  'cans',
  'sprig',
  'sprigs',
  'block',
  'blocks',
  'wedge',
  'wedges',
  'bag',
  'bags',
  'box',
  'boxes',
  'tub',
  'tubs',
];

const categoryPatterns: Array<{ category: SpecialtyIngredientCategory; patterns: RegExp[] }> = [
  { category: 'Freezer', patterns: [/\bfrozen\b/, /\bfreezer\b/, /\bice\b/] },
  {
    category: 'Cheese & Dairy',
    patterns: [
      /\bcheese\b/,
      /\bcheddar\b/,
      /\bmozzarella\b/,
      /\bparmesan\b/,
      /\bfeta\b/,
      /\bpaneer\b/,
      /\byogurt\b/,
      /\bcream\b/,
      /\bbutter\b/,
    ],
  },
  {
    category: 'Preserved & Pickled',
    patterns: [
      /\bpickled?\b/,
      /\bpreserved\b/,
      /\bfermented\b/,
      /\bkimchi\b/,
      /\bcapers?\b/,
      /\bolives?\b/,
      /\bsauerkraut\b/,
      /\banchov(y|ies)\b/,
    ],
  },
  {
    category: 'Condiments & Sauces',
    patterns: [
      /\bsauce\b/,
      /\bpaste\b/,
      /\bgochujang\b/,
      /\bmiso\b/,
      /\btahini\b/,
      /\bmustard\b/,
      /\bvinegar\b/,
      /\bsoy\b/,
      /\bhot sauce\b/,
      /\bchutney\b/,
      /\bsalsa\b/,
    ],
  },
  {
    category: 'Meat & Protein',
    patterns: [
      /\bchicken\b/,
      /\bbeef\b/,
      /\bpork\b/,
      /\bbacon\b/,
      /\bham\b/,
      /\blamb\b/,
      /\btofu\b/,
      /\btempeh\b/,
      /\beggs?\b/,
      /\bbeans?\b/,
      /\blentils?\b/,
      /\bfish\b/,
      /\bshrimp\b/,
    ],
  },
];
const categories = new Set<SpecialtyIngredientCategory>([
  'Condiments & Sauces',
  'Cheese & Dairy',
  'Preserved & Pickled',
  'Freezer',
  'Meat & Protein',
  'Other',
]);

export class SpecialtyIngredientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecialtyIngredientValidationError';
  }
}

function model() {
  return (
    mongoose.models.SpecialtyIngredient ||
    mongoose.model<ISpecialtyIngredient>('SpecialtyIngredient', specialtyIngredientSchema)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSpecialtyIngredientName(input: string): string {
  const clean = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nameParts = clean.split(' ');
  while (nameParts.length > 1 && quantityPrefixes.includes(nameParts[0])) {
    nameParts.shift();
  }
  const withoutQuantity = nameParts.join(' ').trim();
  const normalized = aliases.get(withoutQuantity) ?? withoutQuantity;
  return normalized;
}

function displayNameFor(normalizedName: string): string {
  return normalizedName
    .split(' ')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function inferCategory(name: string): SpecialtyIngredientCategory {
  const match = categoryPatterns.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(name)),
  );
  return match?.category ?? 'Other';
}

function validateCategory(
  category: SpecialtyIngredientCategory | undefined,
): SpecialtyIngredientCategory | undefined {
  if (category === undefined) {
    return undefined;
  }
  if (!categories.has(category)) {
    throw new SpecialtyIngredientValidationError('Ingredient category is invalid.');
  }
  return category;
}

function imagePromptFor(displayName: string): string {
  return [
    `Create one hand-drawn editorial food illustration of ${displayName}.`,
    'Visual direction: warm cookbook ink-and-watercolor artwork, loose black ink linework, rich watercolor and gouache washes, textured paper, soft natural shadows, clear ingredient silhouette, appetizing but not photorealistic.',
    'Show only the generic ingredient, not a branded product. No labels, no text, no logo, no people, no brand packaging.',
  ].join('\n');
}

function imageConfig() {
  const apiKey =
    process.env.INGREDIENT_ILLUSTRATION_API_KEY ??
    process.env.RECIPE_ILLUSTRATION_API_KEY ??
    process.env.OPENROUTER_KEY;
  return {
    apiKey,
    baseUrl:
      process.env.INGREDIENT_ILLUSTRATION_BASE_URL ??
      process.env.RECIPE_ILLUSTRATION_BASE_URL ??
      'https://openrouter.ai/api/v1',
    model:
      process.env.INGREDIENT_ILLUSTRATION_MODEL ??
      process.env.RECIPE_ILLUSTRATION_MODEL ??
      'google/gemini-2.5-flash-image',
  };
}

function imageUrlFrom(body: ImageGenerationResponse): string {
  const image = body.choices?.[0]?.message?.images?.[0];
  const url = image?.image_url?.url ?? image?.imageUrl?.url;
  if (!url || !url.startsWith('data:image/')) {
    throw new SpecialtyIngredientValidationError(
      'Ingredient illustration returned no image data URL.',
    );
  }
  return url;
}

function hasImage(ingredient: ISpecialtyIngredient): boolean {
  return Boolean(ingredient.imageData?.length || ingredient.imageUrl);
}

function storedImage(ingredient: ISpecialtyIngredient): IllustrationMedia | null {
  if (ingredient.imageData?.length) {
    return {
      buffer: Buffer.from(ingredient.imageData),
      contentType: ingredient.imageContentType ?? 'image/png',
    };
  }

  return decodeIllustrationDataUrl(ingredient.imageUrl);
}

async function generateImage(prompt: string): Promise<{ imageUrl: string; model: string }> {
  const { apiKey, baseUrl, model: imageModel } = imageConfig();
  if (!apiKey) {
    throw new SpecialtyIngredientValidationError(
      'Ingredient illustration API key is not configured.',
    );
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
      model: imageModel,
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '4:3',
        image_size: '1K',
      },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new SpecialtyIngredientValidationError(
      `Ingredient illustration failed with ${response.status}.`,
    );
  }

  const body = (await response.json()) as ImageGenerationResponse;
  return { imageUrl: imageUrlFrom(body), model: imageModel };
}

async function runIllustration(ingredientId: string): Promise<void> {
  const Ingredient = model();
  const ingredient = await Ingredient.findOneAndUpdate(
    { _id: ingredientId, imageStyle, imageStatus: 'pending' },
    { $set: { imageStatus: 'generating' } },
    { new: true },
  );
  if (!ingredient) {
    return;
  }
  if (hasImage(ingredient)) {
    await Ingredient.updateOne(
      { _id: ingredientId, imageStyle, imageStatus: 'generating' },
      { $set: { imageStatus: 'ready' } },
    );
    return;
  }

  try {
    const { imageUrl, model: imageModel } = await generateImage(
      ingredient.imagePrompt ?? imagePromptFor(ingredient.displayName),
    );
    const image = decodeIllustrationDataUrl(imageUrl);
    if (!image) {
      throw new Error('Generated ingredient illustration data is malformed.');
    }
    const thumbnail = await createIllustrationThumbnail(image);
    await Ingredient.updateOne(
      { _id: ingredientId, imageStyle, imageStatus: 'generating' },
      {
        $set: {
          imageData: image.buffer,
          imageContentType: image.contentType,
          imageThumbnail: thumbnail.buffer,
          imageModel,
          imageStatus: 'ready',
        },
        $unset: { imageUrl: 1 },
      },
    );
  } catch {
    await Ingredient.updateOne(
      { _id: ingredientId, imageStyle, imageStatus: 'generating' },
      { $set: { imageStatus: 'failed' } },
    );
  }
}

function scheduleIllustration(ingredientId: string): void {
  if (activeIllustrationJobs.has(ingredientId)) {
    return;
  }

  activeIllustrationJobs.add(ingredientId);
  void runIllustration(ingredientId).finally(() => {
    activeIllustrationJobs.delete(ingredientId);
  });
}

function queueMissingIllustrations(ingredients: ISpecialtyIngredient[]): void {
  ingredients
    .filter((ingredient) => !hasImage(ingredient) && ingredient.imageStatus === 'pending')
    .forEach((ingredient) => scheduleIllustration(ingredient._id.toString()));
}

async function recoverStaleIllustrations(): Promise<void> {
  await model().updateMany(
    {
      imageStyle,
      imageStatus: 'generating',
      updatedAt: { $lt: new Date(Date.now() - generationLeaseMs) },
    },
    { $set: { imageStatus: 'pending' } },
  );
}

function ingredientImageUrl(ingredient: ISpecialtyIngredient): string {
  const version = ingredient.updatedAt?.getTime() ?? 0;
  return `/api/preferences/ingredients/${encodeURIComponent(ingredient._id.toString())}/image?v=${version}&variant=thumbnail`;
}

function serialize(ingredient: ISpecialtyIngredient): SpecialtyIngredientCatalogItem {
  const imageUrl =
    ingredient.imageStatus === 'ready' || hasImage(ingredient)
      ? ingredientImageUrl(ingredient)
      : undefined;
  return {
    _id: ingredient._id.toString(),
    canonicalName: ingredient.canonicalName,
    normalizedName: ingredient.normalizedName,
    displayName: ingredient.displayName,
    category: ingredient.category,
    aliases: ingredient.aliases ?? [],
    imageStatus: ingredient.imageStatus,
    ...(imageUrl ? { imageUrl } : {}),
    imageStyle: ingredient.imageStyle,
    createdAt: ingredient.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: ingredient.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listSpecialtyIngredients(
  query = '',
): Promise<SpecialtyIngredientCatalogResponse> {
  const Ingredient = model();
  await recoverStaleIllustrations();
  const normalized = normalizeSpecialtyIngredientName(query);
  const filter = normalized
    ? {
        imageStyle,
        $or: [
          { normalizedName: new RegExp(escapeRegExp(normalized), 'i') },
          { displayName: new RegExp(escapeRegExp(query.trim()), 'i') },
          { aliases: new RegExp(escapeRegExp(normalized), 'i') },
        ],
      }
    : { imageStyle };
  const ingredients = await Ingredient.find(filter)
    .select('-imageUrl -imageData -imageThumbnail')
    .sort({ displayName: 1 })
    .limit(maxSuggestions);
  queueMissingIllustrations(ingredients);
  return { ingredients: ingredients.map(serialize) };
}

export async function getSpecialtyIngredientImage(
  ingredientId: string,
  thumbnail = true,
): Promise<IllustrationMedia | null> {
  const ingredient = await model()
    .findById(ingredientId)
    .select('imageUrl imageData imageContentType imageThumbnail');
  if (!ingredient) {
    return null;
  }

  const image = storedImage(ingredient);
  if (!image) {
    return null;
  }

  if (!thumbnail) {
    return image;
  }

  if (ingredient.imageThumbnail?.length) {
    return { buffer: Buffer.from(ingredient.imageThumbnail), contentType: 'image/webp' };
  }

  const generatedThumbnail = await createIllustrationThumbnail(image);
  await model().updateOne(
    { _id: ingredient._id },
    {
      $set: {
        imageData: image.buffer,
        imageContentType: image.contentType,
        imageThumbnail: generatedThumbnail.buffer,
      },
      $unset: { imageUrl: 1 },
    },
    { timestamps: false },
  );
  return generatedThumbnail;
}

export async function resolveSpecialtyIngredient(
  payload: ResolveSpecialtyIngredientRequest,
): Promise<SpecialtyIngredientCatalogItem> {
  const Ingredient = model();
  const normalizedName = normalizeSpecialtyIngredientName(payload.name);
  if (!normalizedName) {
    throw new SpecialtyIngredientValidationError('Ingredient name is required.');
  }
  const category = validateCategory(payload.category);

  const existing = await Ingredient.findOne({
    imageStyle,
    $or: [{ normalizedName }, { aliases: normalizedName }],
  });
  if (existing) {
    if (existing.imageStatus === 'failed' && !hasImage(existing)) {
      existing.imageStatus = 'pending';
      await existing.save();
      scheduleIllustration(existing._id.toString());
    } else if (existing.imageStatus === 'pending' && !hasImage(existing)) {
      scheduleIllustration(existing._id.toString());
    }
    return serialize(existing);
  }

  const displayName = displayNameFor(normalizedName);
  let ingredient: ISpecialtyIngredient;
  try {
    ingredient = await Ingredient.create({
      canonicalName: normalizedName,
      normalizedName,
      displayName,
      category: category ?? inferCategory(normalizedName),
      aliases: [payload.name.trim().toLowerCase()].filter(
        (alias) => alias && alias !== normalizedName,
      ),
      imageStatus: 'pending',
      imagePrompt: imagePromptFor(displayName),
      imageStyle,
    });
  } catch (error) {
    const isDuplicate =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (!isDuplicate) {
      throw error;
    }
    const duplicate = await Ingredient.findOne({ imageStyle, normalizedName });
    if (!duplicate) {
      throw error;
    }
    if (duplicate.imageStatus === 'pending' && !hasImage(duplicate)) {
      scheduleIllustration(duplicate._id.toString());
    }
    return serialize(duplicate);
  }
  scheduleIllustration(ingredient._id.toString());
  return serialize(ingredient);
}
