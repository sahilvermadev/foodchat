import type { RecipeFacets, RecipeFacetOption, RecipeFilters, RecipeSort } from './types';
import type { TranslationKey } from '@/lib/i18n';

export type AdvancedFilterKey =
  | 'documentType'
  | 'collection'
  | 'cuisine'
  | 'mealType'
  | 'diet'
  | 'difficulty'
  | 'timeBucket'
  | 'mainIngredient'
  | 'equipment';
export type AdvancedFilters = Partial<Record<AdvancedFilterKey, string[]>>;
export type SaveListFilter = 'all' | 'want_to_cook' | 'cooked_already';
export type LibraryState = 'empty' | 'no_matches' | 'results';

export type FilterGroup = {
  key: AdvancedFilterKey;
  labelKey:
    | 'library.documentType'
    | 'library.collection'
    | 'library.cuisine'
    | 'library.mealType'
    | 'library.diet'
    | 'library.difficulty'
    | 'library.timeBucket'
    | 'library.mainIngredient'
    | 'library.equipment';
  values: RecipeFacetOption[];
};

export const saveListFilters = [
  { id: 'all', key: 'library.allSaved' },
  { id: 'want_to_cook', key: 'library.wantToCook' },
  { id: 'cooked_already', key: 'library.cookedAlready' },
] as const;

export const recipeSorts: Array<{ id: RecipeSort; key: TranslationKey }> = [
  { id: 'recently_updated', key: 'library.sortRecentlyUpdated' },
  { id: 'recently_saved', key: 'library.sortRecentlySaved' },
  { id: 'recently_cooked', key: 'library.sortRecentlyCooked' },
  { id: 'title', key: 'library.sortTitle' },
  { id: 'quickest', key: 'library.sortQuickest' },
];

export function buildFilterGroups(facets?: RecipeFacets): FilterGroup[] {
  if (!facets) return [];
  const groups: FilterGroup[] = [
    { key: 'collection', labelKey: 'library.collection', values: facets.collection },
    { key: 'documentType', labelKey: 'library.documentType', values: facets.documentType },
    { key: 'cuisine', labelKey: 'library.cuisine', values: facets.cuisine },
    { key: 'mealType', labelKey: 'library.mealType', values: facets.mealType },
    { key: 'diet', labelKey: 'library.diet', values: facets.diet },
    { key: 'difficulty', labelKey: 'library.difficulty', values: facets.difficulty },
    { key: 'timeBucket', labelKey: 'library.timeBucket', values: facets.timeBucket },
    { key: 'mainIngredient', labelKey: 'library.mainIngredient', values: facets.mainIngredient },
    { key: 'equipment', labelKey: 'library.equipment', values: facets.equipment },
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
  sort: RecipeSort = 'recently_updated',
  favorite = false,
  pinned = false,
): RecipeFilters {
  const q = search.trim();
  const joined = (key: AdvancedFilterKey) => filters[key]?.join(',');
  return {
    ...(q ? { q } : {}),
    ...(saveList !== 'all' ? { saveList } : {}),
    ...(joined('documentType')
      ? { documentType: joined('documentType') as RecipeFilters['documentType'] }
      : {}),
    ...(joined('collection') ? { collection: joined('collection') } : {}),
    ...(joined('cuisine') ? { cuisine: joined('cuisine') } : {}),
    ...(joined('mealType') ? { mealType: joined('mealType') } : {}),
    ...(joined('diet') ? { diet: joined('diet') } : {}),
    ...(joined('difficulty') ? { difficulty: joined('difficulty') } : {}),
    ...(joined('timeBucket') ? { timeBucket: joined('timeBucket') } : {}),
    ...(joined('mainIngredient') ? { mainIngredient: joined('mainIngredient') } : {}),
    ...(joined('equipment') ? { equipment: joined('equipment') } : {}),
    ...(favorite ? { favorite: 'true' } : {}),
    ...(pinned ? { pinned: 'true' } : {}),
    sort,
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
