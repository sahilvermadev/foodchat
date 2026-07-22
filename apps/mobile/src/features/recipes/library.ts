import type { RecipeFilters, RecipeSummary } from './types';

export type AdvancedFilterKey =
  | 'documentType'
  | 'cuisine'
  | 'mealType'
  | 'diet'
  | 'timeBucket'
  | 'mainIngredient'
  | 'equipment';
export type AdvancedFilters = Partial<Record<AdvancedFilterKey, string>>;
export type SaveListFilter = 'all' | 'want_to_cook' | 'cooked_already';
export type LibraryState = 'empty' | 'no_matches' | 'results';

export type FilterGroup = {
  key: AdvancedFilterKey;
  labelKey:
    | 'library.documentType'
    | 'library.cuisine'
    | 'library.mealType'
    | 'library.diet'
    | 'library.timeBucket'
    | 'library.mainIngredient'
    | 'library.equipment';
  values: string[];
};

export const saveListFilters = [
  { id: 'all', key: 'library.allSaved' },
  { id: 'want_to_cook', key: 'library.wantToCook' },
  { id: 'cooked_already', key: 'library.cookedAlready' },
] as const;

const unique = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));

const values = (value?: string[]) => value ?? [];

export function buildFilterGroups(recipes: RecipeSummary[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      key: 'documentType',
      labelKey: 'library.documentType',
      values: unique(recipes.map((recipe) => recipe.documentType)),
    },
    {
      key: 'cuisine',
      labelKey: 'library.cuisine',
      values: unique(recipes.flatMap((recipe) => values(recipe.categorization?.cuisine))),
    },
    {
      key: 'mealType',
      labelKey: 'library.mealType',
      values: unique(recipes.flatMap((recipe) => values(recipe.categorization?.mealType))),
    },
    {
      key: 'diet',
      labelKey: 'library.diet',
      values: unique(recipes.flatMap((recipe) => values(recipe.categorization?.diet))),
    },
    {
      key: 'timeBucket',
      labelKey: 'library.timeBucket',
      values: unique(recipes.map((recipe) => recipe.categorization?.timeBucket ?? '')),
    },
    {
      key: 'mainIngredient',
      labelKey: 'library.mainIngredient',
      values: unique(
        recipes.flatMap((recipe) => values(recipe.categorization?.mainIngredients)),
      ).slice(0, 10),
    },
    {
      key: 'equipment',
      labelKey: 'library.equipment',
      values: unique(recipes.flatMap((recipe) => values(recipe.categorization?.equipment))).slice(
        0,
        10,
      ),
    },
  ];
  return groups.filter((group) => group.values.length > 0);
}

export function displayFilter(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildLibraryFilters(
  search: string,
  saveList: SaveListFilter,
  filters: AdvancedFilters,
): RecipeFilters {
  const q = search.trim();
  return {
    ...(q ? { q } : {}),
    ...(saveList !== 'all' ? { saveList } : {}),
    ...(filters.documentType
      ? { documentType: filters.documentType as RecipeFilters['documentType'] }
      : {}),
    ...(filters.cuisine ? { cuisine: filters.cuisine } : {}),
    ...(filters.mealType ? { mealType: filters.mealType } : {}),
    ...(filters.diet ? { diet: filters.diet } : {}),
    ...(filters.timeBucket ? { timeBucket: filters.timeBucket } : {}),
    ...(filters.mainIngredient ? { mainIngredient: filters.mainIngredient } : {}),
    ...(filters.equipment ? { equipment: filters.equipment } : {}),
  };
}

export function getLibraryState({
  hasActiveQuery,
  recipeCount,
}: {
  hasActiveQuery: boolean;
  recipeCount: number;
}): LibraryState {
  if (recipeCount > 0) return 'results';
  return hasActiveQuery ? 'no_matches' : 'empty';
}
