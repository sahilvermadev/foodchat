import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  OGDialog,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type {
  RecipeTimeBucket,
  SavedRecipeFacetsResponse,
  SavedRecipeList,
  SavedRecipeSummary,
  SavedRecipesQuery,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useDeleteSavedRecipeMutation,
  useRecipeFacetsQuery,
  useRecipesInfiniteQuery,
  useUpdateSavedRecipeMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { ProtectedImage } from '~/components/ui';
import {
  collectionCard,
  collectionCardBody,
  collectionCardMedia,
  collectionCardTitle,
  collectionGrid,
  collectionMobileHeader,
  collectionPageContent,
  collectionPageScroll,
  collectionPageTitle,
  collectionSecondaryAction,
} from './collection';
import { isRecipeCategorizationActive } from './library';

type FilterKey =
  | 'documentType'
  | 'cuisine'
  | 'mealType'
  | 'diet'
  | 'timeBucket'
  | 'mainIngredient'
  | 'equipment'
  | 'difficulty'
  | 'collection';
type FilterGroup = {
  key: FilterKey;
  labelKey: TranslationKeys;
  values: string[];
};
type ActiveFilter = {
  key: FilterKey;
  labelKey: TranslationKeys;
  value: string;
};
type SaveListFilter = SavedRecipeList | 'all';

const saveListFilters: SaveListFilter[] = ['all', 'want_to_cook', 'cooked_already'];
const filterKeys: FilterKey[] = [
  'documentType',
  'cuisine',
  'mealType',
  'diet',
  'timeBucket',
  'mainIngredient',
  'equipment',
  'difficulty',
  'collection',
];
const filterLabelKeys: Record<FilterKey, TranslationKeys> = {
  documentType: 'com_recipes_filter_document_type',
  cuisine: 'com_recipes_filter_cuisine',
  mealType: 'com_recipes_filter_meal_type',
  diet: 'com_recipes_filter_diet',
  timeBucket: 'com_recipes_filter_time_bucket',
  mainIngredient: 'com_recipes_filter_main_ingredient',
  equipment: 'com_recipes_filter_equipment',
  difficulty: 'com_recipes_filter_difficulty',
  collection: 'com_recipes_filter_collection',
};
const recipeSkeletonItems = [0, 1, 2, 3, 4, 5];

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn('rounded-md bg-surface-hover', className)} />;
}

function RecipeCardSkeleton() {
  return (
    <div className="overflow-hidden">
      <div className="relative aspect-[3/2] overflow-hidden rounded-card bg-surface-hover">
        <SkeletonBlock className="h-full w-full rounded-card" />
      </div>
      <div className="px-1 py-3">
        <SkeletonBlock className="h-3 w-24 rounded-full" />
        <SkeletonBlock className="mt-3 h-5 w-4/5" />
        <SkeletonBlock className="mt-2 h-4 w-2/3" />
      </div>
    </div>
  );
}

function RecipeLibrarySkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className={cn(collectionGrid, 'animate-pulse')}>
      <span className="sr-only">{label}</span>
      {recipeSkeletonItems.map((item) => (
        <RecipeCardSkeleton key={item} />
      ))}
    </div>
  );
}

function arrayChips(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function chips(recipe: SavedRecipeSummary): string[] {
  const categorization = recipe.categorization;
  if (!categorization) {
    return [];
  }
  return [
    ...arrayChips(categorization.cuisine),
    ...arrayChips(categorization.mealType),
    categorization.difficulty ?? '',
  ]
    .filter(Boolean)
    .slice(0, 3);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filterGroups(recipes: SavedRecipeSummary[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      key: 'documentType',
      labelKey: filterLabelKeys.documentType,
      values: unique(recipes.map((recipe) => recipe.documentType)),
    },
    {
      key: 'cuisine',
      labelKey: filterLabelKeys.cuisine,
      values: unique(recipes.flatMap((recipe) => arrayChips(recipe.categorization?.cuisine))),
    },
    {
      key: 'mealType',
      labelKey: filterLabelKeys.mealType,
      values: unique(recipes.flatMap((recipe) => arrayChips(recipe.categorization?.mealType))),
    },
    {
      key: 'diet',
      labelKey: filterLabelKeys.diet,
      values: unique(recipes.flatMap((recipe) => arrayChips(recipe.categorization?.diet))),
    },
    {
      key: 'timeBucket',
      labelKey: filterLabelKeys.timeBucket,
      values: unique(recipes.map((recipe) => recipe.categorization?.timeBucket ?? '')),
    },
    {
      key: 'mainIngredient',
      labelKey: filterLabelKeys.mainIngredient,
      values: unique(
        recipes.flatMap((recipe) => arrayChips(recipe.categorization?.mainIngredients)),
      ).slice(0, 10),
    },
    {
      key: 'equipment',
      labelKey: filterLabelKeys.equipment,
      values: unique(
        recipes.flatMap((recipe) => arrayChips(recipe.categorization?.equipment)),
      ).slice(0, 10),
    },
  ];
  return groups.filter((group) => group.values.length > 0);
}

function facetFilterGroups(facets?: SavedRecipeFacetsResponse): FilterGroup[] {
  if (!facets) return [];
  const values = (key: keyof SavedRecipeFacetsResponse) => {
    const facet = facets[key];
    return Array.isArray(facet)
      ? facet
          .map((option) =>
            typeof option === 'object' && option && 'value' in option ? String(option.value) : '',
          )
          .filter(Boolean)
      : [];
  };
  return filterKeys
    .map((key) => ({ key, labelKey: filterLabelKeys[key], values: values(key) }))
    .filter((group) => group.values.length > 0);
}

function activeFilters(filters: Record<string, string[]>): ActiveFilter[] {
  return filterKeys.flatMap((key) => {
    return (filters[key] ?? []).map((value) => ({
      key,
      labelKey: filterLabelKeys[key],
      value,
    }));
  });
}

function displayFilter(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function saveListLabelKey(value: SaveListFilter): TranslationKeys {
  if (value === 'want_to_cook') {
    return 'com_recipes_save_list_want_to_cook';
  }
  if (value === 'cooked_already') {
    return 'com_recipes_save_list_cooked_already';
  }
  return 'com_recipes_save_list_all';
}

function recipeSaveList(recipe: SavedRecipeSummary): SavedRecipeList {
  return recipe.saveList ?? 'want_to_cook';
}

export default function RecipeLibrary() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [query, setQuery] = useState('');
  const [saveListFilter, setSaveListFilter] = useState<SaveListFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sort, setSort] = useState<SavedRecipesQuery['sort']>('recently_updated');
  const [recipeToDelete, setRecipeToDelete] = useState<SavedRecipeSummary | null>(null);
  const params = useMemo<SavedRecipesQuery>(
    () => ({
      q: query,
      documentType: filters.documentType?.join(',') as SavedRecipesQuery['documentType'],
      cuisine: filters.cuisine?.join(','),
      mealType: filters.mealType?.join(','),
      diet: filters.diet?.join(','),
      timeBucket: filters.timeBucket?.join(',') as RecipeTimeBucket | undefined,
      mainIngredient: filters.mainIngredient?.join(','),
      equipment: filters.equipment?.join(','),
      difficulty: filters.difficulty?.join(','),
      collection: filters.collection?.join(','),
      ...(saveListFilter !== 'all' ? { saveList: saveListFilter } : {}),
      ...(favoriteOnly ? { favorite: true } : {}),
      ...(pinnedOnly ? { pinned: true } : {}),
      sort,
      limit: 30,
    }),
    [favoriteOnly, filters, pinnedOnly, query, saveListFilter, sort],
  );
  const recipesQuery = useRecipesInfiniteQuery(params, {
    refetchInterval: (data) =>
      data?.pages.some((page) =>
        page.recipes.some(
          (recipe) =>
            isRecipeCategorizationActive(recipe.categorizationStatus) ||
            recipe.illustrationStatus === 'pending' ||
            recipe.illustrationStatus === 'generating',
        ),
      )
        ? 3000
        : false,
  });
  const facetsQuery = useRecipeFacetsQuery({
    q: query,
    ...(saveListFilter !== 'all' ? { saveList: saveListFilter } : {}),
  });
  const recipes = useMemo(
    () => recipesQuery.data?.pages.flatMap((page) => page.recipes) ?? [],
    [recipesQuery.data?.pages],
  );
  const total = recipesQuery.data?.pages[0]?.total ?? recipes.length;
  const groups = useMemo(() => {
    const facetGroups = facetFilterGroups(facetsQuery.data);
    return facetGroups.length ? facetGroups : filterGroups(recipes);
  }, [facetsQuery.data, recipes]);
  const selectedFilters = useMemo(() => activeFilters(filters), [filters]);
  const deleteRecipe = useDeleteSavedRecipeMutation();
  const updateRecipe = useUpdateSavedRecipeMutation();

  const setFilter = (key: FilterKey, value: string) => {
    setFilters((current) => {
      const values = current[key] ?? [];
      return {
        ...current,
        [key]: values.includes(value)
          ? values.filter((currentValue) => currentValue !== value)
          : [...values, value],
      };
    });
  };

  const hasFilters = selectedFilters.length > 0;
  const clearFilters = () => setFilters({});
  const removeFilter = (key: FilterKey, value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((currentValue) => currentValue !== value),
    }));
  const confirmDelete = () => {
    if (!recipeToDelete || deleteRecipe.isLoading) {
      return;
    }

    deleteRecipe.mutate(recipeToDelete, {
      onSuccess: () => {
        setRecipeToDelete(null);
      },
      onError: () => {
        showToast({ status: 'error', message: localize('com_recipes_delete_error') });
      },
    });
  };
  const recipeCountLabel =
    total === 1
      ? localize('com_recipes_count_short_one')
      : localize('com_recipes_count_short_other', { count: total });

  return (
    <main
      className="rekky-ui flex h-full min-h-0 flex-col bg-surface-primary-alt text-text-primary"
      data-testid="recipes-page"
      aria-busy={recipesQuery.isLoading}
    >
      {/* Mobile Top Header Navbar */}
      <div className={collectionMobileHeader}>
        <span className="text-[1.05rem] font-medium tracking-[-0.04em] text-text-primary">
          {localize('com_recipes_library')}
        </span>
      </div>

      <div className={collectionPageScroll}>
        <div className={collectionPageContent}>
          <header className="pt-1">
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 id="recipe-library-title" className={collectionPageTitle}>
                {localize('com_recipes_library')}
              </h1>
              {recipesQuery.isLoading ? (
                <SkeletonBlock className="hidden h-4 w-24 sm:block" />
              ) : (
                <span className="hidden text-sm font-normal text-text-secondary sm:block">
                  {recipeCountLabel}
                </span>
              )}
            </div>
            <p className="mt-2 hidden text-sm text-text-secondary sm:block">
              {localize('com_recipes_library_subtitle')}
            </p>
            <div className="mt-4 flex gap-2.5 sm:mt-5">
              <div className="relative min-w-0 flex-1 md:max-w-[480px]">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary sm:left-4"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={localize('com_recipes_search_placeholder_short')}
                  aria-label={localize('com_recipes_search_placeholder')}
                  className="rekky-library-search-input h-11 rounded-control border-border-light bg-surface-primary pl-10 text-sm shadow-surface transition-colors hover:border-border-medium focus-visible:ring-2 focus-visible:ring-ring-primary"
                />
              </div>
              <button
                type="button"
                aria-label={localize('com_recipes_filters')}
                className={cn(collectionSecondaryAction, 'relative')}
                onClick={() => setFiltersOpen(true)}
              >
                <ListFilter className="h-4 w-4" aria-hidden="true" />
                <span>{localize('com_recipes_filters')}</span>
                {selectedFilters.length > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-surface-submit px-1.5 py-0.5 text-[10px] font-bold leading-none text-text-submit">
                    {selectedFilters.length}
                  </span>
                ) : null}
              </button>
            </div>
            {selectedFilters.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rekky-meta text-text-secondary">
                  {localize('com_recipes_active_filters')}
                </span>
                {selectedFilters.map((filter) => (
                  <button
                    key={`${filter.key}:${filter.value}`}
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-hover px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                    onClick={() => removeFilter(filter.key, filter.value)}
                  >
                    <span>
                      {localize(filter.labelKey)}: {displayFilter(filter.value)}
                    </span>
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs text-text-secondary hover:text-text-primary"
                  onClick={clearFilters}
                >
                  {localize('com_recipes_clear_filters')}
                </button>
              </div>
            ) : null}
            <div
              className="no-scrollbar -mx-4 mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-border-light px-4 pb-3 pt-1 sm:mx-0 sm:flex-wrap sm:pl-0 sm:pr-1"
              role="tablist"
              aria-label={localize('com_recipes_save_list_filter_label')}
            >
              {saveListFilters.map((value) => {
                const active = saveListFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      'h-11 shrink-0 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                      active
                        ? 'bg-surface-submit/10 border-transparent text-surface-submit'
                        : 'border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                    )}
                    onClick={() => setSaveListFilter(value)}
                  >
                    {localize(saveListLabelKey(value))}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={favoriteOnly}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  favoriteOnly
                    ? 'bg-surface-submit/10 border-transparent text-surface-submit'
                    : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
                onClick={() => setFavoriteOnly((value) => !value)}
              >
                <Heart className="size-3.5" aria-hidden="true" />
                {localize('com_recipes_favorites')}
              </button>
              <button
                type="button"
                aria-pressed={pinnedOnly}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  pinnedOnly
                    ? 'bg-surface-submit/10 border-transparent text-surface-submit'
                    : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
                onClick={() => setPinnedOnly((value) => !value)}
              >
                <Pin className="size-3.5" aria-hidden="true" />
                {localize('com_recipes_pinned')}
              </button>
              <label className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 text-xs text-text-secondary">
                {localize('com_recipes_sort')}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SavedRecipesQuery['sort'])}
                  className="rekky-select h-11 rounded-control border border-border-light bg-surface-primary px-3 text-xs text-text-primary shadow-surface transition-colors hover:border-border-medium hover:bg-surface-hover active:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <option value="recently_updated">
                    {localize('com_recipes_sort_recently_updated')}
                  </option>
                  <option value="recently_saved">
                    {localize('com_recipes_sort_recently_saved')}
                  </option>
                  <option value="recently_cooked">
                    {localize('com_recipes_sort_recently_cooked')}
                  </option>
                  <option value="title">{localize('com_recipes_sort_title')}</option>
                  <option value="quickest">{localize('com_recipes_sort_quickest')}</option>
                </select>
              </label>
            </div>
          </header>

          {filtersOpen ? (
            <div className="fixed inset-0 z-modal">
              <button
                type="button"
                aria-label={localize('com_recipes_close_filters')}
                className="absolute inset-0 bg-black/40"
                onClick={() => setFiltersOpen(false)}
              />
              <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border-light bg-surface-primary text-text-primary shadow-dialog">
                <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold">{localize('com_recipes_filters')}</h2>
                    <p className="text-xs text-text-secondary">
                      {localize('com_recipes_filter_hint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={localize('com_recipes_close_filters')}
                    className="rounded-lg p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    onClick={() => setFiltersOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {groups.length > 0 ? (
                    <div className="flex flex-col gap-6">
                      {groups.map((group) => (
                        <section key={group.key} className="flex flex-col gap-3">
                          <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                            {localize(group.labelKey)}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {group.values.map((value) => {
                              const active = (filters[group.key] ?? []).includes(value);
                              return (
                                <button
                                  key={`${group.key}:${value}`}
                                  type="button"
                                  className={cn(
                                    'rounded-full border px-3 py-1.5 text-xs capitalize transition-colors',
                                    active
                                      ? 'border-surface-submit bg-surface-submit text-text-submit'
                                      : 'border-border-light bg-surface-primary-alt text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                                  )}
                                  onClick={() => setFilter(group.key, value)}
                                >
                                  {displayFilter(value)}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {localize('com_recipes_no_filters')}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border-light px-5 py-4">
                  <button
                    type="button"
                    className="text-sm text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasFilters}
                    onClick={clearFilters}
                  >
                    {localize('com_recipes_clear_filters')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-surface-submit px-4 py-2 text-sm font-medium text-text-submit hover:bg-surface-submit-hover"
                    onClick={() => setFiltersOpen(false)}
                  >
                    {localize('com_ui_done')}
                  </button>
                </div>
              </aside>
            </div>
          ) : null}

          {recipesQuery.isLoading ? (
            <RecipeLibrarySkeleton label={localize('com_ui_loading')} />
          ) : null}
          {!recipesQuery.isLoading && recipes.length === 0 ? (
            <div className="rounded-lg border border-border-light bg-surface-primary p-8 text-sm text-text-secondary shadow-[0_4px_20px_-2px_rgba(26,25,23,0.04)]">
              {localize('com_recipes_empty')}
            </div>
          ) : null}
          {!recipesQuery.isLoading && recipes.length > 0 ? (
            <>
              <div className={collectionGrid}>
                {recipes.map((recipe) => {
                  const servings = recipe.servings;
                  const recipeChips = chips(recipe);
                  const visibleRecipeChips = recipeChips.slice(0, 2);
                  const hiddenRecipeChipCount = recipeChips.length - visibleRecipeChips.length;

                  return (
                    <article key={recipe._id} className={collectionCard}>
                      <Link
                        to={`/recipes/${recipe._id}`}
                        aria-label={localize('com_recipes_open_recipe', { 0: recipe.title })}
                        className="absolute inset-0 z-base rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                      />
                      <div
                        className={cn(collectionCardMedia, 'pointer-events-none')}
                        data-testid="recipe-library-media"
                      >
                        {recipe.illustrationUrl ? (
                          <ProtectedImage
                            src={recipe.illustrationUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            fallback={
                              <div className="h-full w-full animate-pulse bg-surface-hover" />
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-surface-hover">
                            {recipe.illustrationStatus === 'pending' ||
                            recipe.illustrationStatus === 'generating' ? (
                              <div className="bg-surface-primary/50 h-10 w-10 rounded-full border border-border-heavy" />
                            ) : null}
                          </div>
                        )}
                        <div className="pointer-events-auto absolute right-3 top-3 z-raised">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={localize('com_recipes_recipe_actions', {
                                  0: recipe.title,
                                })}
                                className="rekky-progressive-action flex size-8 items-center justify-center rounded-full bg-overlay text-status-ink shadow-surface backdrop-blur-md transition-colors hover:bg-surface-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="pointer-events-auto z-dropdown min-w-44 shadow-floating"
                            >
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() =>
                                  updateRecipe.mutate({
                                    recipeId: recipe._id,
                                    payload: { favorite: !recipe.favorite },
                                  })
                                }
                              >
                                <Heart className="size-4" aria-hidden="true" />
                                {localize(
                                  recipe.favorite
                                    ? 'com_recipes_remove_favorite'
                                    : 'com_recipes_add_favorite',
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() =>
                                  updateRecipe.mutate({
                                    recipeId: recipe._id,
                                    payload: { pinned: !recipe.pinned },
                                  })
                                }
                              >
                                <Pin className="size-4" aria-hidden="true" />
                                {localize(recipe.pinned ? 'com_recipes_unpin' : 'com_recipes_pin')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                className="cursor-pointer"
                                onSelect={() => setRecipeToDelete(recipe)}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                                {localize('com_recipes_delete_recipe')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className={cn(collectionCardBody, 'pointer-events-none')}>
                        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-text-secondary">
                          <span>{displayFilter(recipe.documentType)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{localize(saveListLabelKey(recipeSaveList(recipe)))}</span>
                        </div>
                        <h2 className={cn(collectionCardTitle, 'mt-2')}>{recipe.title}</h2>
                        {isRecipeCategorizationActive(recipe.categorizationStatus) ? (
                          <span className="mt-2 text-xs font-medium text-text-secondary">
                            {localize('com_recipes_categorizing')}
                          </span>
                        ) : null}
                        <div className="mt-auto flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-text-secondary">
                          {recipe.documentType === 'recipe' &&
                          typeof servings === 'number' &&
                          servings > 0 ? (
                            <span>
                              {localize('com_cooking_servings_count', { 0: String(servings) })}
                            </span>
                          ) : null}
                          {typeof servings === 'number' &&
                          servings > 0 &&
                          recipeChips.length > 0 ? (
                            <span aria-hidden="true">·</span>
                          ) : null}
                          {visibleRecipeChips.map((chip) => (
                            <span key={chip}>{displayFilter(chip)}</span>
                          ))}
                          {hiddenRecipeChipCount > 0 ? <span>+{hiddenRecipeChipCount}</span> : null}
                          {recipeChips.length === 0 && recipe.categorizationStatus === 'failed' ? (
                            <span>{localize('com_recipes_saved')}</span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
                <Link
                  to="/cook"
                  className="flex aspect-[3/2] min-h-[218px] items-center justify-center rounded-card border border-dashed border-border-medium p-8 text-center transition-colors hover:border-surface-submit hover:bg-surface-hover"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-surface-submit text-surface-submit">
                      <Plus className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="rekky-section-title text-surface-submit">
                        {localize('com_recipes_add_new')}
                      </p>
                      <p className="rekky-body mt-2 max-w-60 text-sm leading-6 text-text-secondary">
                        {localize('com_recipes_add_new_hint')}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
              {recipesQuery.hasNextPage ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="rounded-lg border border-border-light bg-surface-primary px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={recipesQuery.isFetchingNextPage}
                    onClick={() => void recipesQuery.fetchNextPage()}
                  >
                    {localize(
                      recipesQuery.isFetchingNextPage
                        ? 'com_recipes_loading_more'
                        : 'com_recipes_load_more',
                    )}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <OGDialog
        open={recipeToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteRecipe.isLoading) {
            setRecipeToDelete(null);
          }
        }}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_recipes_delete_recipe')}
          className="max-w-[450px]"
          main={
            <p className="text-left text-sm text-text-primary">
              {localize('com_recipes_delete_confirm', { 0: recipeToDelete?.title ?? '' })}
            </p>
          }
          selection={
            <button
              type="button"
              disabled={deleteRecipe.isLoading}
              className="flex h-10 items-center justify-center gap-2 rounded-control border-none bg-surface-destructive px-4 py-2 text-sm text-status-ink transition-colors hover:bg-surface-destructive-hover disabled:cursor-not-allowed disabled:opacity-70"
              onClick={confirmDelete}
            >
              {deleteRecipe.isLoading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {localize('com_ui_delete')}
            </button>
          }
        />
      </OGDialog>
    </main>
  );
}
