import type {
  RecipeDetail,
  RecipeFacets,
  RecipeFacetOption,
  RecipeFilters,
  RecipeSummary,
  RecipeUpdate,
  RecipesResponse,
} from '../recipes/types';
import { offlineDatabase, writeLastSync } from './database';
import { matchesOfflineRecipe, sortOfflineRecipes } from './filter';

export type OfflineRecipeMutation =
  | { id: string; type: 'update'; recipeId: string; patch: RecipeUpdate }
  | { id: string; type: 'delete'; recipeId: string };

type RecipeRow = { detail_json: string | null; summary_json: string };
type MutationRow = { mutation_id: string; payload_json: string };

const summaryFromDetail = (detail: RecipeDetail): RecipeSummary => ({
  _id: detail._id,
  categorization: detail.categorization,
  documentType: detail.documentType,
  illustrationStatus: detail.illustrationStatus,
  illustrationUrl:
    detail.illustrationUrl && !detail.illustrationUrl.includes('variant=')
      ? `${detail.illustrationUrl}${detail.illustrationUrl.includes('?') ? '&' : '?'}variant=thumbnail`
      : detail.illustrationUrl,
  saveList: detail.saveList,
  collections: detail.collections ?? [],
  favorite: detail.favorite ?? false,
  pinned: detail.pinned ?? false,
  lastCookedAt: detail.lastCookedAt,
  sourceUrl: detail.sourceUrl,
  totalMinutes: detail.recipe?.timing.totalMinutes ?? detail.totalMinutes,
  yield: detail.yield,
  servings: detail.recipe?.servings ?? detail.servings,
  shortDescription: detail.shortDescription,
  title: detail.title,
  updatedAt: detail.updatedAt,
  createdAt: detail.createdAt,
});

export async function replaceOfflineRecipes(
  userId: string,
  recipes: RecipeDetail[],
  syncedAt: string,
) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM offline_recipes WHERE user_id = ?', userId);
    for (const recipe of recipes) {
      await transaction.runAsync(
        `INSERT INTO offline_recipes
          (user_id, recipe_id, summary_json, detail_json, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        userId,
        recipe._id,
        JSON.stringify(summaryFromDetail(recipe)),
        JSON.stringify(recipe),
        recipe.updatedAt,
      );
    }
  });
  await writeLastSync(userId, 'recipes', syncedAt);
}

export async function cacheOfflineRecipe(userId: string, recipe: RecipeDetail) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_recipes
      (user_id, recipe_id, summary_json, detail_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, recipe_id) DO UPDATE SET
       summary_json = excluded.summary_json,
       detail_json = excluded.detail_json,
       updated_at = excluded.updated_at`,
    userId,
    recipe._id,
    JSON.stringify(summaryFromDetail(recipe)),
    JSON.stringify(recipe),
    recipe.updatedAt,
  );
}

export async function cacheOfflineRecipeSummaries(userId: string, recipes: RecipeSummary[]) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const recipe of recipes) {
      await transaction.runAsync(
        `INSERT INTO offline_recipes
          (user_id, recipe_id, summary_json, detail_json, updated_at)
         VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT(user_id, recipe_id) DO UPDATE SET
           summary_json = excluded.summary_json,
           updated_at = excluded.updated_at`,
        userId,
        recipe._id,
        JSON.stringify(recipe),
        recipe.updatedAt,
      );
    }
  });
}

export async function mergeOfflineRecipes(
  userId: string,
  recipes: RecipeDetail[],
  deletedIds: string[],
  syncedAt: string,
) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const recipeId of deletedIds) {
      await transaction.runAsync(
        'DELETE FROM offline_recipes WHERE user_id = ? AND recipe_id = ?',
        userId,
        recipeId,
      );
    }
    for (const recipe of recipes) {
      await transaction.runAsync(
        `INSERT INTO offline_recipes
          (user_id, recipe_id, summary_json, detail_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, recipe_id) DO UPDATE SET
           summary_json = excluded.summary_json,
           detail_json = excluded.detail_json,
           updated_at = excluded.updated_at`,
        userId,
        recipe._id,
        JSON.stringify(summaryFromDetail(recipe)),
        JSON.stringify(recipe),
        recipe.updatedAt,
      );
    }
  });
  await writeLastSync(userId, 'recipes', syncedAt);
}

export async function deleteOfflineRecipe(userId: string, recipeId: string) {
  const db = await offlineDatabase();
  await db.runAsync(
    'DELETE FROM offline_recipes WHERE user_id = ? AND recipe_id = ?',
    userId,
    recipeId,
  );
}

export async function listOfflineRecipes(
  userId: string,
  filters: RecipeFilters,
): Promise<RecipesResponse> {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<RecipeRow>(
    `SELECT summary_json, detail_json FROM offline_recipes
     WHERE user_id = ? ORDER BY updated_at DESC`,
    userId,
  );
  const recipes = sortOfflineRecipes(
    rows.flatMap((row) => {
      const recipe = JSON.parse(row.summary_json) as RecipeSummary;
      const markdown = row.detail_json
        ? (JSON.parse(row.detail_json) as RecipeDetail).documentMarkdown
        : '';
      return matchesOfflineRecipe(recipe, filters, markdown) ? [recipe] : [];
    }),
    filters.sort,
  );
  return { recipes, total: recipes.length };
}

const facet = (values: string[]): RecipeFacetOption[] => {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return [...counts]
    .map(([value, count]) => ({ count, value }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

export async function getOfflineRecipeFacets(
  userId: string,
  filters: Pick<RecipeFilters, 'q' | 'saveList'>,
): Promise<RecipeFacets> {
  const { recipes } = await listOfflineRecipes(userId, filters);
  return {
    collection: facet(recipes.flatMap((recipe) => recipe.collections)),
    cuisine: facet(recipes.flatMap((recipe) => recipe.categorization?.cuisine ?? [])),
    diet: facet(recipes.flatMap((recipe) => recipe.categorization?.diet ?? [])),
    difficulty: facet(recipes.flatMap((recipe) => recipe.categorization?.difficulty ?? [])),
    documentType: facet(recipes.map((recipe) => recipe.documentType)),
    equipment: facet(recipes.flatMap((recipe) => recipe.categorization?.equipment ?? [])),
    mainIngredient: facet(
      recipes.flatMap((recipe) => recipe.categorization?.mainIngredients ?? []),
    ),
    mealType: facet(recipes.flatMap((recipe) => recipe.categorization?.mealType ?? [])),
    timeBucket: facet(recipes.flatMap((recipe) => recipe.categorization?.timeBucket ?? [])),
    total: recipes.length,
  };
}

export async function getOfflineRecipe(userId: string, recipeId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<RecipeRow>(
    `SELECT summary_json, detail_json FROM offline_recipes
     WHERE user_id = ? AND recipe_id = ?`,
    userId,
    recipeId,
  );
  if (!row?.detail_json) return null;
  return JSON.parse(row.detail_json) as RecipeDetail;
}

export async function queueOfflineRecipeMutation(userId: string, mutation: OfflineRecipeMutation) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO offline_recipe_mutations
      (mutation_id, user_id, payload_json, created_at) VALUES (?, ?, ?, ?)`,
    mutation.id,
    userId,
    JSON.stringify(mutation),
    new Date().toISOString(),
  );
}

export async function listOfflineRecipeMutations(userId: string) {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<MutationRow>(
    `SELECT mutation_id, payload_json FROM offline_recipe_mutations
     WHERE user_id = ? ORDER BY created_at ASC`,
    userId,
  );
  return rows.map((row) => JSON.parse(row.payload_json) as OfflineRecipeMutation);
}

export async function deleteOfflineRecipeMutation(mutationId: string) {
  const db = await offlineDatabase();
  await db.runAsync('DELETE FROM offline_recipe_mutations WHERE mutation_id = ?', mutationId);
}

export async function failOfflineRecipeMutation(mutationId: string, error: string) {
  const db = await offlineDatabase();
  await db.runAsync(
    `UPDATE offline_recipe_mutations SET attempts = attempts + 1, last_error = ?
     WHERE mutation_id = ?`,
    error.slice(0, 500),
    mutationId,
  );
}
