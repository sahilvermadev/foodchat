import mongoose from 'mongoose';
import type {
  RecipeCategorization,
  SavedRecipe,
  SavedRecipeSummary,
  SaveRecipeRequest,
  SavedRecipesQuery,
  SavedRecipesResponse,
  StructuredRecipe,
  UpdateSavedRecipeRequest,
} from 'librechat-data-provider';
import type { ISavedRecipe } from '@librechat/data-schemas';
import { categorizeRecipe } from './categorize';
import { illustrateRecipe } from './illustrate';
import { createIllustrationThumbnail, decodeIllustrationDataUrl } from '../illustrations/media';
import type { IllustrationMedia } from '../illustrations/media';
import { CookingValidationError, normalizeRecipe } from '../cooking/validation';

const maxLimit = 50;
const pendingTimeoutMs = 1000 * 60 * 2;
const activeIllustrationJobs = new Set<string>();
const usersWithRepairedTitles = new Set<string>();

type RecipeListFilter = {
  user: string;
  documentType?: string;
  updatedAt?: { $lt: Date };
  $or?: Array<{ title?: RegExp; shortDescription?: RegExp; documentMarkdown?: RegExp }>;
  'categorization.cuisine'?: string;
  'categorization.mealType'?: string;
  'categorization.diet'?: string;
  'categorization.timeBucket'?: string;
  'categorization.mainIngredients'?: string;
  'categorization.equipment'?: string;
};

function idOf(doc: { _id: unknown }): string {
  return String(doc._id);
}

function iso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function model() {
  return mongoose.model<ISavedRecipe>('SavedRecipe');
}

function isWrapperLine(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '{' || trimmed === '}';
}

function cleanRecipeMarkdown(markdown: string): string {
  const lines = markdown.trim().split('\n');
  while (lines.length > 0 && isWrapperLine(lines[0])) {
    lines.shift();
  }
  while (lines.length > 0 && isWrapperLine(lines[lines.length - 1])) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

function headingTitleFromMarkdown(markdown: string): string | undefined {
  const heading = cleanRecipeMarkdown(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  const title = heading?.replace(/^#+\s*/, '').trim();
  return title && !isWrapperLine(title) ? title.slice(0, 120) : undefined;
}

function titleFromMarkdown(markdown: string): string {
  const headingTitle = headingTitleFromMarkdown(markdown);
  if (headingTitle) {
    return headingTitle;
  }

  const heading = cleanRecipeMarkdown(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^#{1,3}\s+\S/.test(line) && !isWrapperLine(line));
  return heading?.slice(0, 120) || 'Saved recipe';
}

function cleanMarkdown(value: string | undefined): string {
  const markdown = value?.trim() ?? '';
  if (markdown.length < 3) {
    throw new CookingValidationError('Recipe document is required.');
  }
  return markdown;
}

function cleanTitle(value: string | undefined, markdown: string): string {
  const candidate = value?.trim();
  const title = candidate && !isWrapperLine(candidate) ? candidate : titleFromMarkdown(markdown);
  if (!title) {
    throw new CookingValidationError('Recipe title is required.');
  }
  return title.slice(0, 120);
}

function titleForDescription(
  storedTitle: string,
  markdown: string,
  recipe?: StructuredRecipe,
): string {
  const recipeTitle = recipe?.title?.trim();
  if (recipeTitle && !isWrapperLine(recipeTitle)) {
    return recipeTitle.slice(0, 120);
  }

  const title = storedTitle.trim();
  if (title && !isWrapperLine(title)) {
    return title.slice(0, 120);
  }

  return titleFromMarkdown(markdown);
}

function cleanInlineText(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/[_`#>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSentence(value: string, maxLength = 180): string {
  const clean = cleanInlineText(value);
  if (clean.length <= maxLength) {
    return clean;
  }

  const trimmed = clean.slice(0, maxLength - 1).trimEnd();
  return `${trimmed.replace(/[.,;:!?-]+$/, '')}…`;
}

const ignoredDescriptionSections = new Set([
  'equipment',
  'recipe data',
  'ingredients',
  'instructions',
  'steps',
  'method',
  'quality checks',
  'notes',
]);

function sectionLabel(value: string): string {
  return value
    .replace(/^#+\s*/, '')
    .replace(/[:-]+$/, '')
    .trim()
    .toLowerCase();
}

function isSectionStart(value: string): boolean {
  const normalized = sectionLabel(value);
  return [...ignoredDescriptionSections].some(
    (label) =>
      normalized === label ||
      normalized.startsWith(`${label}:`) ||
      normalized.startsWith(`${label} -`),
  );
}

function appearsInIgnoredSection(markdown: string, value: string): boolean {
  const target = cleanInlineText(value).toLowerCase();
  if (!target) {
    return false;
  }

  let isIgnoredSection = false;
  for (const rawLine of markdown.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const clean = cleanInlineText(trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
    if (trimmed.startsWith('#') || isSectionStart(clean)) {
      isIgnoredSection = isSectionStart(clean);
      continue;
    }

    if (isIgnoredSection && clean.toLowerCase() === target) {
      return true;
    }
  }

  return false;
}

function isLowQualityGeneratedDescription(value: string): boolean {
  const normalized = cleanInlineText(value).toLowerCase();
  return (
    /^a serves \d+ recipe featuring item\.?$/.test(normalized) ||
    /^a saved recipe featuring item\.?$/.test(normalized) ||
    /^\{ is .+/.test(normalized) ||
    normalized.includes(' that serves ') ||
    normalized.includes(' featuring item.')
  );
}

function descriptionFromMarkdown(markdown: string, title: string): string {
  const normalizedTitle = title.toLowerCase();
  let isIgnoredSection = false;

  for (const rawLine of markdown.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const line = cleanInlineText(trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
    if (trimmed.startsWith('#') || isSectionStart(line)) {
      isIgnoredSection = isSectionStart(line);
      continue;
    }

    const normalized = line.toLowerCase();
    if (
      !isIgnoredSection &&
      line.length > 24 &&
      normalized !== normalizedTitle &&
      !normalized.startsWith('servings:') &&
      !normalized.startsWith('prep time:') &&
      !normalized.startsWith('cook time:') &&
      !normalized.startsWith('total time:') &&
      !normalized.startsWith('yield:') &&
      !normalized.startsWith('storage:')
    ) {
      return truncateSentence(line);
    }
  }

  return '';
}

function ingredientList(recipe: StructuredRecipe): string {
  const ignoredItems = new Set(['item', 'ingredient', 'ingredients', 'food']);
  return [
    ...new Set(
      recipe.ingredients
        .map((ingredient) => ingredient.item.trim().toLowerCase())
        .filter((item) => item && !ignoredItems.has(item)),
    ),
  ]
    .slice(0, 3)
    .join(', ');
}

function articleFor(value: string): 'a' | 'an' {
  return /^[aeiou]/i.test(value) ? 'an' : 'a';
}

function readableLabel(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function categorizationDescription(
  title: string,
  recipe?: StructuredRecipe,
  categorization?: RecipeCategorization,
): string {
  if (!categorization) {
    return '';
  }

  const descriptors = [
    categorization.cuisine?.[0],
    categorization.diet?.[0],
    categorization.dishType?.[0] ?? categorization.mealType?.[0],
  ]
    .filter((value): value is string => Boolean(value))
    .map(readableLabel);
  const uniqueDescriptors = [...new Set(descriptors)];
  const descriptorPhrase = uniqueDescriptors.join(' ');
  const category = descriptorPhrase
    ? `${articleFor(descriptorPhrase)} ${descriptorPhrase}`
    : 'a saved';
  const mainIngredients = categorization.mainIngredients
    .slice(0, 2)
    .map(readableLabel)
    .join(' and ');
  const ingredientPhrase = mainIngredients ? ` centered on ${mainIngredients}` : '';

  return truncateSentence(`${title} is ${category} recipe${ingredientPhrase}.`);
}

function generatedShortDescription(
  title: string,
  documentMarkdown: string,
  recipe?: StructuredRecipe,
  categorization?: RecipeCategorization,
): string {
  const recipeDescription = recipe?.description?.trim();
  if (recipeDescription && recipeDescription.toLowerCase() !== title.toLowerCase()) {
    return truncateSentence(recipeDescription);
  }

  const markdownDescription = descriptionFromMarkdown(documentMarkdown, title);
  if (markdownDescription) {
    return markdownDescription;
  }

  const categoryDescription = categorizationDescription(title, recipe, categorization);
  if (categoryDescription) {
    return categoryDescription;
  }

  if (!recipe) {
    return '';
  }

  const details: string[] = [];
  if (recipe.timing?.totalMinutes > 0) {
    details.push(`${recipe.timing.totalMinutes}-minute`);
  }

  const ingredients = ingredientList(recipe);
  const base =
    details.length > 0
      ? `${title} is a ${details.join(', ')} recipe`
      : `${title} is a saved recipe`;
  return truncateSentence(`${base}${ingredients ? ` featuring ${ingredients}` : ''}.`);
}

function cleanShortDescription(
  value: string | undefined,
  title: string,
  markdown: string,
  recipe?: StructuredRecipe,
  categorization?: RecipeCategorization,
): string {
  const explicit = value?.trim();
  const usableExplicit =
    explicit &&
    !appearsInIgnoredSection(markdown, explicit) &&
    !isLowQualityGeneratedDescription(explicit)
      ? explicit
      : undefined;
  return truncateSentence(
    usableExplicit || generatedShortDescription(title, markdown, recipe, categorization),
  );
}

export function parseServingsFromMarkdown(markdown?: string): number | undefined {
  if (!markdown) {
    return undefined;
  }
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*]\s*)?(?:\*\*|__)?(?:servings|yield)(?:\*\*|__)?\s*:\s*(.+)$/i);
    if (match) {
      const valuePart = match[1].trim();
      const numMatch = valuePart.match(/(\d+)/);
      if (numMatch) {
        const servings = parseInt(numMatch[1], 10);
        if (servings > 0) {
          return servings;
        }
      }
    }
  }
  return undefined;
}

function serializeRecipe(recipe?: StructuredRecipe): StructuredRecipe | undefined {
  return recipe ? normalizeRecipe(recipe) : undefined;
}

function canonicalRecipe(
  recipe: StructuredRecipe | undefined,
  documentMarkdown: string,
): StructuredRecipe | undefined {
  const structuredRecipe = serializeRecipe(recipe);
  if (!structuredRecipe) {
    return undefined;
  }

  const markdownTitle = headingTitleFromMarkdown(documentMarkdown);
  const updatedRecipe = markdownTitle ? { ...structuredRecipe, title: markdownTitle } : { ...structuredRecipe };

  const parsedServings = parseServingsFromMarkdown(documentMarkdown);
  if (parsedServings !== undefined) {
    updatedRecipe.servings = parsedServings;
  }

  return updatedRecipe;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function serializeCategorization(value: unknown): RecipeCategorization | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const categorization =
    typeof (value as { toObject?: () => unknown }).toObject === 'function'
      ? (value as { toObject: () => unknown }).toObject()
      : value;
  if (!categorization || typeof categorization !== 'object') {
    return undefined;
  }

  const record = categorization as Partial<RecipeCategorization> & { updatedAt?: Date | string };
  return {
    cuisine: stringArray(record.cuisine),
    mealType: stringArray(record.mealType),
    dishType: stringArray(record.dishType),
    diet: stringArray(record.diet),
    ...(record.difficulty ? { difficulty: record.difficulty } : {}),
    ...(record.timeBucket ? { timeBucket: record.timeBucket } : {}),
    occasion: stringArray(record.occasion),
    equipment: stringArray(record.equipment),
    mainIngredients: stringArray(record.mainIngredients),
    techniques: stringArray(record.techniques),
    flavorProfile: stringArray(record.flavorProfile),
    ...(typeof record.confidence === 'number' ? { confidence: record.confidence } : {}),
    source: 'llm',
    ...(record.model ? { model: record.model } : {}),
    updatedAt: iso(record.updatedAt ? new Date(record.updatedAt) : undefined),
  };
}

function illustrationMediaUrl(recipe: ISavedRecipe, thumbnail = false): string {
  const version = recipe.updatedAt?.getTime() ?? 0;
  const variant = thumbnail ? '&variant=thumbnail' : '';
  return `/api/recipes/${encodeURIComponent(idOf(recipe))}/illustration?v=${version}${variant}`;
}

function hasIllustration(recipe: ISavedRecipe): boolean {
  return Boolean(recipe.illustrationData?.length || recipe.illustrationUrl);
}

function storedIllustration(recipe: ISavedRecipe): IllustrationMedia | null {
  if (recipe.illustrationData?.length) {
    return {
      buffer: Buffer.from(recipe.illustrationData),
      contentType: recipe.illustrationContentType ?? 'image/png',
    };
  }

  return decodeIllustrationDataUrl(recipe.illustrationUrl);
}

function serializeSavedRecipe(recipe: ISavedRecipe, thumbnail = false): SavedRecipe {
  const title = cleanTitle(
    headingTitleFromMarkdown(recipe.documentMarkdown) ?? recipe.title,
    recipe.documentMarkdown,
  );
  const structuredRecipe = canonicalRecipe(recipe.recipe, recipe.documentMarkdown);
  const categorization = serializeCategorization(recipe.categorization);
  const descriptionTitle = titleForDescription(title, recipe.documentMarkdown, structuredRecipe);
  return {
    _id: idOf(recipe),
    user: recipe.user,
    title,
    documentType: recipe.documentType ?? 'recipe',
    shortDescription: cleanShortDescription(
      recipe.shortDescription,
      descriptionTitle,
      recipe.documentMarkdown,
      structuredRecipe,
      categorization,
    ),
    ...(recipe.illustrationStatus === 'complete' || hasIllustration(recipe)
      ? { illustrationUrl: illustrationMediaUrl(recipe, thumbnail) }
      : {}),
    illustrationStatus: recipe.illustrationStatus ?? 'pending',
    ...(recipe.illustrationModel ? { illustrationModel: recipe.illustrationModel } : {}),
    documentMarkdown: recipe.documentMarkdown,
    ...(structuredRecipe ? { recipe: structuredRecipe } : {}),
    ...(recipe.sourceConversationId ? { sourceConversationId: recipe.sourceConversationId } : {}),
    ...(recipe.sourceDraftId ? { sourceDraftId: recipe.sourceDraftId } : {}),
    ...(categorization ? { categorization } : {}),
    categorizationStatus: recipe.categorizationStatus,
    categorizationVersion: recipe.categorizationVersion,
    createdAt: iso(recipe.createdAt),
    updatedAt: iso(recipe.updatedAt),
  };
}

async function repairLegacyWrapperTitles(user: string): Promise<void> {
  if (usersWithRepairedTitles.has(user)) {
    return;
  }

  const malformedRecipes = await model()
    .find({
      user,
      $or: [{ title: { $in: ['{', '}'] } }, { 'recipe.title': { $in: ['{', '}'] } }],
    })
    .select('title recipe.title documentMarkdown');

  await Promise.all(
    malformedRecipes.map(async (recipe) => {
      const title = headingTitleFromMarkdown(recipe.documentMarkdown);
      if (!title) {
        return;
      }

      const set: Partial<Pick<ISavedRecipe, 'title'>> & { 'recipe.title'?: string } = {};
      if (isWrapperLine(recipe.title)) {
        set.title = title;
      }
      if (recipe.recipe?.title && isWrapperLine(recipe.recipe.title)) {
        set['recipe.title'] = title;
      }
      if (Object.keys(set).length === 0) {
        return;
      }
      await model().updateOne({ _id: recipe._id, user }, { $set: set }, { timestamps: false });
    }),
  );
  usersWithRepairedTitles.add(user);
}

function serializeSavedRecipeSummary(recipe: ISavedRecipe): SavedRecipeSummary {
  const categorization = serializeCategorization(recipe.categorization);
  const storedTitle = recipe.title.trim();
  const recipeTitle = recipe.recipe?.title?.trim();
  let title = 'Saved recipe';
  if (storedTitle && !isWrapperLine(storedTitle)) {
    title = storedTitle;
  } else if (recipeTitle && !isWrapperLine(recipeTitle)) {
    title = recipeTitle;
  }
  const illustrationUrl =
    recipe.illustrationStatus === 'complete' || hasIllustration(recipe)
      ? illustrationMediaUrl(recipe, true)
      : undefined;

  const parsedServings = parseServingsFromMarkdown(recipe.documentMarkdown);
  const servings = parsedServings !== undefined ? parsedServings : recipe.recipe?.servings;

  return {
    _id: idOf(recipe),
    user: recipe.user,
    title,
    documentType: recipe.documentType ?? 'recipe',
    ...(recipe.shortDescription?.trim()
      ? { shortDescription: truncateSentence(recipe.shortDescription) }
      : {}),
    ...(illustrationUrl ? { illustrationUrl } : {}),
    illustrationStatus: recipe.illustrationStatus ?? 'pending',
    ...(recipe.illustrationModel ? { illustrationModel: recipe.illustrationModel } : {}),
    ...(recipe.sourceConversationId ? { sourceConversationId: recipe.sourceConversationId } : {}),
    ...(recipe.sourceDraftId ? { sourceDraftId: recipe.sourceDraftId } : {}),
    ...(categorization ? { categorization } : {}),
    categorizationStatus: recipe.categorizationStatus,
    categorizationVersion: recipe.categorizationVersion,
    ...(servings ? { servings } : {}),
    createdAt: iso(recipe.createdAt),
    updatedAt: iso(recipe.updatedAt),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFilter(value: string | undefined): string | undefined {
  const clean = value?.trim().toLowerCase();
  return clean || undefined;
}

function listFilter(user: string, query: SavedRecipesQuery): RecipeListFilter {
  const filter: RecipeListFilter = { user };
  if (query.documentType) {
    filter.documentType = query.documentType;
  }
  const q = query.q?.trim();
  if (q) {
    const expression = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { title: expression },
      { shortDescription: expression },
      { documentMarkdown: expression },
    ];
  }
  if (query.cursor) {
    const cursorDate = new Date(query.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      filter.updatedAt = { $lt: cursorDate };
    }
  }
  const cuisine = cleanFilter(query.cuisine);
  const mealType = cleanFilter(query.mealType);
  const diet = cleanFilter(query.diet);
  const mainIngredient = cleanFilter(query.mainIngredient);
  const equipment = cleanFilter(query.equipment);
  if (cuisine) {
    filter['categorization.cuisine'] = cuisine;
  }
  if (mealType) {
    filter['categorization.mealType'] = mealType;
  }
  if (diet) {
    filter['categorization.diet'] = diet;
  }
  if (query.timeBucket) {
    filter['categorization.timeBucket'] = query.timeBucket;
  }
  if (mainIngredient) {
    filter['categorization.mainIngredients'] = mainIngredient;
  }
  if (equipment) {
    filter['categorization.equipment'] = equipment;
  }
  return filter;
}

async function failStalePending(user: string): Promise<void> {
  const staleUpdatedAt = { $lt: new Date(Date.now() - pendingTimeoutMs) };
  await Promise.all([
    model().updateMany(
      {
        user,
        categorizationStatus: 'pending',
        updatedAt: staleUpdatedAt,
      },
      { $set: { categorizationStatus: 'failed' } },
    ),
    model().updateMany(
      {
        user,
        illustrationStatus: { $in: ['pending', 'generating'] },
        updatedAt: staleUpdatedAt,
      },
      { $set: { illustrationStatus: 'failed' } },
    ),
  ]);
}

async function runCategorization(recipeId: string, version: number): Promise<void> {
  const Recipe = model();
  const recipe = await Recipe.findById(recipeId).select(
    '-illustrationUrl -illustrationData -illustrationThumbnail',
  );
  if (!recipe || recipe.categorizationVersion !== version) {
    return;
  }

  try {
    const { categorization, shortDescription } = await categorizeRecipe(
      serializeSavedRecipe(recipe),
    );
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version },
      { $set: { categorization, shortDescription, categorizationStatus: 'complete' } },
    );
  } catch {
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version },
      { $set: { categorizationStatus: 'failed' } },
    );
  }
}

function scheduleCategorization(recipeId: string, version: number): void {
  void runCategorization(recipeId, version);
}

async function runIllustration(recipeId: string, version: number): Promise<void> {
  const Recipe = model();
  const recipe = await Recipe.findOneAndUpdate(
    { _id: recipeId, categorizationVersion: version, illustrationStatus: 'pending' },
    { $set: { illustrationStatus: 'generating' } },
    { new: true },
  );
  if (!recipe) {
    return;
  }

  try {
    const serialized = serializeSavedRecipe(recipe);
    const { illustrationUrl, model: illustrationModel } = await illustrateRecipe(serialized);
    const illustration = decodeIllustrationDataUrl(illustrationUrl);
    if (!illustration) {
      throw new Error('Generated recipe illustration data is malformed.');
    }
    const thumbnail = await createIllustrationThumbnail(illustration);
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version, illustrationStatus: 'generating' },
      {
        $set: {
          illustrationData: illustration.buffer,
          illustrationContentType: illustration.contentType,
          illustrationThumbnail: thumbnail.buffer,
          illustrationModel,
          illustrationStatus: 'complete',
        },
        $unset: { illustrationUrl: 1 },
      },
    );
  } catch {
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version, illustrationStatus: 'generating' },
      { $set: { illustrationStatus: 'failed' } },
    );
  }
}

function scheduleIllustration(recipeId: string, version: number): void {
  const jobKey = `${recipeId}:${version}`;
  if (activeIllustrationJobs.has(jobKey)) {
    return;
  }

  activeIllustrationJobs.add(jobKey);
  void runIllustration(recipeId, version).finally(() => {
    activeIllustrationJobs.delete(jobKey);
  });
}

function scheduleMissingIllustrations(recipes: ISavedRecipe[]): void {
  for (const recipe of recipes) {
    if (hasIllustration(recipe) || recipe.illustrationStatus !== 'pending') {
      continue;
    }
    if (recipe.illustrationModel) {
      continue;
    }
    scheduleIllustration(idOf(recipe), recipe.categorizationVersion);
  }
}

export async function saveRecipe(user: string, payload: SaveRecipeRequest): Promise<SavedRecipe> {
  const Recipe = model();
  const documentMarkdown = cleanMarkdown(payload.documentMarkdown);
  const recipe = canonicalRecipe(payload.recipe, documentMarkdown);
  const title = cleanTitle(
    headingTitleFromMarkdown(documentMarkdown) ?? payload.title ?? recipe?.title,
    documentMarkdown,
  );
  const documentType = payload.documentType ?? 'recipe';
  const enrichRecipe = documentType === 'recipe';
  const saved = await Recipe.create({
    user,
    title,
    documentType,
    shortDescription: cleanShortDescription(
      payload.shortDescription,
      title,
      documentMarkdown,
      recipe,
    ),
    documentMarkdown,
    ...(recipe ? { recipe } : {}),
    ...(payload.sourceConversationId ? { sourceConversationId: payload.sourceConversationId } : {}),
    ...(payload.sourceDraftId ? { sourceDraftId: payload.sourceDraftId } : {}),
    categorizationStatus: enrichRecipe ? 'pending' : 'complete',
    illustrationStatus: 'pending',
    categorizationVersion: 1,
  });
  if (enrichRecipe) {
    scheduleCategorization(idOf(saved), saved.categorizationVersion);
  }
  scheduleIllustration(idOf(saved), saved.categorizationVersion);
  return serializeSavedRecipe(saved);
}

export async function getRecipe(user: string, recipeId: string): Promise<SavedRecipe | null> {
  await repairLegacyWrapperTitles(user);
  await failStalePending(user);
  const recipe = await model()
    .findOne({ _id: recipeId, user })
    .select('-illustrationUrl -illustrationData -illustrationThumbnail');
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
  }
  return recipe ? serializeSavedRecipe(recipe) : null;
}

export async function getRecipeByDraft(user: string, draftId: string): Promise<SavedRecipe | null> {
  await repairLegacyWrapperTitles(user);
  await failStalePending(user);
  const recipe = await model()
    .findOne({ user, sourceDraftId: draftId })
    .select('-illustrationUrl -illustrationData -illustrationThumbnail')
    .sort({ updatedAt: -1 });
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
  }
  return recipe ? serializeSavedRecipe(recipe) : null;
}

export async function getRecipeIllustration(
  user: string,
  recipeId: string,
  thumbnail = false,
): Promise<IllustrationMedia | null> {
  const recipe = await model()
    .findOne({ _id: recipeId, user })
    .select('illustrationUrl illustrationData illustrationContentType illustrationThumbnail');
  if (!recipe) {
    return null;
  }

  const illustration = storedIllustration(recipe);
  if (!illustration) {
    return null;
  }

  if (!thumbnail) {
    return illustration;
  }

  if (recipe.illustrationThumbnail?.length) {
    return { buffer: Buffer.from(recipe.illustrationThumbnail), contentType: 'image/webp' };
  }

  const generatedThumbnail = await createIllustrationThumbnail(illustration);
  await model().updateOne(
    { _id: recipe._id },
    {
      $set: {
        illustrationData: illustration.buffer,
        illustrationContentType: illustration.contentType,
        illustrationThumbnail: generatedThumbnail.buffer,
      },
      $unset: { illustrationUrl: 1 },
    },
    { timestamps: false },
  );
  return generatedThumbnail;
}

export async function listRecipes(
  user: string,
  query: SavedRecipesQuery,
): Promise<SavedRecipesResponse> {
  await repairLegacyWrapperTitles(user);
  await failStalePending(user);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), maxLimit);
  const recipes = await model()
    .find(listFilter(user, query))
    .select(
      [
        'user',
        'title',
        'documentType',
        'shortDescription',
        'illustrationStatus',
        'illustrationModel',
        'sourceConversationId',
        'sourceDraftId',
        'categorization',
        'categorizationStatus',
        'categorizationVersion',
        'recipe.title',
        'recipe.servings',
        'documentMarkdown',
        'createdAt',
        'updatedAt',
      ].join(' '),
    )
    .sort({ updatedAt: -1 })
    .limit(limit + 1);
  scheduleMissingIllustrations(recipes);
  const page = recipes.slice(0, limit).map(serializeSavedRecipeSummary);
  const next = recipes.length > limit ? recipes[limit - 1] : undefined;
  return {
    recipes: page,
    ...(next?.updatedAt ? { nextCursor: next.updatedAt.toISOString() } : {}),
  };
}

export async function updateSavedRecipe(
  user: string,
  recipeId: string,
  payload: UpdateSavedRecipeRequest,
): Promise<SavedRecipe | null> {
  const existing = await model().findOne({ _id: recipeId, user });
  if (!existing) {
    return null;
  }

  const oldTitle = existing.title;
  const documentMarkdown =
    typeof payload.documentMarkdown === 'string'
      ? cleanMarkdown(payload.documentMarkdown)
      : existing.documentMarkdown;
  const recipe = canonicalRecipe(payload.recipe ?? existing.recipe, documentMarkdown);
  existing.title = cleanTitle(
    headingTitleFromMarkdown(documentMarkdown) ?? payload.title ?? recipe?.title ?? existing.title,
    documentMarkdown,
  );
  const titleChanged = oldTitle.trim().toLowerCase() !== existing.title.trim().toLowerCase();
  const shouldRegenerateIllustration = !hasIllustration(existing) || titleChanged;

  existing.documentType = payload.documentType ?? existing.documentType ?? 'recipe';
  existing.shortDescription = cleanShortDescription(
    payload.shortDescription,
    existing.title,
    documentMarkdown,
    recipe,
  );
  existing.documentMarkdown = documentMarkdown;
  if (recipe) {
    existing.recipe = recipe;
  }
  existing.categorization = undefined;
  const enrichRecipe = existing.documentType === 'recipe';
  existing.categorizationStatus = enrichRecipe ? 'pending' : 'complete';
  if (shouldRegenerateIllustration) {
    existing.illustrationUrl = '';
    existing.illustrationData = undefined;
    existing.illustrationContentType = undefined;
    existing.illustrationThumbnail = undefined;
    existing.illustrationStatus = 'pending';
    existing.illustrationModel = undefined;
  }
  existing.categorizationVersion += 1;
  await existing.save();
  if (enrichRecipe) {
    scheduleCategorization(idOf(existing), existing.categorizationVersion);
  }
  if (shouldRegenerateIllustration) {
    scheduleIllustration(idOf(existing), existing.categorizationVersion);
  }
  return serializeSavedRecipe(existing);
}

export async function deleteSavedRecipe(user: string, recipeId: string): Promise<boolean> {
  const result = await model().deleteOne({ _id: recipeId, user });
  return result.deletedCount === 1;
}

export { CookingValidationError };
