import type { RecipeDetail, RecipeFilters, RecipeSummary, RecipesResponse } from '../recipes/types';
import { offlineDatabase, writeLastSync } from './database';

type RecipeRow = { detail_json: string | null; summary_json: string };

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
});

const includes = (values: string[] | undefined, expected: string | undefined) => {
  const terms =
    expected
      ?.split(',')
      .map((value) => value.toLowerCase())
      .filter(Boolean) ?? [];
  return (
    !terms.length || terms.every((term) => values?.some((value) => value.toLowerCase() === term))
  );
};

const matchesFilters = (recipe: RecipeSummary, filters: RecipeFilters) => {
  if (filters.documentType && recipe.documentType !== filters.documentType) return false;
  if (filters.saveList && recipe.saveList !== filters.saveList) return false;
  if (!includes(recipe.collections, filters.collection)) return false;
  if (filters.favorite === 'true' && !recipe.favorite) return false;
  if (filters.pinned === 'true' && !recipe.pinned) return false;
  if (!includes(recipe.categorization?.cuisine, filters.cuisine)) return false;
  if (!includes(recipe.categorization?.diet, filters.diet)) return false;
  if (!includes(recipe.categorization?.mealType, filters.mealType)) return false;
  if (!includes(recipe.categorization?.mainIngredients, filters.mainIngredient)) return false;
  if (!includes(recipe.categorization?.equipment, filters.equipment)) return false;
  if (
    !includes(
      recipe.categorization?.difficulty ? [recipe.categorization.difficulty] : [],
      filters.difficulty,
    )
  )
    return false;
  if (filters.timeBucket && recipe.categorization?.timeBucket !== filters.timeBucket) return false;
  const query = filters.q?.trim().toLowerCase();
  if (!query) return true;
  const searchable = [
    recipe.title,
    recipe.shortDescription,
    ...(recipe.categorization?.cuisine ?? []),
    ...(recipe.categorization?.diet ?? []),
    ...(recipe.categorization?.mainIngredients ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return query.split(/\s+/).every((term) => searchable.includes(term));
};

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
  const recipes = rows
    .map((row) => JSON.parse(row.summary_json) as RecipeSummary)
    .filter((recipe) => matchesFilters(recipe, filters));
  return { recipes, total: recipes.length };
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
