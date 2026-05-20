import mongoose from 'mongoose';
import type {
  RecipeCategorization,
  SavedRecipe,
  SaveRecipeRequest,
  SavedRecipesQuery,
  SavedRecipesResponse,
  StructuredRecipe,
  UpdateSavedRecipeRequest,
} from 'librechat-data-provider';
import type { ISavedRecipe } from '@librechat/data-schemas';
import { categorizeRecipe } from './categorize';
import { illustrateRecipe } from './illustrate';
import { CookingValidationError, normalizeRecipe } from '../cooking/validation';

const maxLimit = 50;
const pendingTimeoutMs = 1000 * 60 * 2;

type RecipeListFilter = {
  user: string;
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

function titleFromMarkdown(markdown: string): string {
  const heading = cleanRecipeMarkdown(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line) || (line.length > 0 && !isWrapperLine(line)));
  return heading?.replace(/^#+\s*/, '').slice(0, 120) || 'Saved recipe';
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
    .replace(/[:\-]+$/, '')
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

function serializeRecipe(recipe?: StructuredRecipe): StructuredRecipe | undefined {
  return recipe ? normalizeRecipe(recipe) : undefined;
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

function serializeSavedRecipe(recipe: ISavedRecipe): SavedRecipe {
  const categorization = serializeCategorization(recipe.categorization);
  const descriptionTitle = titleForDescription(
    recipe.title,
    recipe.documentMarkdown,
    recipe.recipe,
  );
  return {
    _id: idOf(recipe),
    user: recipe.user,
    title: recipe.title,
    shortDescription: cleanShortDescription(
      recipe.shortDescription,
      descriptionTitle,
      recipe.documentMarkdown,
      recipe.recipe,
      categorization,
    ),
    ...(recipe.illustrationUrl ? { illustrationUrl: recipe.illustrationUrl } : {}),
    illustrationStatus: recipe.illustrationStatus ?? 'pending',
    ...(recipe.illustrationModel ? { illustrationModel: recipe.illustrationModel } : {}),
    documentMarkdown: recipe.documentMarkdown,
    ...(recipe.recipe ? { recipe: serializeRecipe(recipe.recipe) } : {}),
    ...(recipe.sourceConversationId ? { sourceConversationId: recipe.sourceConversationId } : {}),
    ...(recipe.sourceDraftId ? { sourceDraftId: recipe.sourceDraftId } : {}),
    ...(categorization ? { categorization } : {}),
    categorizationStatus: recipe.categorizationStatus,
    categorizationVersion: recipe.categorizationVersion,
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
        illustrationStatus: 'pending',
        updatedAt: staleUpdatedAt,
      },
      { $set: { illustrationStatus: 'failed' } },
    ),
  ]);
}

async function runCategorization(recipeId: string, version: number): Promise<void> {
  const Recipe = model();
  const recipe = await Recipe.findById(recipeId);
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
  const recipe = await Recipe.findById(recipeId);
  if (!recipe || recipe.categorizationVersion !== version) {
    return;
  }

  try {
    const serialized = serializeSavedRecipe(recipe);
    const { illustrationUrl, model: illustrationModel } = await illustrateRecipe(serialized);
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version },
      { $set: { illustrationUrl, illustrationModel, illustrationStatus: 'complete' } },
    );
  } catch {
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version },
      { $set: { illustrationStatus: 'failed' } },
    );
  }
}

function scheduleIllustration(recipeId: string, version: number): void {
  void runIllustration(recipeId, version);
}

function scheduleMissingIllustrations(recipes: ISavedRecipe[]): void {
  for (const recipe of recipes) {
    if (recipe.illustrationUrl || recipe.illustrationStatus === 'complete') {
      continue;
    }
    if (recipe.illustrationStatus === 'pending' && recipe.illustrationModel) {
      continue;
    }
    recipe.illustrationStatus = 'pending';
    void recipe.save().then(() => scheduleIllustration(idOf(recipe), recipe.categorizationVersion));
  }
}

export async function saveRecipe(user: string, payload: SaveRecipeRequest): Promise<SavedRecipe> {
  const Recipe = model();
  const documentMarkdown = cleanMarkdown(payload.documentMarkdown);
  const recipe = serializeRecipe(payload.recipe);
  const title = cleanTitle(payload.title ?? recipe?.title, documentMarkdown);
  const saved = await Recipe.create({
    user,
    title,
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
    categorizationStatus: 'pending',
    illustrationStatus: 'pending',
    categorizationVersion: 1,
  });
  scheduleCategorization(idOf(saved), saved.categorizationVersion);
  scheduleIllustration(idOf(saved), saved.categorizationVersion);
  return serializeSavedRecipe(saved);
}

export async function getRecipe(user: string, recipeId: string): Promise<SavedRecipe | null> {
  await failStalePending(user);
  const recipe = await model().findOne({ _id: recipeId, user });
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
  }
  return recipe ? serializeSavedRecipe(recipe) : null;
}

export async function getRecipeByDraft(user: string, draftId: string): Promise<SavedRecipe | null> {
  await failStalePending(user);
  const recipe = await model().findOne({ user, sourceDraftId: draftId }).sort({ updatedAt: -1 });
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
  }
  return recipe ? serializeSavedRecipe(recipe) : null;
}

export async function listRecipes(
  user: string,
  query: SavedRecipesQuery,
): Promise<SavedRecipesResponse> {
  await failStalePending(user);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), maxLimit);
  const recipes = await model()
    .find(listFilter(user, query))
    .sort({ updatedAt: -1 })
    .limit(limit + 1);
  scheduleMissingIllustrations(recipes);
  const page = recipes.slice(0, limit).map(serializeSavedRecipe);
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

  const documentMarkdown =
    typeof payload.documentMarkdown === 'string'
      ? cleanMarkdown(payload.documentMarkdown)
      : existing.documentMarkdown;
  const recipe = payload.recipe ? serializeRecipe(payload.recipe) : existing.recipe;
  existing.title = cleanTitle(payload.title ?? recipe?.title ?? existing.title, documentMarkdown);
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
  existing.categorizationStatus = 'pending';
  existing.illustrationUrl = '';
  existing.illustrationStatus = 'pending';
  existing.illustrationModel = undefined;
  existing.categorizationVersion += 1;
  await existing.save();
  scheduleCategorization(idOf(existing), existing.categorizationVersion);
  scheduleIllustration(idOf(existing), existing.categorizationVersion);
  return serializeSavedRecipe(existing);
}

export { CookingValidationError };
