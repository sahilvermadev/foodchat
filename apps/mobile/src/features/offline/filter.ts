import type { RecipeFilters, RecipeSummary } from '../recipes/types';

const includes = (values: string[] | undefined, expected: string | undefined) => {
  const terms =
    expected
      ?.split(',')
      .map((value) => value.toLowerCase())
      .filter(Boolean) ?? [];
  return (
    !terms.length || terms.some((term) => values?.some((value) => value.toLowerCase() === term))
  );
};

export const matchesOfflineRecipe = (
  recipe: RecipeSummary,
  filters: RecipeFilters,
  markdown = '',
) => {
  if (!includes([recipe.documentType], filters.documentType)) return false;
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
  if (
    !includes(
      recipe.categorization?.timeBucket ? [recipe.categorization.timeBucket] : [],
      filters.timeBucket,
    )
  )
    return false;
  const query = filters.q?.trim().toLowerCase();
  if (!query) return true;
  const searchable = [
    recipe.title,
    recipe.shortDescription,
    ...(recipe.categorization?.cuisine ?? []),
    ...(recipe.categorization?.diet ?? []),
    ...(recipe.categorization?.mainIngredients ?? []),
    markdown,
  ]
    .join(' ')
    .toLowerCase();
  return query.split(/\s+/).every((term) => searchable.includes(term));
};

export const sortOfflineRecipes = (recipes: RecipeSummary[], sort: RecipeFilters['sort']) =>
  [...recipes].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (sort === 'title') return left.title.localeCompare(right.title);
    if (sort === 'quickest') {
      return (
        (left.totalMinutes ?? Number.MAX_SAFE_INTEGER) -
        (right.totalMinutes ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (sort === 'recently_cooked') {
      return (right.lastCookedAt ?? '').localeCompare(left.lastCookedAt ?? '');
    }
    if (sort === 'recently_saved') {
      return (right.createdAt ?? right.updatedAt).localeCompare(left.createdAt ?? left.updatedAt);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
