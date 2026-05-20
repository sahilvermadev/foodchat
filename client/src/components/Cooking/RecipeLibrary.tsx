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
    <main className="h-full overflow-y-auto bg-[#fff8ef] px-4 py-8 text-[#1d1a16] dark:bg-[#171116] dark:text-white sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-7">
        <header className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-serif text-6xl font-normal leading-none tracking-normal text-[#1d1a16] dark:text-white sm:text-7xl">
                {localize('com_recipes_library')}
              </h1>
              <p className="mt-5 text-base text-[#8a5a00] dark:text-[#e3b77b]">
                {localize('com_recipes_library_subtitle')}
              </p>
            </div>
            {recipesQuery.isLoading ? null : (
              <div className="font-serif hidden rotate-[-3deg] border-b border-[#b56c3c] px-2 pb-1 text-lg italic text-[#8a5a00] dark:border-[#d1a05d] dark:text-[#d1a05d] lg:block">
                {recipeCountLabel}
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5f554d]/75 dark:text-[#e8d7cb]/80"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={localize('com_recipes_search_placeholder')}
                aria-label={localize('com_recipes_search_placeholder')}
                className="min-h-14 rounded-[10px] border-[#dfd0bf] bg-[#fffdf8]/85 pl-14 text-base text-[#1d1a16] shadow-none placeholder:text-[#5f554d]/70 focus-visible:ring-1 focus-visible:ring-[#ef6548] dark:border-white/10 dark:bg-[#171116]/75 dark:text-white dark:placeholder:text-[#d8c4b8]/75"
              />
            </div>
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[10px] border border-[#dfd0bf] bg-[#fffdf8]/90 px-5 text-sm text-[#1d1a16] transition-colors hover:border-[#ef6548] hover:bg-[#f6efe4] dark:border-white/10 dark:bg-[#2d2328]/90 dark:text-white dark:hover:bg-[#37282e]"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              <span>{localize('com_recipes_filters')}</span>
              {selectedFilters.length > 0 ? (
                <span className="rounded-full bg-[#ef6548] px-2 py-0.5 text-xs text-black dark:text-white">
                  {selectedFilters.length}
                </span>
              ) : null}
            </button>
          </div>
          {selectedFilters.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase text-[#77685c] dark:text-[#b9a9a0]">
                {localize('com_recipes_active_filters')}
              </span>
              {selectedFilters.map((filter) => (
                <button
                  key={`${filter.key}:${filter.value}`}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#dfd0bf] bg-[#fffdf8]/85 px-3 py-1.5 text-xs text-[#5f554d] transition-colors hover:bg-[#f6efe4] hover:text-[#1d1a16] dark:border-white/10 dark:bg-[#171116]/70 dark:text-[#e8d7cb] dark:hover:bg-[#35272d] dark:hover:text-white"
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
                className="px-2 py-1 text-xs text-[#77685c] hover:text-[#1d1a16] dark:text-[#b9a9a0] dark:hover:text-white"
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
                                    ? 'border-surface-submit bg-surface-submit text-black'
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
                  className="rounded-lg bg-surface-submit px-4 py-2 text-sm font-medium text-black hover:bg-surface-submit-hover"
                  onClick={() => setFiltersOpen(false)}
                >
                  {localize('com_ui_done')}
                </button>
              </div>
            </aside>
          </div>
        ) : null}

        {recipesQuery.isLoading ? (
          <div className="rounded-[10px] border border-[#dfd0bf] bg-[#fffdf8] p-6 text-sm text-[#5f554d] dark:border-white/10 dark:bg-[#221b20] dark:text-[#b9a9a0]">
            {localize('com_ui_loading')}
          </div>
        ) : null}
        {!recipesQuery.isLoading && recipes.length === 0 ? (
          <div className="rounded-[10px] border border-[#dfd0bf] bg-[#fffdf8] p-8 text-sm text-[#5f554d] shadow-sm dark:border-white/10 dark:bg-[#221b20] dark:text-[#b9a9a0]">
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
                  className="group overflow-hidden rounded-[10px] border border-[#dfd0bf] bg-[#fffdf8] shadow-[0_18px_44px_rgba(79,48,28,0.11)] transition-colors hover:border-[#ef6548]/70 hover:bg-[#fff8ef] dark:border-white/10 dark:bg-[#231d20] dark:shadow-[0_18px_44px_rgba(0,0,0,0.22)] dark:hover:bg-[#2a2226]"
                >
                  <div className="relative aspect-[1.92/1] overflow-hidden bg-[#eadfc8]">
                    {recipe.illustrationUrl ? (
                      <img
                        src={recipe.illustrationUrl}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eadfc8] to-[#d9c9ac]">
                        {recipe.illustrationStatus === 'pending' ? (
                          <div className="h-10 w-10 rounded-full border border-[#9e8568] bg-white/40" />
                        ) : null}
                      </div>
                    )}
                    {updatedAt ? (
                      <span className="absolute right-4 top-4 rounded-full bg-[#e4d2bf]/85 px-3 py-2 text-sm text-[#55443c] backdrop-blur">
                        {updatedAt}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-[178px] flex-col p-6">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h2 className="font-serif line-clamp-2 text-[1.72rem] font-normal leading-[1.05] tracking-normal text-[#1d1a16] dark:text-[#f6eee7]">
                        {recipeDisplayTitle(recipe)}
                      </h2>
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6efe4] text-[#77685c] dark:bg-white/5 dark:text-[#b9a9a0]">
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                    {recipe.categorizationStatus === 'pending' ? (
                      <span className="mt-3 w-fit rounded-full border border-[#dfd0bf] bg-[#fff8ef] px-2.5 py-1 text-xs text-[#77685c] dark:border-white/10 dark:bg-[#171116]/70 dark:text-[#b9a9a0]">
                        {localize('com_recipes_categorizing')}
                      </span>
                    ) : null}
                    {description ? (
                      <p className="mt-3 line-clamp-2 max-w-[31rem] text-base leading-7 text-[#5f554d] dark:text-[#d9c4b6]">
                        {description}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2 text-sm text-[#5f554d] dark:text-[#d9c4b6]">
                      {typeof servings === 'number' && servings > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfd0bf] bg-[#fff8ef]/80 px-3 py-1.5 dark:border-[#4f3835] dark:bg-[#171116]/65">
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
                            'rounded-full border border-[#dfd0bf] bg-[#f6efe4] px-3 py-1.5 text-sm text-[#5f554d] dark:border-[#4f3835] dark:bg-[#2b2226] dark:text-[#d9c4b6]',
                          )}
                        >
                          {displayFilter(chip)}
                        </span>
                      ))}
                      {chips(recipe).length === 0 && recipe.categorizationStatus === 'failed' ? (
                        <span className="rounded-full border border-[#dfd0bf] bg-[#f6efe4] px-3 py-1.5 text-sm text-[#5f554d] dark:border-[#4f3835] dark:bg-[#2b2226] dark:text-[#d9c4b6]">
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
              className="flex min-h-[218px] items-center justify-center rounded-[10px] border border-dashed border-[#d2c0ad] bg-[#fffdf8] p-8 text-center transition-colors hover:border-[#ef6548] hover:bg-[#fff8ef] dark:border-[#654840] dark:bg-[#1d161b] dark:hover:bg-[#241b20]"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#b56c3c] text-[#8a5a00] dark:border-[#8b6a5c] dark:text-[#f5d3a1]">
                  <Plus className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-serif text-xl italic text-[#8a5a00] dark:text-[#f5d3a1]">
                    {localize('com_recipes_add_new')}
                  </p>
                  <p className="mt-2 max-w-60 text-sm leading-6 text-[#5f554d] dark:text-[#b9a9a0]">
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
