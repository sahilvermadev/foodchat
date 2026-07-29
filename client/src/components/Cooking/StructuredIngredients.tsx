import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, ShoppingBasket, X } from 'lucide-react';
import { recipeIngredientParts } from 'librechat-data-provider';
import type {
  AddShoppingItemInput,
  Ingredient,
  RecipeUnitMode,
  RecipeWorkspaceState,
} from 'librechat-data-provider';
import { useAddShoppingItemsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

type StructuredIngredientsProps = {
  ingredients: Ingredient[];
  ensureRecipeId?(): Promise<string>;
  recipeId?: string;
  recipeTitle?: string;
  servings?: number;
  workspaceState?: RecipeWorkspaceState;
  onWorkspaceChange?(state: Omit<RecipeWorkspaceState, 'updatedAt'>): void;
};

const PLACEHOLDER_INGREDIENT_VALUES = new Set(['', '-', 'item', 'ingredient']);
const PLACEHOLDER_INGREDIENT_PATTERN = /^(?:\d+(?:\.\d+)?\s*)?(?:items?|ingredients?)$/i;

function cleanIngredientValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

function isPlaceholderIngredientValue(value: string | undefined): boolean {
  const cleanValue = cleanIngredientValue(value);
  return (
    PLACEHOLDER_INGREDIENT_VALUES.has(cleanValue.toLowerCase()) ||
    PLACEHOLDER_INGREDIENT_PATTERN.test(cleanValue)
  );
}

export function isDisplayableIngredient(ingredient: Ingredient): boolean {
  return (
    !isPlaceholderIngredientValue(ingredient.originalText) ||
    !isPlaceholderIngredientValue(ingredient.item)
  );
}

export function hasDisplayableIngredients(ingredients: Ingredient[]): boolean {
  return ingredients.some(isDisplayableIngredient);
}

export default function StructuredIngredients({
  ensureRecipeId,
  ingredients,
  onWorkspaceChange,
  recipeId,
  recipeTitle,
  servings: baseServings = 1,
  workspaceState,
}: StructuredIngredientsProps) {
  const localize = useLocalize();
  const addShoppingItems = useAddShoppingItemsMutation();
  const displayIngredients = useMemo(
    () => ingredients.filter(isDisplayableIngredient),
    [ingredients],
  );
  const originalServings = Math.max(1, baseServings);
  const [servings, setServings] = useState(workspaceState?.servings ?? originalServings);
  const [unitMode, setUnitMode] = useState<RecipeUnitMode>(workspaceState?.unitMode ?? 'original');
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(workspaceState?.checkedIngredientIds ?? []),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState(false);
  const [addError, setAddError] = useState(false);
  const [isPreparingRecipe, setIsPreparingRecipe] = useState(false);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const scale = servings / originalServings;

  useEffect(() => {
    setServings(workspaceState?.servings ?? originalServings);
    setUnitMode(workspaceState?.unitMode ?? 'original');
    setChecked(new Set(workspaceState?.checkedIngredientIds ?? []));
  }, [originalServings, workspaceState]);

  useEffect(() => {
    const dialog = reviewDialogRef.current;
    if (!dialog) return;
    if (reviewOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!reviewOpen && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [reviewOpen]);

  if (!displayIngredients.length) return null;

  const sync = (nextServings = servings, nextUnitMode = unitMode, nextChecked = checked) =>
    onWorkspaceChange?.({
      checkedIngredientIds: [...nextChecked],
      servings: nextServings,
      timers: workspaceState?.timers ?? [],
      unitMode: nextUnitMode,
    });

  const changeServings = (delta: number) => {
    const next = Math.max(1, servings + delta);
    setServings(next);
    sync(next);
  };

  const toggleChecked = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    sync(servings, unitMode, next);
  };

  const openReview = () => {
    setSelected(new Set(displayIngredients.map((ingredient) => ingredient.id)));
    setReviewOpen(true);
  };

  const addSelected = async () => {
    if (!recipeTitle) return;
    setAddError(false);
    setIsPreparingRecipe(true);
    let resolvedRecipeId = recipeId;
    try {
      resolvedRecipeId ??= await ensureRecipeId?.();
    } catch {
      setAddError(true);
      setIsPreparingRecipe(false);
      return;
    }
    if (!resolvedRecipeId) {
      setAddError(true);
      setIsPreparingRecipe(false);
      return;
    }
    const shoppingRecipeId = resolvedRecipeId;
    const items: AddShoppingItemInput[] = displayIngredients
      .filter((ingredient) => selected.has(ingredient.id))
      .map((ingredient) => ({
        displayName: ingredient.item || ingredient.originalText,
        optional: ingredient.optional,
        quantity: ingredient.quantity == null ? undefined : ingredient.quantity * scale,
        unit: ingredient.unit,
        recipeReference: {
          ingredientId: ingredient.id,
          quantity: ingredient.quantity == null ? undefined : ingredient.quantity * scale,
          recipeId: shoppingRecipeId,
          recipeTitle,
          servings,
          unit: ingredient.unit,
        },
      }));
    addShoppingItems.mutate(items, {
      onSuccess: () => {
        setReviewOpen(false);
        setNotice(true);
        setIsPreparingRecipe(false);
      },
      onError: () => {
        setAddError(true);
        setIsPreparingRecipe(false);
      },
    });
  };

  return (
    <section
      className="mb-8 border-b border-border-light pb-8"
      data-testid="structured-ingredients"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="rekky-section-title text-text-primary">
          {localize('com_recipe_ingredients')}
        </h2>
        {recipeTitle && (recipeId || ensureRecipeId) ? (
          <button
            type="button"
            onClick={openReview}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control border border-border-light px-3 text-sm font-medium text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          >
            <ShoppingBasket className="size-4" /> {localize('com_recipe_add_to_shopping')}
          </button>
        ) : null}
      </div>
      {notice ? (
        <button
          type="button"
          onClick={() => setNotice(false)}
          className="bg-status-success/10 hover:bg-status-success/15 mt-3 flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm text-status-success transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
        >
          <Check className="size-4" /> {localize('com_recipe_added_to_shopping')}
        </button>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-y border-border-light py-3">
        <div className="flex items-center gap-3">
          <span className="rekky-meta text-text-secondary">{localize('com_recipe_servings')}</span>
          <button
            type="button"
            onClick={() => changeServings(-1)}
            disabled={servings <= 1}
            aria-label={localize('com_recipe_decrease_servings')}
            className="inline-flex size-11 items-center justify-center rounded-control border border-border-light text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Minus className="size-3.5" />
          </button>
          <strong className="min-w-5 text-center tabular-nums">{servings}</strong>
          <button
            type="button"
            onClick={() => changeServings(1)}
            aria-label={localize('com_recipe_increase_servings')}
            className="inline-flex size-11 items-center justify-center rounded-control border border-border-light text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center border-b border-border-light" role="tablist">
          {(['original', 'metric', 'imperial'] as const).map((mode) => (
            <button
              type="button"
              role="tab"
              aria-selected={unitMode === mode}
              key={mode}
              onClick={() => {
                setUnitMode(mode);
                sync(servings, mode);
              }}
              className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px ${unitMode === mode ? 'border-surface-submit text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            >
              {localize(`com_recipe_units_${mode}`)}
            </button>
          ))}
        </div>
      </div>
      {servings !== originalServings ? (
        <p className="mt-3 text-xs text-text-secondary">{localize('com_recipe_scale_note')}</p>
      ) : null}
      {checked.size ? (
        <div className="mt-4 flex items-center justify-between text-xs text-text-secondary">
          <span>{localize('com_recipe_checked_count', { count: checked.size })}</span>
          <button
            type="button"
            onClick={() => {
              const next = new Set<string>();
              setChecked(next);
              sync(servings, unitMode, next);
            }}
            className="inline-flex min-h-11 items-center rounded-control px-2 font-medium transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          >
            {localize('com_recipe_uncheck_all')}
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-0">
        {displayIngredients.map((ingredient, index) => {
          const parts = recipeIngredientParts(ingredient, scale, unitMode);
          const showGroup = Boolean(
            ingredient.group && ingredient.group !== displayIngredients[index - 1]?.group,
          );
          return (
            <div key={ingredient.id}>
              {showGroup ? (
                <h3 className="rekky-meta mt-5 border-b border-border-light pb-2 text-text-secondary first:mt-0">
                  {ingredient.group}
                </h3>
              ) : null}
              <label className="border-border-light/60 grid cursor-pointer grid-cols-[auto_minmax(4.5rem,auto)_minmax(0,1fr)] items-start gap-3 border-b py-3 last:border-0">
                <input
                  type="checkbox"
                  checked={checked.has(ingredient.id)}
                  onChange={() => toggleChecked(ingredient.id)}
                  aria-label={ingredient.originalText}
                  className="mt-1 size-4 accent-surface-submit"
                />
                <span
                  className={`${checked.has(ingredient.id) ? 'line-through opacity-50' : ''} text-sm font-semibold text-text-primary`}
                >
                  {parts.amount || '—'}
                </span>
                <span
                  className={`${checked.has(ingredient.id) ? 'line-through opacity-50' : ''} text-sm leading-6 text-text-primary`}
                >
                  {parts.name}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <dialog
        ref={reviewDialogRef}
        aria-labelledby="recipe-shopping-review-title"
        onCancel={(event) => {
          event.preventDefault();
          setReviewOpen(false);
        }}
        onClose={() => setReviewOpen(false)}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-xl rounded-dialog border border-border-light bg-surface-primary p-0 text-text-primary shadow-dialog backdrop:bg-overlay sm:inset-0 sm:m-auto"
      >
        <div className="flex max-h-[85dvh] flex-col p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="recipe-shopping-review-title" className="text-xl font-semibold">
                {localize('com_recipe_review_ingredients')}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {localize('com_recipe_review_hint')}
              </p>
              {!recipeId ? (
                <p className="mt-2 text-xs text-text-secondary">
                  {localize('com_recipe_shopping_saves_recipe')}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="inline-flex size-11 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
              aria-label={localize('com_shopping_cancel')}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-5 min-h-0 overflow-y-auto border-y border-border-light py-2">
            {displayIngredients.map((ingredient) => {
              const parts = recipeIngredientParts(ingredient, scale, unitMode);
              return (
                <label
                  key={ingredient.id}
                  className="border-border-light/60 flex cursor-pointer items-start gap-3 border-b py-3 last:border-0"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-surface-submit"
                    checked={selected.has(ingredient.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(ingredient.id)) next.delete(ingredient.id);
                      else next.add(ingredient.id);
                      setSelected(next);
                    }}
                  />
                  <span className="min-w-20 text-sm font-semibold">{parts.amount}</span>
                  <span className="text-sm">
                    {parts.name}
                    {ingredient.optional ? ` · ${localize('com_recipe_optional')}` : ''}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-sm text-text-secondary">
                {localize('com_recipe_selected_count', { count: selected.size })}
              </span>
              {addError ? (
                <p className="mt-1 text-xs text-status-danger">
                  {localize('com_recipe_shopping_add_error')}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={!selected.size || addShoppingItems.isLoading || isPreparingRecipe}
              onClick={() => void addSelected()}
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-control bg-surface-submit px-5 font-medium text-text-submit transition-colors hover:bg-surface-submit-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {localize(isPreparingRecipe ? 'com_recipes_saving' : 'com_recipe_add_selected')}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
