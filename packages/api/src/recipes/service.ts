import mongoose from 'mongoose';
import type { FilterQuery } from 'mongoose';
import type {
  OfflineRecipesResponse,
  RecipeCategorization,
  RecipeFacetOption,
  PublicRecipe,
  PublicRecipeAuthor,
  PublicRecipeSummary,
  PublicRecipesResponse,
  SavedRecipe,
  SavedRecipeList,
  SavedRecipeSummary,
  SavedRecipeFacetsResponse,
  SaveRecipeRequest,
  SavedRecipesQuery,
  SavedRecipesResponse,
  StructuredRecipe,
  UpdateSavedRecipeRequest,
} from 'librechat-data-provider';
import {
  canonicalRecipeFromContent,
  hasUsableStructuredRecipe,
  recipeCompletenessIssues,
} from 'librechat-data-provider';
import type { ISavedRecipe, ISocialImport, IUser } from '@librechat/data-schemas';
import { categorizeRecipe } from './categorize';
import { illustrateRecipe } from './illustrate';
import {
  createIllustrationThumbnail,
  decodeIllustrationDataUrl,
  fetchRemoteImage,
} from '../illustrations/media';
import type { IllustrationMedia } from '../illustrations/media';
import { CookingValidationError, normalizeRecipe } from '../cooking/validation';
import { encodeTimestampCursor, parseTimestampCursor } from '../pagination';

const maxLimit = 50;
const pendingTimeoutMs = 1000 * 60 * 2;
const externalImageFetchTimeoutMs = 5000;
const maxExternalImageBytes = 5 * 1024 * 1024;
const activeIllustrationJobs = new Set<string>();
const activeCategorizationJobs = new Set<string>();
const usersWithRepairedTitles = new Set<string>();
const usersWithRepairedSaveLists = new Set<string>();
const usersWithRepairedImportImages = new Set<string>();
const usersWithRepairedStructures = new Set<string>();
const importedIllustrationVersion = 2;

type RecipeListFilter = {
  user: string;
  documentType?: string | { $in: string[] };
  saveList?: SavedRecipeList;
  collections?: string | RegExp | { $in: Array<string | RegExp> };
  favorite?: boolean;
  pinned?: boolean;
  updatedAt?: { $gt?: Date; $lt?: Date; $lte?: Date };
  $or?: Array<{ title?: RegExp; shortDescription?: RegExp; documentMarkdown?: RegExp }>;
  'categorization.cuisine'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.mealType'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.diet'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.difficulty'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.timeBucket'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.mainIngredients'?: string | RegExp | { $in: Array<string | RegExp> };
  'categorization.equipment'?: string | RegExp | { $in: Array<string | RegExp> };
};

function idOf(doc: { _id: unknown }): string {
  return String(doc._id);
}

function iso(date?: Date | string): string {
  return typeof date === 'string' ? date : (date ?? new Date()).toISOString();
}

function model() {
  return mongoose.model<ISavedRecipe>('SavedRecipe');
}

function userModel() {
  return mongoose.model<IUser>('User');
}

function socialImportModel() {
  return mongoose.model<ISocialImport>('SocialImport');
}

async function reconcileRecipeDeletions(user: string): Promise<void> {
  const tombstones = await mongoose.models.RecipeTombstone.find({ state: 'pending', user }).select(
    '_id recipeId',
  );
  if (!tombstones.length) return;
  await model().deleteMany({
    _id: { $in: tombstones.map((tombstone) => tombstone.recipeId) },
    user,
  });
  await mongoose.models.RecipeTombstone.updateMany(
    { _id: { $in: tombstones.map((tombstone) => tombstone._id) }, user },
    { $set: { deletedAt: new Date(), state: 'committed' } },
  );
}

async function fetchExternalImage(url: string): Promise<IllustrationMedia | null> {
  try {
    return await fetchRemoteImage(url, {
      maxBytes: maxExternalImageBytes,
      timeoutMs: externalImageFetchTimeoutMs,
    });
  } catch {
    return null;
  }
}

async function importExternalIllustration(url: string | undefined): Promise<{
  illustration: IllustrationMedia;
  thumbnail: IllustrationMedia;
} | null> {
  if (!url) {
    return null;
  }
  const illustration = await fetchExternalImage(url);
  if (!illustration) {
    return null;
  }
  try {
    return {
      illustration,
      thumbnail: await createIllustrationThumbnail(illustration),
    };
  } catch {
    return null;
  }
}

type SocialImportIllustration = {
  media?: {
    illustration: IllustrationMedia;
    thumbnail: IllustrationMedia;
  };
  url?: string;
  sourceUrl?: string;
};

async function socialImportIllustration(
  user: string,
  sourceDraftId: string | undefined,
): Promise<SocialImportIllustration> {
  if (!sourceDraftId) {
    return {};
  }
  const socialImport = await socialImportModel()
    .findOne({ user, draftId: sourceDraftId })
    .select('sourceUrl thumbnailUrl thumbnailData thumbnailContentType thumbnailThumbnail');
  const url = socialImport?.thumbnailUrl?.trim() || undefined;
  const sourceUrl = socialImport?.sourceUrl?.trim() || undefined;
  if (!socialImport?.thumbnailData?.length) {
    return { sourceUrl, url };
  }
  const illustration = {
    buffer: Buffer.from(socialImport.thumbnailData),
    contentType: socialImport.thumbnailContentType ?? 'image/jpeg',
  };
  const thumbnail = socialImport.thumbnailThumbnail?.length
    ? { buffer: Buffer.from(socialImport.thumbnailThumbnail), contentType: 'image/webp' }
    : await createIllustrationThumbnail(illustration);
  return { media: { illustration, thumbnail }, sourceUrl, url };
}

async function markSocialImportSavedRecipe(
  user: string,
  sourceDraftId: string | undefined,
  savedRecipeId: string,
): Promise<void> {
  if (!sourceDraftId) {
    return;
  }
  await socialImportModel().updateOne(
    { user, draftId: sourceDraftId },
    {
      $set: {
        savedRecipeId,
        status: 'saved_recipe',
        draftSummary: 'Saved to recipe library.',
      },
    },
  );
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
    const tableMatch = trimmed.match(/^\|\s*(?:servings|serves)\s*\|\s*([^|]+)\|/i);
    const yieldMatch = trimmed.match(
      /^(?:[-*]\s*)?(?:\*\*|__)?yield(?::)?(?:\*\*|__)?\s*:?[ \t]*(.+\bservings?\b.*)$/i,
    );
    const match =
      tableMatch ??
      trimmed.match(
        /^(?:[-*]\s*)?(?:\*\*|__)?(?:servings|serves)(?::)?(?:\*\*|__)?\s*:?[ \t]*(.+)$/i,
      ) ??
      yieldMatch;
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

export function parseYieldFromMarkdown(markdown?: string): string | undefined {
  if (!markdown) return undefined;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    const tableMatch = trimmed.match(/^\|\s*(?:servings|serves|yield)\s*\|\s*([^|]+)\|/i);
    const match =
      tableMatch ??
      trimmed.match(
        /^(?:[-*]\s*)?(?:\*\*|__)?(?:servings|serves|yield)(?::)?(?:\*\*|__)?\s*:?[ \t]*(.+)$/i,
      );
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function canonicalRecipe(
  recipe: StructuredRecipe | undefined,
  documentMarkdown: string,
): StructuredRecipe | undefined {
  const serializedInput = recipe ? normalizeRecipe(recipe) : undefined;
  const resolved = canonicalRecipeFromContent({
    markdown: documentMarkdown,
    recipe: serializedInput,
  });
  const structuredRecipe = resolved ? normalizeRecipe(resolved) : undefined;
  if (!structuredRecipe) return undefined;

  const markdownTitle = headingTitleFromMarkdown(documentMarkdown);
  const updatedRecipe = markdownTitle
    ? { ...structuredRecipe, title: markdownTitle }
    : { ...structuredRecipe };

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
    potentialAllergens: stringArray(record.potentialAllergens),
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
    mainIngredients: stringArray(record.mainIngredients),
    techniques: stringArray(record.techniques),
    flavorProfile: stringArray(record.flavorProfile),
    ...(typeof record.confidence === 'number' ? { confidence: record.confidence } : {}),
    source: record.source === 'hybrid' ? 'hybrid' : 'llm',
    ...(record.model ? { model: record.model } : {}),
    updatedAt: iso(record.updatedAt ? new Date(record.updatedAt) : undefined),
  };
}

function illustrationMediaUrl(recipe: ISavedRecipe, thumbnail = false): string {
  const version = recipe.updatedAt?.getTime() ?? 0;
  const variant = thumbnail ? '&variant=thumbnail' : '';
  return `/api/recipes/${encodeURIComponent(idOf(recipe))}/illustration?v=${version}${variant}`;
}

function publicIllustrationMediaUrl(recipe: ISavedRecipe, thumbnail = false): string {
  const version = recipe.updatedAt?.getTime() ?? 0;
  const variant = thumbnail ? '&variant=thumbnail' : '';
  return `/api/recipes/explore/${encodeURIComponent(idOf(recipe))}/illustration?v=${version}${variant}`;
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
  const recipeYield = parseYieldFromMarkdown(recipe.documentMarkdown);
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
    saveList: cleanSaveList(recipe.saveList),
    collections: [...(recipe.collections ?? [])],
    favorite: recipe.favorite ?? false,
    pinned: recipe.pinned ?? false,
    ...(recipe.personalNotes ? { personalNotes: recipe.personalNotes } : {}),
    ...(recipe.workspaceState
      ? {
          workspaceState: {
            servings: recipe.workspaceState.servings,
            unitMode: recipe.workspaceState.unitMode,
            checkedIngredientIds: [...recipe.workspaceState.checkedIngredientIds],
            timers: recipe.workspaceState.timers.map((timer) => {
              const remaining =
                timer.running && timer.endsAt != null
                  ? Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
                  : timer.remaining;
              const running = timer.running && remaining > 0;
              return {
                id: timer.id,
                label: timer.label,
                remaining,
                running,
                ...(running && timer.endsAt != null ? { endsAt: timer.endsAt } : {}),
              };
            }),
            updatedAt: iso(recipe.workspaceState.updatedAt),
          },
        }
      : {}),
    ...(recipe.lastCookedAt ? { lastCookedAt: iso(recipe.lastCookedAt) } : {}),
    ...(structuredRecipe ? { recipe: structuredRecipe } : {}),
    ...(recipeYield ? { yield: recipeYield } : {}),
    ...(recipe.sourceConversationId ? { sourceConversationId: recipe.sourceConversationId } : {}),
    ...(recipe.sourceDraftId ? { sourceDraftId: recipe.sourceDraftId } : {}),
    ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
    ...(categorization ? { categorization } : {}),
    categorizationStatus: recipe.categorizationStatus,
    categorizationAttempts: recipe.categorizationAttempts ?? 0,
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

async function repairLegacySaveLists(user: string): Promise<void> {
  if (usersWithRepairedSaveLists.has(user)) {
    return;
  }

  await model().updateMany(
    {
      user,
      $or: [{ saveList: { $exists: false } }, { saveList: null }],
    },
    { $set: { saveList: 'want_to_cook' } },
    { timestamps: false },
  );
  usersWithRepairedSaveLists.add(user);
}

async function repairLegacyRecipeStructures(user: string): Promise<void> {
  if (usersWithRepairedStructures.has(user)) return;
  const recipes = await model()
    .find({ user, documentType: 'recipe' })
    .select('recipe documentMarkdown categorizationVersion');
  await Promise.all(
    recipes.map(async (stored) => {
      if (hasUsableStructuredRecipe(stored.recipe)) return;
      const repaired = canonicalRecipe(stored.recipe, stored.documentMarkdown);
      if (!repaired || !hasUsableStructuredRecipe(repaired)) return;
      await model().updateOne(
        { _id: stored._id, user },
        {
          $set: { recipe: repaired, categorizationStatus: 'pending', categorizationAttempts: 0 },
          $inc: { categorizationVersion: 1 },
        },
        { timestamps: false },
      );
    }),
  );
  usersWithRepairedStructures.add(user);
}

async function repairLegacyImportedIllustrations(user: string): Promise<void> {
  if (usersWithRepairedImportImages.has(user)) return;
  const imports = await socialImportModel()
    .find({
      user,
      $or: [
        { thumbnailData: { $exists: true, $ne: null } },
        { thumbnailUrl: { $exists: true, $ne: '' } },
      ],
    })
    .select(
      'savedRecipeId draftId sourceUrl thumbnailUrl thumbnailData thumbnailContentType thumbnailThumbnail',
    );
  if (!imports.length) {
    usersWithRepairedImportImages.add(user);
    return;
  }
  const savedRecipeIds = imports.flatMap((item) =>
    item.savedRecipeId ? [item.savedRecipeId] : [],
  );
  const draftIds = imports.flatMap((item) => (item.draftId ? [item.draftId] : []));
  const recipes = await model()
    .find({
      user,
      $and: [
        {
          $or: [
            { illustrationSource: { $ne: 'imported' } },
            { illustrationSourceVersion: { $ne: importedIllustrationVersion } },
          ],
        },
      ],
      $or: [{ _id: { $in: savedRecipeIds } }, { sourceDraftId: { $in: draftIds } }],
    })
    .select('sourceDraftId illustrationData illustrationUrl');
  const importByDraft = new Map(
    imports.flatMap((item) => (item.draftId ? [[item.draftId, item] as const] : [])),
  );
  const importByRecipe = new Map(
    imports.flatMap((item) => (item.savedRecipeId ? [[item.savedRecipeId, item] as const] : [])),
  );
  await Promise.all(
    recipes.map(async (recipe) => {
      const socialImport =
        importByRecipe.get(idOf(recipe)) ??
        (recipe.sourceDraftId ? importByDraft.get(recipe.sourceDraftId) : undefined);
      if (!socialImport) return;
      if (socialImport.thumbnailData?.length) {
        const illustration = {
          buffer: Buffer.from(socialImport.thumbnailData),
          contentType: socialImport.thumbnailContentType ?? 'image/jpeg',
        };
        const thumbnail = socialImport.thumbnailThumbnail?.length
          ? Buffer.from(socialImport.thumbnailThumbnail)
          : (await createIllustrationThumbnail(illustration)).buffer;
        recipe.illustrationData = illustration.buffer;
        recipe.illustrationContentType = illustration.contentType;
        recipe.illustrationThumbnail = thumbnail;
        recipe.illustrationStatus = 'complete';
        recipe.illustrationSource = 'imported';
        recipe.illustrationSourceVersion = importedIllustrationVersion;
        recipe.illustrationModel = undefined;
        recipe.illustrationUrl = undefined;
        if (socialImport.sourceUrl) recipe.sourceUrl = socialImport.sourceUrl;
        await recipe.save();
        return;
      }
      if (!socialImport.thumbnailUrl) return;
      recipe.illustrationUrl = socialImport.thumbnailUrl;
      recipe.illustrationStatus = 'complete';
      recipe.illustrationSource = 'imported';
      recipe.illustrationSourceVersion = importedIllustrationVersion;
      recipe.illustrationModel = undefined;
      recipe.illustrationData = undefined;
      recipe.illustrationContentType = undefined;
      recipe.illustrationThumbnail = undefined;
      if (socialImport.sourceUrl) recipe.sourceUrl = socialImport.sourceUrl;
      await recipe.save();
    }),
  );
  usersWithRepairedImportImages.add(user);
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
  const recipeYield = parseYieldFromMarkdown(recipe.documentMarkdown);
  const totalMinutes = recipe.recipe?.timing?.totalMinutes;

  return {
    _id: idOf(recipe),
    user: recipe.user,
    title,
    documentType: recipe.documentType ?? 'recipe',
    saveList: cleanSaveList(recipe.saveList),
    collections: [...(recipe.collections ?? [])],
    favorite: recipe.favorite ?? false,
    pinned: recipe.pinned ?? false,
    ...(recipe.lastCookedAt ? { lastCookedAt: iso(recipe.lastCookedAt) } : {}),
    ...(recipe.shortDescription?.trim()
      ? { shortDescription: truncateSentence(recipe.shortDescription) }
      : {}),
    ...(illustrationUrl ? { illustrationUrl } : {}),
    illustrationStatus: recipe.illustrationStatus ?? 'pending',
    ...(recipe.illustrationModel ? { illustrationModel: recipe.illustrationModel } : {}),
    ...(recipe.sourceConversationId ? { sourceConversationId: recipe.sourceConversationId } : {}),
    ...(recipe.sourceDraftId ? { sourceDraftId: recipe.sourceDraftId } : {}),
    ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
    ...(categorization ? { categorization } : {}),
    categorizationStatus: recipe.categorizationStatus,
    categorizationAttempts: recipe.categorizationAttempts ?? 0,
    categorizationVersion: recipe.categorizationVersion,
    ...(servings ? { servings } : {}),
    ...(recipeYield ? { yield: recipeYield } : {}),
    ...(totalMinutes ? { totalMinutes } : {}),
    createdAt: iso(recipe.createdAt),
    updatedAt: iso(recipe.updatedAt),
  };
}

function serializePublicRecipeSummary(
  recipe: ISavedRecipe,
  author: PublicRecipeAuthor,
): PublicRecipeSummary {
  const summary = serializeSavedRecipeSummary(recipe);
  return {
    _id: summary._id,
    title: summary.title,
    documentType: summary.documentType,
    ...(summary.shortDescription ? { shortDescription: summary.shortDescription } : {}),
    ...(summary.illustrationUrl
      ? { illustrationUrl: publicIllustrationMediaUrl(recipe, true) }
      : {}),
    illustrationStatus: summary.illustrationStatus,
    ...(summary.categorization ? { categorization: summary.categorization } : {}),
    ...(summary.servings ? { servings: summary.servings } : {}),
    ...(summary.yield ? { yield: summary.yield } : {}),
    updatedAt: summary.updatedAt,
    author,
  };
}

function publicAuthor(
  user: Pick<IUser, '_id' | 'name' | 'username' | 'avatar'>,
): PublicRecipeAuthor {
  const username = user.username?.trim();
  const name = user.name?.trim() || (username ? `@${username}` : 'Rekky cook');
  return {
    id: String(user._id),
    name,
    ...(username ? { username } : {}),
    ...(user.avatar ? { avatar: user.avatar } : {}),
  };
}

async function findPublicAuthor(viewer: string, owner: string): Promise<PublicRecipeAuthor | null> {
  if (viewer === owner) return null;
  const user = await userModel()
    .findOne({ _id: owner, publicProfile: true })
    .select('_id name username avatar');
  return user ? publicAuthor(user) : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanFilters(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function arrayFilter(values: string[]): string | { $in: string[] } | undefined {
  if (!values.length) return undefined;
  return values.length === 1 ? values[0] : { $in: values };
}

function textArrayFilter(values: string[]): RegExp | { $in: RegExp[] } | undefined {
  if (!values.length) return undefined;
  const expressions = values.map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i'));
  return expressions.length === 1 ? expressions[0] : { $in: expressions };
}

function booleanFilter(value: boolean | string | undefined): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function cleanSaveList(value: string | undefined): SavedRecipeList {
  return value === 'cooked_already' ? 'cooked_already' : 'want_to_cook';
}

function querySaveList(value: string | undefined): SavedRecipeList | undefined {
  return value === 'want_to_cook' || value === 'cooked_already' ? value : undefined;
}

function cleanCollections(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .map((value) => value.slice(0, 60)),
    ),
  ].slice(0, 20);
}

function listFilter(user: string, query: SavedRecipesQuery): RecipeListFilter {
  const filter: RecipeListFilter = { user };
  const documentTypes = arrayFilter(cleanFilters(query.documentType));
  if (documentTypes) filter.documentType = documentTypes;
  const saveList = querySaveList(query.saveList);
  if (saveList) {
    filter.saveList = saveList;
  }
  const collections = textArrayFilter(cleanFilters(query.collection));
  if (collections) filter.collections = collections;
  const favorite = booleanFilter(query.favorite);
  const pinned = booleanFilter(query.pinned);
  if (favorite !== undefined) filter.favorite = favorite;
  if (pinned !== undefined) filter.pinned = pinned;
  const q = query.q?.trim();
  if (q) {
    const expression = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { title: expression },
      { shortDescription: expression },
      { documentMarkdown: expression },
    ];
  }
  const cuisine = textArrayFilter(cleanFilters(query.cuisine));
  const mealType = textArrayFilter(cleanFilters(query.mealType));
  const diet = textArrayFilter(cleanFilters(query.diet));
  const difficulty = textArrayFilter(cleanFilters(query.difficulty));
  const timeBucket = textArrayFilter(cleanFilters(query.timeBucket));
  const mainIngredient = textArrayFilter(cleanFilters(query.mainIngredient));
  const equipment = textArrayFilter(cleanFilters(query.equipment));
  if (cuisine) {
    filter['categorization.cuisine'] = cuisine;
  }
  if (mealType) {
    filter['categorization.mealType'] = mealType;
  }
  if (diet) {
    filter['categorization.diet'] = diet;
  }
  if (difficulty) {
    filter['categorization.difficulty'] = difficulty;
  }
  if (timeBucket) {
    filter['categorization.timeBucket'] = timeBucket;
  }
  if (mainIngredient) {
    filter['categorization.mainIngredients'] = mainIngredient;
  }
  if (equipment) {
    filter['categorization.equipment'] = equipment;
  }
  return filter;
}

function listSort(sort: SavedRecipesQuery['sort']): Record<string, 1 | -1> {
  const leading = { pinned: -1 as const };
  if (sort === 'recently_saved') return { ...leading, createdAt: -1, _id: -1 };
  if (sort === 'recently_cooked') return { ...leading, lastCookedAt: -1, _id: -1 };
  if (sort === 'title') return { ...leading, title: 1, _id: 1 };
  if (sort === 'quickest') return { ...leading, 'recipe.timing.totalMinutes': 1, _id: 1 };
  return { ...leading, updatedAt: -1, _id: -1 };
}

const facetAliases = new Map([
  ['side dish', 'side'],
  ['vegan (optional)', 'vegan'],
  ['non vegetarian', 'non-vegetarian'],
]);
const excludedCuisineFacets = new Set(['artisan']);

function normalizedFacet(
  value: string,
  group: keyof SavedRecipeFacetsResponse,
): string | undefined {
  const clean = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean) return undefined;
  const normalized = facetAliases.get(clean) ?? clean;
  if (group === 'cuisine' && excludedCuisineFacets.has(normalized)) return undefined;
  return normalized;
}

function facetOptions(values: Map<string, number>): RecipeFacetOption[] {
  return [...values.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

type FacetRecipe = Pick<ISavedRecipe, 'documentType' | 'collections' | 'categorization'>;

export async function getRecipeFacets(
  user: string,
  query: Pick<SavedRecipesQuery, 'q' | 'saveList'> = {},
): Promise<SavedRecipeFacetsResponse> {
  const recipes = await model()
    .find(listFilter(user, query))
    .select('documentType collections categorization')
    .lean<FacetRecipe[]>();
  const maps = {
    documentType: new Map<string, number>(),
    cuisine: new Map<string, number>(),
    mealType: new Map<string, number>(),
    diet: new Map<string, number>(),
    difficulty: new Map<string, number>(),
    timeBucket: new Map<string, number>(),
    mainIngredient: new Map<string, number>(),
    equipment: new Map<string, number>(),
    collection: new Map<string, number>(),
  };
  const add = (group: keyof typeof maps, rawValues: Array<string | undefined>) => {
    const unique = new Set(
      rawValues
        .map((value) => (value ? normalizedFacet(value, group) : undefined))
        .filter((value): value is string => Boolean(value)),
    );
    for (const value of unique) maps[group].set(value, (maps[group].get(value) ?? 0) + 1);
  };
  for (const recipe of recipes) {
    add('documentType', [recipe.documentType]);
    add('collection', recipe.collections ?? []);
    add('cuisine', recipe.categorization?.cuisine ?? []);
    add('mealType', recipe.categorization?.mealType ?? []);
    add('diet', recipe.categorization?.diet ?? []);
    add('difficulty', [recipe.categorization?.difficulty]);
    add('timeBucket', [recipe.categorization?.timeBucket]);
    add('mainIngredient', recipe.categorization?.mainIngredients ?? []);
    add('equipment', recipe.categorization?.equipment ?? []);
  }
  return {
    total: recipes.length,
    documentType: facetOptions(maps.documentType),
    cuisine: facetOptions(maps.cuisine),
    mealType: facetOptions(maps.mealType),
    diet: facetOptions(maps.diet),
    difficulty: facetOptions(maps.difficulty),
    timeBucket: facetOptions(maps.timeBucket),
    mainIngredient: facetOptions(maps.mainIngredient),
    equipment: facetOptions(maps.equipment),
    collection: facetOptions(maps.collection),
  };
}

async function failStalePending(user: string): Promise<void> {
  const staleUpdatedAt = { $lt: new Date(Date.now() - pendingTimeoutMs) };
  await Promise.all([
    model().updateMany(
      {
        user,
        categorizationStatus: 'processing',
        updatedAt: staleUpdatedAt,
      },
      { $set: { categorizationStatus: 'pending' } },
    ),
    model().updateMany(
      {
        user,
        illustrationStatus: 'generating',
        updatedAt: staleUpdatedAt,
      },
      { $set: { illustrationStatus: 'pending' } },
    ),
    model().updateMany(
      { user, categorizationStatus: 'failed', categorizationAttempts: { $lt: 3 } },
      { $set: { categorizationStatus: 'pending' } },
    ),
  ]);
}

async function runCategorization(recipeId: string, version: number): Promise<void> {
  const Recipe = model();
  const recipe = await Recipe.findOneAndUpdate(
    { _id: recipeId, categorizationVersion: version, categorizationStatus: 'pending' },
    { $set: { categorizationStatus: 'processing' }, $inc: { categorizationAttempts: 1 } },
    { new: true },
  ).select('-illustrationUrl -illustrationData -illustrationThumbnail');
  if (!recipe) {
    return;
  }

  try {
    const { categorization, shortDescription } = await categorizeRecipe(
      serializeSavedRecipe(recipe),
    );
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version, categorizationStatus: 'processing' },
      { $set: { categorization, shortDescription, categorizationStatus: 'complete' } },
    );
  } catch {
    await Recipe.updateOne(
      { _id: recipeId, categorizationVersion: version, categorizationStatus: 'processing' },
      { $set: { categorizationStatus: 'failed' } },
    );
  }
}

function scheduleCategorization(recipeId: string, version: number): void {
  const jobKey = `${recipeId}:${version}`;
  if (activeCategorizationJobs.has(jobKey)) {
    return;
  }
  activeCategorizationJobs.add(jobKey);
  void runCategorization(recipeId, version).finally(() => {
    activeCategorizationJobs.delete(jobKey);
  });
}

function scheduleMissingCategorizations(recipes: ISavedRecipe[]): void {
  for (const recipe of recipes) {
    if (recipe.documentType !== 'recipe' || recipe.categorizationStatus !== 'pending') {
      continue;
    }
    scheduleCategorization(idOf(recipe), recipe.categorizationVersion);
  }
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
          illustrationSource: 'generated',
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

async function markExternalIllustrationFailed(recipe: ISavedRecipe): Promise<void> {
  await model().updateOne(
    { _id: recipe._id },
    {
      $set: { illustrationStatus: 'pending' },
      $unset: { illustrationUrl: 1 },
    },
  );
  scheduleIllustration(idOf(recipe), recipe.categorizationVersion);
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
  const socialIllustration = await socialImportIllustration(user, payload.sourceDraftId);
  const importedSocialThumbnail =
    socialIllustration.media ?? (await importExternalIllustration(socialIllustration.url));
  const title = cleanTitle(
    headingTitleFromMarkdown(documentMarkdown) ?? payload.title ?? recipe?.title,
    documentMarkdown,
  );
  const documentType = payload.documentType ?? 'recipe';
  const enrichRecipe = documentType === 'recipe';
  if (enrichRecipe && !recipe) {
    throw new CookingValidationError(
      'Recipe content requires structured ingredients and instructions.',
    );
  }
  if (enrichRecipe) {
    const issues = recipeCompletenessIssues(recipe);
    if (issues.length) {
      throw new CookingValidationError(`Recipe content is missing required ${issues.join(', ')}.`);
    }
  }
  let illustrationFields = {};
  if (importedSocialThumbnail) {
    illustrationFields = {
      illustrationData: importedSocialThumbnail.illustration.buffer,
      illustrationContentType: importedSocialThumbnail.illustration.contentType,
      illustrationThumbnail: importedSocialThumbnail.thumbnail.buffer,
      illustrationSource: 'imported',
      illustrationSourceVersion: importedIllustrationVersion,
    };
  } else if (socialIllustration.url) {
    illustrationFields = {
      illustrationUrl: socialIllustration.url,
      illustrationSource: 'imported',
      illustrationSourceVersion: importedIllustrationVersion,
    };
  }
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
    saveList: cleanSaveList(payload.saveList),
    collections: [],
    favorite: false,
    pinned: false,
    ...(recipe ? { recipe } : {}),
    ...(payload.sourceConversationId ? { sourceConversationId: payload.sourceConversationId } : {}),
    ...(payload.sourceDraftId ? { sourceDraftId: payload.sourceDraftId } : {}),
    ...(socialIllustration.sourceUrl ? { sourceUrl: socialIllustration.sourceUrl } : {}),
    ...illustrationFields,
    categorizationStatus: enrichRecipe ? 'pending' : 'complete',
    categorizationAttempts: 0,
    illustrationStatus: socialIllustration.url ? 'complete' : 'pending',
    categorizationVersion: 1,
  });
  if (enrichRecipe) {
    scheduleCategorization(idOf(saved), saved.categorizationVersion);
  }
  if (!socialIllustration.url) {
    scheduleIllustration(idOf(saved), saved.categorizationVersion);
  }
  await markSocialImportSavedRecipe(user, payload.sourceDraftId, idOf(saved));
  return serializeSavedRecipe(saved);
}
export async function getRecipe(user: string, recipeId: string): Promise<SavedRecipe | null> {
  await repairLegacyWrapperTitles(user);
  await repairLegacySaveLists(user);
  await repairLegacyImportedIllustrations(user);
  await repairLegacyRecipeStructures(user);
  await failStalePending(user);
  const recipe = await model()
    .findOne({ _id: recipeId, user })
    .select('-illustrationUrl -illustrationData -illustrationThumbnail');
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
    scheduleMissingCategorizations([recipe]);
  }
  if (!recipe) {
    return null;
  }
  const serialized = serializeSavedRecipe(recipe);
  if (recipe.sourceDraftId) {
    const socialImport = await socialImportModel()
      .findOne({ user, draftId: recipe.sourceDraftId })
      .select('sourceUrl')
      .lean<{ sourceUrl?: string }>();
    if (socialImport?.sourceUrl) {
      serialized.sourceUrl = socialImport.sourceUrl;
    }
  }
  return serialized;
}

export async function ownsRecipe(user: string, recipeId: string): Promise<boolean> {
  return Boolean(await model().exists({ _id: recipeId, user }));
}

export async function getRecipeByDraft(user: string, draftId: string): Promise<SavedRecipe | null> {
  await repairLegacyWrapperTitles(user);
  await repairLegacySaveLists(user);
  await repairLegacyImportedIllustrations(user);
  await repairLegacyRecipeStructures(user);
  await failStalePending(user);
  const recipe = await model()
    .findOne({ user, sourceDraftId: draftId })
    .select('-illustrationUrl -illustrationData -illustrationThumbnail')
    .sort({ updatedAt: -1 });
  if (recipe) {
    scheduleMissingIllustrations([recipe]);
    scheduleMissingCategorizations([recipe]);
  }
  if (!recipe) {
    return null;
  }
  const serialized = serializeSavedRecipe(recipe);
  if (recipe.sourceDraftId) {
    const socialImport = await socialImportModel()
      .findOne({ user, draftId: recipe.sourceDraftId })
      .select('sourceUrl')
      .lean<{ sourceUrl?: string }>();
    if (socialImport?.sourceUrl) {
      serialized.sourceUrl = socialImport.sourceUrl;
    }
  }
  return serialized;
}
export async function getRecipeIllustration(
  user: string,
  recipeId: string,
  thumbnail = false,
): Promise<IllustrationMedia | null> {
  const recipe = await model()
    .findOne({ _id: recipeId, user })
    .select(
      'illustrationUrl illustrationData illustrationContentType illustrationThumbnail categorizationVersion',
    );
  if (!recipe) {
    return null;
  }

  const illustration = storedIllustration(recipe);
  if (illustration) {
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

  const importedExternalIllustration = await importExternalIllustration(recipe.illustrationUrl);
  if (!importedExternalIllustration) {
    await markExternalIllustrationFailed(recipe);
    return null;
  }

  await model().updateOne(
    { _id: recipe._id },
    {
      $set: {
        illustrationData: importedExternalIllustration.illustration.buffer,
        illustrationContentType: importedExternalIllustration.illustration.contentType,
        illustrationThumbnail: importedExternalIllustration.thumbnail.buffer,
        illustrationStatus: 'complete',
      },
      $unset: { illustrationUrl: 1 },
    },
    { timestamps: false },
  );

  return thumbnail
    ? importedExternalIllustration.thumbnail
    : importedExternalIllustration.illustration;
}

export async function listPublicRecipes(
  viewer: string,
  requestedLimit = 8,
): Promise<PublicRecipesResponse> {
  const limit = Math.min(Math.max(Number(requestedLimit) || 8, 1), 20);
  const users = await userModel()
    .find({ _id: { $ne: viewer }, publicProfile: true })
    .select('_id name username avatar')
    .limit(100);
  const authors = new Map(users.map((user) => [String(user._id), publicAuthor(user)]));
  if (!authors.size) return { recipes: [] };

  const recipes = await model()
    .find({ user: { $in: [...authors.keys()] }, documentType: 'recipe' })
    .select(
      [
        'user',
        'title',
        'documentType',
        'shortDescription',
        'illustrationUrl',
        'illustrationStatus',
        'categorization',
        'categorizationStatus',
        'categorizationVersion',
        'recipe.title',
        'recipe.servings',
        'documentMarkdown',
        'saveList',
        'createdAt',
        'updatedAt',
      ].join(' '),
    )
    .sort({ updatedAt: -1 })
    .limit(limit);

  return {
    recipes: recipes.flatMap((recipe) => {
      const author = authors.get(recipe.user);
      return author ? [serializePublicRecipeSummary(recipe, author)] : [];
    }),
  };
}

export async function getPublicRecipe(
  viewer: string,
  recipeId: string,
): Promise<PublicRecipe | null> {
  const recipe = await model()
    .findById(recipeId)
    .select('-illustrationUrl -illustrationData -illustrationThumbnail');
  if (!recipe) return null;
  const author = await findPublicAuthor(viewer, recipe.user);
  if (!author) return null;
  const summary = serializePublicRecipeSummary(recipe, author);
  const serialized = serializeSavedRecipe(recipe);
  return {
    ...summary,
    documentMarkdown: serialized.documentMarkdown,
    ...(serialized.recipe ? { recipe: serialized.recipe } : {}),
  };
}

export async function getPublicRecipeIllustration(
  viewer: string,
  recipeId: string,
  thumbnail = false,
): Promise<IllustrationMedia | null> {
  const recipe = await model().findById(recipeId).select('user');
  if (!recipe || !(await findPublicAuthor(viewer, recipe.user))) return null;
  return getRecipeIllustration(recipe.user, recipeId, thumbnail);
}

export async function listRecipes(
  user: string,
  query: SavedRecipesQuery,
): Promise<SavedRecipesResponse> {
  await reconcileRecipeDeletions(user);
  await repairLegacyWrapperTitles(user);
  await repairLegacySaveLists(user);
  await repairLegacyImportedIllustrations(user);
  await repairLegacyRecipeStructures(user);
  await failStalePending(user);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), maxLimit);
  const sort = query.sort ?? 'recently_updated';
  const offset = Number(query.cursor?.replace(/^offset:/, '')) || 0;
  const Recipe = model();
  const [recipes, total] = await Promise.all([
    Recipe.find(listFilter(user, query))
      .select(
        [
          'user',
          'title',
          'documentType',
          'shortDescription',
          'illustrationUrl',
          'illustrationStatus',
          'illustrationModel',
          'sourceConversationId',
          'sourceDraftId',
          'sourceUrl',
          'collections',
          'favorite',
          'pinned',
          'lastCookedAt',
          'categorization',
          'categorizationStatus',
          'categorizationVersion',
          'recipe.title',
          'recipe.servings',
          'recipe.timing.totalMinutes',
          'documentMarkdown',
          'saveList',
          'createdAt',
          'updatedAt',
        ].join(' '),
      )
      .sort(listSort(sort))
      .skip(offset)
      .limit(limit + 1),
    Recipe.countDocuments(listFilter(user, query)),
  ]);
  scheduleMissingIllustrations(recipes);
  scheduleMissingCategorizations(recipes);
  const pageRecipes = recipes.slice(0, limit);
  const page = pageRecipes.map(serializeSavedRecipeSummary);
  const legacyDraftIds = pageRecipes.flatMap((recipe) =>
    !recipe.sourceUrl && recipe.sourceDraftId ? [recipe.sourceDraftId] : [],
  );
  if (legacyDraftIds.length) {
    const imports = await socialImportModel()
      .find({ user, draftId: { $in: legacyDraftIds } })
      .select('draftId sourceUrl')
      .lean<Array<{ draftId?: string; sourceUrl?: string }>>();
    const sourceByDraft = new Map(
      imports.flatMap((item) =>
        item.draftId && item.sourceUrl ? [[item.draftId, item.sourceUrl] as const] : [],
      ),
    );
    for (const recipe of page) {
      if (!recipe.sourceUrl && recipe.sourceDraftId) {
        recipe.sourceUrl = sourceByDraft.get(recipe.sourceDraftId);
      }
    }
  }
  const next = recipes.length > limit ? recipes[limit - 1] : undefined;
  const nextCursor = next ? `offset:${offset + limit}` : undefined;
  return {
    recipes: page,
    total,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

export async function listOfflineRecipes(
  user: string,
  query: Pick<SavedRecipesQuery, 'cursor' | 'limit'> & { since?: string; until?: string } = {},
): Promise<OfflineRecipesResponse> {
  await reconcileRecipeDeletions(user);
  await repairLegacyWrapperTitles(user);
  await repairLegacySaveLists(user);
  await repairLegacyImportedIllustrations(user);
  await repairLegacyRecipeStructures(user);
  await failStalePending(user);
  const limit = Math.min(Math.max(Number(query.limit) || maxLimit, 1), 100);
  const filter: RecipeListFilter = { user };
  const sinceValue = typeof query.since === 'string' ? query.since : undefined;
  const since = sinceValue ? new Date(sinceValue) : undefined;
  const requestedUntil = query.until ? new Date(query.until) : undefined;
  const until =
    requestedUntil && !Number.isNaN(requestedUntil.getTime()) ? requestedUntil : new Date();
  filter.updatedAt = { $lte: until };
  if (since && !Number.isNaN(since.getTime())) filter.updatedAt.$gt = since;
  const cursor = parseTimestampCursor(query.cursor);
  let pageFilter: FilterQuery<ISavedRecipe> = filter;
  if (cursor?.id && mongoose.isValidObjectId(cursor.id)) {
    pageFilter = {
      $and: [
        filter,
        {
          $or: [
            { updatedAt: { $lt: cursor.timestamp } },
            {
              _id: { $lt: new mongoose.Types.ObjectId(cursor.id) },
              updatedAt: cursor.timestamp,
            },
          ],
        },
      ],
    };
  } else if (cursor) {
    pageFilter = { ...filter, updatedAt: { ...filter.updatedAt, $lt: cursor.timestamp } };
  }
  const recipes = await model()
    .find(pageFilter)
    .select('-illustrationData')
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1);
  scheduleMissingIllustrations(recipes);
  scheduleMissingCategorizations(recipes);
  const page = recipes.slice(0, limit);
  const next = recipes.length > limit ? recipes[limit - 1] : undefined;
  const nextCursor = next?.updatedAt
    ? encodeTimestampCursor(next.updatedAt, idOf(next))
    : undefined;
  const deletedIds =
    since && !Number.isNaN(since.getTime())
      ? ((await mongoose.models.RecipeTombstone.find({
          user,
          state: { $ne: 'pending' },
          deletedAt: { $gt: since, $lte: until },
        }).distinct('recipeId')) as string[])
      : [];
  return {
    deletedIds,
    recipes: page.map((recipe) => serializeSavedRecipe(recipe)),
    syncedAt: iso(until),
    ...(nextCursor ? { nextCursor } : {}),
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

  const contentChanged =
    payload.title != null ||
    payload.documentType != null ||
    payload.shortDescription != null ||
    payload.documentMarkdown != null ||
    payload.recipe != null;
  const previousSaveList = cleanSaveList(existing.saveList);
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
  if (contentChanged && existing.documentType === 'recipe' && !recipe) {
    throw new CookingValidationError(
      'Recipe content requires structured ingredients and instructions.',
    );
  }
  if (contentChanged && existing.documentType === 'recipe') {
    const issues = recipeCompletenessIssues(recipe);
    if (issues.length) {
      throw new CookingValidationError(`Recipe content is missing required ${issues.join(', ')}.`);
    }
  }
  existing.saveList = cleanSaveList(payload.saveList ?? existing.saveList);
  existing.collections =
    payload.collections == null ? existing.collections : cleanCollections(payload.collections);
  existing.favorite = payload.favorite ?? existing.favorite ?? false;
  existing.pinned = payload.pinned ?? existing.pinned ?? false;
  if (payload.personalNotes != null) {
    existing.personalNotes = payload.personalNotes.trim().slice(0, 5000);
  }
  if (payload.workspaceState) {
    existing.workspaceState = {
      servings: Math.max(1, Math.round(payload.workspaceState.servings)),
      unitMode: payload.workspaceState.unitMode,
      checkedIngredientIds: [...new Set(payload.workspaceState.checkedIngredientIds)].slice(0, 500),
      timers: payload.workspaceState.timers.slice(0, 20).map((timer) => ({
        id: timer.id.trim().slice(0, 200),
        label: timer.label.trim().slice(0, 200),
        remaining: Math.max(0, Math.round(timer.remaining)),
        running: timer.running,
        ...(timer.endsAt != null ? { endsAt: timer.endsAt } : {}),
      })),
      updatedAt: new Date().toISOString(),
    };
  }
  if (existing.saveList === 'cooked_already' && previousSaveList !== 'cooked_already') {
    existing.lastCookedAt = new Date();
  }
  if (contentChanged) {
    existing.shortDescription = cleanShortDescription(
      payload.shortDescription,
      existing.title,
      documentMarkdown,
      recipe,
    );
  }
  existing.documentMarkdown = documentMarkdown;
  if (recipe) {
    existing.recipe = recipe;
  }
  if (contentChanged) existing.categorization = undefined;
  const enrichRecipe = existing.documentType === 'recipe';
  if (contentChanged) existing.categorizationStatus = enrichRecipe ? 'pending' : 'complete';
  if (contentChanged) existing.categorizationAttempts = 0;
  if (contentChanged && shouldRegenerateIllustration) {
    existing.illustrationUrl = '';
    existing.illustrationData = undefined;
    existing.illustrationContentType = undefined;
    existing.illustrationThumbnail = undefined;
    existing.illustrationStatus = 'pending';
    existing.illustrationModel = undefined;
    existing.illustrationSource = undefined;
    existing.illustrationSourceVersion = undefined;
  }
  if (contentChanged) existing.categorizationVersion += 1;
  await existing.save();
  if (contentChanged && enrichRecipe) {
    scheduleCategorization(idOf(existing), existing.categorizationVersion);
  }
  if (contentChanged && shouldRegenerateIllustration) {
    scheduleIllustration(idOf(existing), existing.categorizationVersion);
  }
  return serializeSavedRecipe(existing);
}

export async function deleteSavedRecipe(user: string, recipeId: string): Promise<boolean> {
  const exists = await model().exists({ _id: recipeId, user });
  if (!exists) return false;
  await mongoose.models.RecipeTombstone.updateOne(
    { recipeId, user },
    { $set: { deletedAt: new Date(), state: 'pending' } },
    { upsert: true },
  );
  await reconcileRecipeDeletions(user);
  return true;
}

export { CookingValidationError };
