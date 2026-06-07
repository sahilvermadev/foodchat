import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
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
  SavedRecipeList,
  SavedRecipeSummary,
  SavedRecipesQuery,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useDeleteSavedRecipeMutation,
  useRecipesInfiniteQuery,
  useRecipesQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { ProtectedImage } from '~/components/ui';

type FilterKey =
  | 'documentType'
  | 'cuisine'
  | 'mealType'
  | 'diet'
  | 'timeBucket'
  | 'mainIngredient'
  | 'equipment';
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
];
const filterLabelKeys: Record<FilterKey, TranslationKeys> = {
  documentType: 'com_recipes_filter_document_type',
  cuisine: 'com_recipes_filter_cuisine',
  mealType: 'com_recipes_filter_meal_type',
  diet: 'com_recipes_filter_diet',
  timeBucket: 'com_recipes_filter_time_bucket',
  mainIngredient: 'com_recipes_filter_main_ingredient',
  equipment: 'com_recipes_filter_equipment',
};
const recipeSkeletonItems = [0, 1, 2, 3, 4, 5];

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn('rounded-md bg-surface-hover', className)} />;
}

function RecipeCardSkeleton() {
  return (
    <div className="border-border-light/60 bg-surface-primary/80 overflow-hidden rounded-lg border shadow-none">
      <div className="relative aspect-[2.08/1] overflow-hidden bg-surface-hover">
        <SkeletonBlock className="h-full w-full rounded-none" />
      </div>
      <div className="flex min-h-[188px] flex-col p-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <SkeletonBlock className="h-7 w-4/5" />
          </div>
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
        <div className="mt-5 flex gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full bg-surface-primary-alt" />
          <SkeletonBlock className="h-8 w-20 rounded-full bg-surface-primary-alt" />
        </div>
        <div className="mt-auto flex gap-1.5 pt-4">
          <SkeletonBlock className="h-8 w-20 rounded-full" />
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function RecipeLibrarySkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid animate-pulse auto-rows-[minmax(0,auto)] gap-6 lg:grid-cols-2 2xl:grid-cols-3"
    >
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

function activeFilters(filters: Record<string, string>): ActiveFilter[] {
  return filterKeys.flatMap((key) => {
    const value = filters[key];
    return value ? [{ key, labelKey: filterLabelKeys[key], value }] : [];
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

function recipeDescription(recipe: SavedRecipeSummary): string {
  const description = recipe.shortDescription?.trim();
  const title = recipe.title.toLowerCase();

  if (!description || description.toLowerCase() === title) {
    return '';
  }

  return description;
}

export default function RecipeLibrary() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [query, setQuery] = useState('');
  const [saveListFilter, setSaveListFilter] = useState<SaveListFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [recipeToDelete, setRecipeToDelete] = useState<SavedRecipeSummary | null>(null);
  const params = useMemo<SavedRecipesQuery>(
    () => ({
      q: query,
      documentType: filters.documentType as SavedRecipesQuery['documentType'],
      cuisine: filters.cuisine,
      mealType: filters.mealType,
      diet: filters.diet,
      timeBucket: filters.timeBucket as RecipeTimeBucket | undefined,
      mainIngredient: filters.mainIngredient,
      equipment: filters.equipment,
      ...(saveListFilter !== 'all' ? { saveList: saveListFilter } : {}),
      limit: 30,
    }),
    [filters, query, saveListFilter],
  );
  const recipesQuery = useRecipesInfiniteQuery(params, {
    refetchInterval: (data) =>
      data?.pages.some((page) =>
        page.recipes.some(
          (recipe) =>
            recipe.categorizationStatus === 'pending' ||
            recipe.illustrationStatus === 'pending' ||
            recipe.illustrationStatus === 'generating',
        ),
      )
        ? 3000
        : false,
  });
  const filterOptionsQuery = useRecipesQuery({ q: query, limit: 100 });
  const recipes = useMemo(
    () => recipesQuery.data?.pages.flatMap((page) => page.recipes) ?? [],
    [recipesQuery.data?.pages],
  );
  const total = recipesQuery.data?.pages[0]?.total ?? recipes.length;
  const filterOptionRecipes = filterOptionsQuery.data?.recipes ?? recipes;
  const groups = useMemo(() => filterGroups(filterOptionRecipes), [filterOptionRecipes]);
  const selectedFilters = useMemo(() => activeFilters(filters), [filters]);
  const deleteRecipe = useDeleteSavedRecipeMutation();

  const setFilter = (key: FilterKey, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key] === value ? '' : value,
    }));
  };

  const hasFilters = selectedFilters.length > 0;
  const clearFilters = () => setFilters({});
  const removeFilter = (key: FilterKey) =>
    setFilters((current) => ({
      ...current,
      [key]: '',
    }));
  const confirmDelete = () => {
    if (!recipeToDelete || deleteRecipe.isLoading) {
      return;
    }

    deleteRecipe.mutate(recipeToDelete, {
      onSuccess: () => {
        showToast({ status: 'success', message: localize('com_recipes_delete_success') });
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
    <main className="rekky-ui h-full overflow-y-auto bg-surface-primary-alt px-5 py-8 text-text-primary sm:px-8 sm:py-7 lg:px-14">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 sm:gap-7">
        <header className="pt-1 sm:pt-4">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-[2.45rem] font-medium leading-[0.95] tracking-[-0.04em] text-text-primary sm:text-[clamp(2.75rem,5vw,3.45rem)] sm:tracking-[-0.03em]">
                {localize('com_recipes_library')}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-text-secondary sm:mt-4">
                <p className="rekky-body hidden sm:block">
                  {localize('com_recipes_library_subtitle')}
                </p>
                {recipesQuery.isLoading ? (
                  <SkeletonBlock className="h-4 w-24" />
                ) : (
                  <span className="text-text-secondary/90 text-sm font-medium sm:border-l sm:border-border-light sm:pl-3">
                    {recipeCountLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex max-w-[1260px] gap-2 sm:mt-7 sm:gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary sm:left-4"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={localize('com_recipes_search_placeholder_short')}
                aria-label={localize('com_recipes_search_placeholder')}
                className="rekky-library-search-input border-border-light/70 min-h-11 rounded-lg pl-10 text-[0.92rem] shadow-none focus-visible:ring-1 focus-visible:ring-ring-primary sm:min-h-12 sm:pl-11 sm:text-[0.95rem]"
              />
            </div>
            <button
              type="button"
              aria-label={localize('com_recipes_filters')}
              className="border-border-light/70 bg-surface-primary/70 relative inline-flex min-h-11 w-12 shrink-0 items-center justify-center gap-2 rounded-lg border px-0 text-sm text-text-primary transition-colors hover:border-border-heavy hover:bg-surface-hover sm:min-h-12 sm:w-auto sm:px-5"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{localize('com_recipes_filters')}</span>
              {selectedFilters.length > 0 ? (
                <span className="absolute ml-6 mt-[-1.5rem] rounded-full bg-surface-submit px-1.5 py-0.5 text-[0.65rem] leading-none text-white sm:static sm:ml-0 sm:mt-0 sm:px-2 sm:text-xs">
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface-primary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  onClick={() => removeFilter(filter.key)}
                >
                  <span>
                    {localize(filter.labelKey)}: {displayFilter(filter.value)}
                  </span>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                onClick={clearFilters}
              >
                {localize('com_recipes_clear_filters')}
              </button>
            </div>
          ) : null}
          <div
            className="-mx-5 mt-4 flex flex-nowrap gap-2 overflow-x-auto px-5 sm:mx-0 sm:mt-5 sm:flex-wrap sm:px-0"
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
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors sm:py-2',
                    active
                      ? 'border-surface-submit bg-surface-submit text-white'
                      : 'border-border-light bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  )}
                  onClick={() => setSaveListFilter(value)}
                >
                  {localize(saveListLabelKey(value))}
                </button>
              );
            })}
          </div>
        </header>

        {filtersOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label={localize('com_recipes_close_filters')}
              className="absolute inset-0 bg-black/40"
              onClick={() => setFiltersOpen(false)}
            />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border-light bg-surface-primary text-text-primary shadow-2xl">
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
                            const active = filters[group.key] === value;
                            return (
                              <button
                                key={`${group.key}:${value}`}
                                type="button"
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-xs capitalize transition-colors',
                                  active
                                    ? 'border-surface-submit bg-surface-submit text-white'
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
                  className="rounded-lg bg-surface-submit px-4 py-2 text-sm font-medium text-white hover:bg-surface-submit-hover"
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
            <div className="grid auto-rows-[minmax(0,auto)] gap-4 sm:gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {recipes.map((recipe) => {
                const description = recipeDescription(recipe);
                const servings = recipe.servings;
                const recipeChips = chips(recipe);
                const visibleRecipeChips = recipeChips.slice(0, 2);
                const hiddenRecipeChipCount = recipeChips.length - visibleRecipeChips.length;

                return (
                  <article
                    key={recipe._id}
                    className="border-border-light/50 bg-surface-primary/75 sm:border-border-light/60 sm:bg-surface-primary/80 group relative overflow-hidden rounded-lg border shadow-none transition-colors hover:border-border-medium hover:bg-surface-primary"
                  >
                    <Link
                      to={`/recipes/${recipe._id}`}
                      aria-label={localize('com_recipes_open_recipe', { 0: recipe.title })}
                      className="absolute inset-0 z-0"
                    />
                    <div className="pointer-events-none relative aspect-[2.45/1] overflow-hidden bg-surface-hover sm:aspect-[2.08/1]">
                      {recipe.illustrationUrl ? (
                        <ProtectedImage
                          src={recipe.illustrationUrl}
                          alt=""
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
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
                      <div className="from-surface-primary/35 absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent" />
                    </div>
                    <div className="pointer-events-none relative flex min-h-[164px] flex-col p-5 sm:min-h-[188px] sm:p-6">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <h2 className="line-clamp-2 pr-2 text-[1.35rem] font-medium leading-[1.05] tracking-[-0.025em] text-text-primary sm:text-[1.45rem] sm:leading-[1.08] sm:tracking-[-0.02em]">
                          {recipe.title}
                        </h2>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={localize('com_recipes_recipe_actions', {
                                0: recipe.title,
                              })}
                              className="text-text-secondary/70 pointer-events-auto relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-75 transition hover:bg-surface-hover hover:text-text-primary hover:opacity-100 focus-visible:bg-surface-hover focus-visible:text-text-primary focus-visible:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="pointer-events-auto z-50 min-w-44"
                          >
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
                      <div className="text-text-secondary/80 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] font-semibold uppercase tracking-[0.13em] sm:mt-4 sm:text-xs">
                        <span>{displayFilter(recipe.documentType)}</span>
                        <span className="text-text-tertiary" aria-hidden="true">
                          /
                        </span>
                        <span>{localize(saveListLabelKey(recipeSaveList(recipe)))}</span>
                      </div>
                      {recipe.categorizationStatus === 'pending' ? (
                        <span className="text-text-secondary/80 mt-2 text-xs font-medium">
                          {localize('com_recipes_categorizing')}
                        </span>
                      ) : null}
                      {description ? (
                        <p className="mt-3 line-clamp-2 max-w-[31rem] text-[0.93rem] leading-6 text-text-secondary sm:mt-4 sm:text-[0.96rem] sm:leading-7">
                          {description}
                        </p>
                      ) : null}
                      <div className="mt-auto flex min-h-[2.7rem] flex-col justify-end gap-2 pt-4 sm:min-h-[3.4rem] sm:gap-3 sm:pt-5">
                        <div className="text-text-secondary/90 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-[0.09em]">
                          {recipe.documentType === 'recipe' &&
                          typeof servings === 'number' &&
                          servings > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5" aria-hidden="true" />
                              {localize('com_cooking_servings_count', { 0: String(servings) })}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {visibleRecipeChips.map((chip) => (
                            <span
                              key={chip}
                              className="text-text-secondary/75 text-xs font-semibold uppercase tracking-[0.1em]"
                            >
                              {displayFilter(chip)}
                            </span>
                          ))}
                          {hiddenRecipeChipCount > 0 ? (
                            <span className="text-text-secondary/75 text-xs font-semibold uppercase tracking-[0.1em]">
                              +{hiddenRecipeChipCount}
                            </span>
                          ) : null}
                          {recipeChips.length === 0 && recipe.categorizationStatus === 'failed' ? (
                            <span className="text-text-secondary/75 text-xs font-semibold uppercase tracking-[0.1em]">
                              {localize('com_recipes_saved')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              <Link
                to="/cook"
                className="flex min-h-[218px] items-center justify-center rounded-lg border border-dashed border-border-medium bg-surface-primary p-8 text-center transition-colors hover:border-surface-submit hover:bg-surface-primary-alt"
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
              className="flex h-10 items-center justify-center gap-2 rounded-lg border-none bg-surface-destructive px-4 py-2 text-sm text-white transition-colors hover:bg-surface-destructive-hover disabled:cursor-not-allowed disabled:opacity-70"
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
