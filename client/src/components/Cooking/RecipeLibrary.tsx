import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListFilter, MoreHorizontal, Plus, Search, Users, X } from 'lucide-react';
import { Input } from '@librechat/client';
import type { RecipeTimeBucket, SavedRecipe, SavedRecipesQuery } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useRecipesQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { recipeDisplayTitle } from './recipe';

type FilterKey = 'cuisine' | 'mealType' | 'diet' | 'timeBucket' | 'mainIngredient' | 'equipment';
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
const filterKeys: FilterKey[] = [
  'cuisine',
  'mealType',
  'diet',
  'timeBucket',
  'mainIngredient',
  'equipment',
];
const filterLabelKeys: Record<FilterKey, TranslationKeys> = {
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
    <div className="overflow-hidden rounded-lg border border-border-light bg-surface-primary shadow-[0_4px_20px_-2px_rgba(26,25,23,0.04)]">
      <div className="relative aspect-[1.92/1] overflow-hidden bg-surface-hover">
        <SkeletonBlock className="h-full w-full rounded-none" />
        <SkeletonBlock className="bg-surface-primary/80 absolute right-4 top-4 h-9 w-20 rounded-full" />
      </div>
      <div className="flex min-h-[178px] flex-col p-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <SkeletonBlock className="h-7 w-4/5" />
            <SkeletonBlock className="h-7 w-3/5" />
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
      className="grid animate-pulse auto-rows-[minmax(0,auto)] gap-5 lg:grid-cols-2 2xl:grid-cols-3"
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

function chips(recipe: SavedRecipe): string[] {
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

function filterGroups(recipes: SavedRecipe[]): FilterGroup[] {
  const groups: FilterGroup[] = [
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

function formatRecipeDate(value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function recipeDescription(recipe: SavedRecipe): string {
  const description = recipe.shortDescription?.trim() || recipe.recipe?.description?.trim();
  const title = recipeDisplayTitle(recipe).toLowerCase();

  if (!description || description.toLowerCase() === title) {
    return '';
  }

  return description;
}

export default function RecipeLibrary() {
  const localize = useLocalize();
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const params = useMemo<SavedRecipesQuery>(
    () => ({
      q: query,
      cuisine: filters.cuisine,
      mealType: filters.mealType,
      diet: filters.diet,
      timeBucket: filters.timeBucket as RecipeTimeBucket | undefined,
      mainIngredient: filters.mainIngredient,
      equipment: filters.equipment,
      limit: 30,
    }),
    [filters, query],
  );
  const recipesQuery = useRecipesQuery(params, {
    refetchInterval: (data) =>
      data?.recipes.some(
        (recipe) =>
          recipe.categorizationStatus === 'pending' || recipe.illustrationStatus === 'pending',
      )
        ? 3000
        : false,
  });
  const filterOptionsQuery = useRecipesQuery({ q: query, limit: 100 });
  const recipes = recipesQuery.data?.recipes ?? [];
  const filterOptionRecipes = filterOptionsQuery.data?.recipes ?? recipes;
  const groups = useMemo(() => filterGroups(filterOptionRecipes), [filterOptionRecipes]);
  const selectedFilters = useMemo(() => activeFilters(filters), [filters]);

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
  const recipeCountLabel =
    recipes.length === 1
      ? localize('com_recipes_count_short_one')
      : localize('com_recipes_count_short_other', { count: recipes.length });

  return (
    <main className="h-full overflow-y-auto bg-surface-primary-alt px-4 py-8 text-text-primary sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-7">
        <header className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-serif text-6xl font-normal leading-none tracking-normal text-text-primary sm:text-7xl">
                {localize('com_recipes_library')}
              </h1>
              <p className="mt-5 text-base text-text-secondary">
                {localize('com_recipes_library_subtitle')}
              </p>
            </div>
            {recipesQuery.isLoading ? (
              <SkeletonBlock className="hidden h-8 w-28 rotate-[-3deg] lg:block" />
            ) : (
              <div className="hidden rotate-[-3deg] border-b border-surface-submit px-2 pb-1 font-serif text-lg italic text-surface-submit lg:block">
                {recipeCountLabel}
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={localize('com_recipes_search_placeholder')}
                aria-label={localize('com_recipes_search_placeholder')}
                className="min-h-14 rounded-lg border-border-light bg-surface-primary pl-14 text-base text-text-primary shadow-none placeholder:text-text-secondary focus-visible:ring-1 focus-visible:ring-ring-primary"
              />
            </div>
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-primary px-5 text-sm text-text-primary transition-colors hover:border-surface-submit hover:bg-surface-hover"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              <span>{localize('com_recipes_filters')}</span>
              {selectedFilters.length > 0 ? (
                <span className="rounded-full bg-surface-submit px-2 py-0.5 text-xs text-white">
                  {selectedFilters.length}
                </span>
              ) : null}
            </button>
          </div>
          {selectedFilters.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase text-text-secondary">
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
          <div className="grid auto-rows-[minmax(0,auto)] gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {recipes.map((recipe) => {
              const description = recipeDescription(recipe);
              const updatedAt = formatRecipeDate(recipe.updatedAt);
              const servings = recipe.recipe?.servings;

              return (
                <Link
                  key={recipe._id}
                  to={`/recipes/${recipe._id}`}
                  className="group overflow-hidden rounded-lg border border-border-light bg-surface-primary shadow-[0_4px_20px_-2px_rgba(26,25,23,0.04)] transition-colors hover:border-surface-submit hover:bg-surface-primary-alt"
                >
                  <div className="relative aspect-[1.92/1] overflow-hidden bg-surface-hover">
                    {recipe.illustrationUrl ? (
                      <img
                        src={recipe.illustrationUrl}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-surface-hover">
                        {recipe.illustrationStatus === 'pending' ? (
                          <div className="bg-surface-primary/50 h-10 w-10 rounded-full border border-border-heavy" />
                        ) : null}
                      </div>
                    )}
                    {updatedAt ? (
                      <span className="bg-surface-primary/85 absolute right-4 top-4 rounded-full px-3 py-2 text-sm text-text-secondary backdrop-blur">
                        {updatedAt}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-[178px] flex-col p-6">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h2 className="line-clamp-2 font-serif text-[1.72rem] font-normal leading-[1.05] tracking-normal text-text-primary">
                        {recipeDisplayTitle(recipe)}
                      </h2>
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-secondary">
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    {recipe.categorizationStatus === 'pending' ? (
                      <span className="mt-3 w-fit rounded-full border border-border-light bg-surface-primary-alt px-2.5 py-1 text-xs text-text-secondary">
                        {localize('com_recipes_categorizing')}
                      </span>
                    ) : null}
                    {description ? (
                      <p className="mt-3 line-clamp-2 max-w-[31rem] text-base leading-7 text-text-secondary">
                        {description}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2 text-sm text-text-secondary">
                      {typeof servings === 'number' && servings > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface-primary-alt px-3 py-1.5">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {localize('com_cooking_servings_count', { 0: String(servings) })}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                      {chips(recipe).map((chip) => (
                        <span
                          key={chip}
                          className={cn(
                            'rounded-full border border-border-light bg-surface-hover px-3 py-1.5 text-sm text-text-secondary',
                          )}
                        >
                          {displayFilter(chip)}
                        </span>
                      ))}
                      {chips(recipe).length === 0 && recipe.categorizationStatus === 'failed' ? (
                        <span className="rounded-full border border-border-light bg-surface-hover px-3 py-1.5 text-sm text-text-secondary">
                          {localize('com_recipes_saved')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
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
                  <p className="font-serif text-xl italic text-surface-submit">
                    {localize('com_recipes_add_new')}
                  </p>
                  <p className="mt-2 max-w-60 text-sm leading-6 text-text-secondary">
                    {localize('com_recipes_add_new_hint')}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
