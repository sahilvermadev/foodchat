import { useMemo, useState } from 'react';
import {
  Check,
  Clipboard,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Share2,
  ShoppingBasket,
  Trash2,
  X,
} from 'lucide-react';
import {
  ShoppingCategories,
  possibleShoppingDuplicates,
  recipeShoppingContributions,
  shoppingCategory,
} from 'librechat-data-provider';
import type {
  AddShoppingItemInput,
  ShoppingCategory,
  ShoppingListItem,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import type { FormEvent } from 'react';
import type { TranslationKeys } from '~/hooks';
import {
  useAddShoppingItemsMutation,
  useClearPurchasedShoppingItemsMutation,
  useDeleteShoppingItemMutation,
  useDeleteShoppingContributionMutation,
  useMergeShoppingItemsMutation,
  useShoppingListQuery,
  useUpdateShoppingItemMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { rekkyFloatingSurface, rekkyStatusTag } from '../Rekky/styles';
import {
  collectionPageContent,
  collectionMobileHeader,
  collectionPageScroll,
  collectionPageTitle,
  collectionPrimaryAction,
} from './collection';

const categoryKey = (category: ShoppingCategory): TranslationKeys =>
  `com_shopping_category_${category}` as TranslationKeys;

const amount = (item: ShoppingListItem) =>
  item.purchaseQuantity || [item.quantity, item.unit].filter((value) => value != null).join(' ');

const listText = (items: ShoppingListItem[]) =>
  items
    .filter((item) => !item.purchased && !item.pantry)
    .map((item) => `• ${[amount(item), item.displayName].filter(Boolean).join(' ')}`)
    .join('\n');

function ItemEditor({ item, onClose }: { item?: ShoppingListItem; onClose: () => void }) {
  const localize = useLocalize();
  const addItems = useAddShoppingItemsMutation();
  const updateItem = useUpdateShoppingItemMutation();
  const [displayName, setDisplayName] = useState(item?.displayName ?? '');
  const [purchaseQuantity, setPurchaseQuantity] = useState(item?.purchaseQuantity ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [category, setCategory] = useState<ShoppingCategory>(item?.category ?? 'other');
  const [pantry, setPantry] = useState(item?.pantry ?? false);
  const [optional, setOptional] = useState(item?.optional ?? false);
  const isSaving = addItems.isLoading || updateItem.isLoading;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) return;
    if (item) {
      const patch: UpdateShoppingItemRequest = {
        category,
        categoryOverride: true,
        displayName: displayName.trim(),
        note: note.trim() || undefined,
        optional,
        pantry,
        purchaseQuantity: purchaseQuantity.trim() || undefined,
      };
      updateItem.mutate({ itemId: item.id, patch }, { onSuccess: onClose });
      return;
    }
    const input: AddShoppingItemInput = {
      category: category === 'other' ? shoppingCategory(displayName) : category,
      categoryOverride: category !== 'other',
      displayName: displayName.trim(),
      note: note.trim() || undefined,
      optional,
      pantry,
      purchaseQuantity: purchaseQuantity.trim() || undefined,
    };
    addItems.mutate([input], { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={localize('com_shopping_cancel')}
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative z-raised w-full max-w-lg rounded-t-dialog border border-border-light bg-surface-dialog p-5 shadow-dialog sm:rounded-dialog sm:p-7"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">
            {localize(item ? 'com_shopping_edit' : 'com_shopping_add_item')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover"
            aria-label={localize('com_shopping_cancel')}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm text-text-secondary">
            {localize('com_shopping_item_name')}
            <input
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="rounded-lg border border-border-light bg-surface-primary-alt px-3 py-2.5 text-text-primary"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-text-secondary">
            {localize('com_shopping_amount')}
            <input
              value={purchaseQuantity}
              onChange={(event) => setPurchaseQuantity(event.target.value)}
              className="rounded-lg border border-border-light bg-surface-primary-alt px-3 py-2.5 text-text-primary"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-text-secondary">
            {localize('com_shopping_category')}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ShoppingCategory)}
              className="rounded-lg border border-border-light bg-surface-primary-alt px-3 py-2.5 text-text-primary"
            >
              {ShoppingCategories.map((value) => (
                <option key={value} value={value}>
                  {localize(categoryKey(value))}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-text-secondary">
            {localize('com_shopping_note')}
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="resize-none rounded-lg border border-border-light bg-surface-primary-alt px-3 py-2.5 text-text-primary"
            />
          </label>
          <div className="flex flex-wrap gap-5 text-sm text-text-primary">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pantry}
                onChange={(event) => setPantry(event.target.checked)}
              />
              {localize('com_shopping_pantry')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={optional}
                onChange={(event) => setOptional(event.target.checked)}
              />
              {localize('com_shopping_optional')}
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={isSaving || !displayName.trim()}
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-surface-submit px-4 py-3 font-medium text-text-submit disabled:opacity-50"
        >
          {isSaving ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            localize('com_shopping_save')
          )}
        </button>
      </form>
    </div>
  );
}

function ShoppingItemRow({
  item,
  onEdit,
  onRemove,
}: {
  item: ShoppingListItem;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const localize = useLocalize();
  const updateItem = useUpdateShoppingItemMutation();
  const deleteContribution = useDeleteShoppingContributionMutation();
  const [actionsOpen, setActionsOpen] = useState(false);
  const sources = recipeShoppingContributions(item);
  const firstSource = sources[0];
  let sourceLabel = localize('com_shopping_manual');
  if (firstSource && sources.length === 1) {
    sourceLabel = localize('com_shopping_for_recipe', { recipe: firstSource.recipeTitle });
  } else if (firstSource) {
    sourceLabel = localize('com_shopping_for_recipes', {
      count: sources.length - 1,
      recipe: firstSource.recipeTitle,
    });
  }

  return (
    <div className="border-border-light/70 group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b py-3.5 last:border-0">
      <button
        type="button"
        onClick={() =>
          updateItem.mutate({ itemId: item.id, patch: { purchased: !item.purchased } })
        }
        aria-label={localize(
          item.purchased ? 'com_shopping_mark_needed' : 'com_shopping_mark_purchased',
          { item: item.displayName },
        )}
        className="mt-0.5 flex size-11 items-center justify-center rounded-lg hover:bg-surface-hover"
      >
        <span
          className={`flex size-5 items-center justify-center rounded border ${
            item.purchased
              ? 'border-status-success bg-status-success text-status-ink'
              : 'border-border-heavy text-transparent'
          }`}
          aria-hidden="true"
        >
          <Check className="size-3.5" />
        </span>
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {amount(item) ? (
            <span className="font-semibold text-text-primary">{amount(item)}</span>
          ) : null}
          <span className={`${item.purchased ? 'line-through opacity-55' : ''} text-text-primary`}>
            {item.displayName}
          </span>
        </div>
        {sources.length ? (
          <details className="mt-1 text-xs text-text-secondary">
            <summary className="cursor-pointer hover:text-text-primary">{sourceLabel}</summary>
            <div className="mt-2 grid gap-1.5 border-l border-border-light pl-3">
              {sources.map((source) => (
                <div key={source.id} className="flex items-center justify-between gap-3">
                  <span>
                    {localize('com_shopping_required_amount', {
                      amount:
                        [source.quantity, source.unit].filter((value) => value != null).join(' ') ||
                        '—',
                      recipe: source.recipeTitle,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      deleteContribution.mutate({ contributionId: source.id, itemId: item.id })
                    }
                    aria-label={localize('com_shopping_remove_source', {
                      recipe: source.recipeTitle,
                    })}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover hover:text-status-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <p className="mt-1 text-xs text-text-secondary">{sourceLabel}</p>
        )}
        {item.note ? <p className="mt-1 text-sm text-text-secondary">{item.note}</p> : null}
        <div className="mt-1.5 flex gap-1.5">
          {item.optional ? (
            <span className="rounded-full border border-border-light px-2 py-0.5 text-xs text-text-secondary">
              {localize('com_shopping_optional')}
            </span>
          ) : null}
          {item.pantry ? (
            <span className={`${rekkyStatusTag.success} px-2 py-0.5 text-xs`}>
              {localize('com_shopping_in_pantry')}
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setActionsOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        aria-label={`${item.displayName} ${localize('com_shopping_edit')}`}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {actionsOpen ? (
        <div className={`${rekkyFloatingSurface} absolute right-0 top-10 z-dropdown min-w-36 p-1`}>
          <button
            type="button"
            onClick={onEdit}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
          >
            {localize('com_shopping_edit')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-danger hover:bg-surface-hover"
          >
            <Trash2 className="size-4" /> {localize('com_shopping_remove')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function ShoppingList() {
  const localize = useLocalize();
  const listQuery = useShoppingListQuery();
  const clearPurchased = useClearPurchasedShoppingItemsMutation();
  const deleteItem = useDeleteShoppingItemMutation();
  const addItems = useAddShoppingItemsMutation();
  const mergeItems = useMergeShoppingItemsMutation();
  const [editorItem, setEditorItem] = useState<ShoppingListItem | 'new' | null>(null);
  const [ignoredPairs, setIgnoredPairs] = useState<Set<string>>(new Set());
  const [removedItem, setRemovedItem] = useState<ShoppingListItem | null>(null);
  const items = listQuery.data?.items ?? [];
  const activeItems = items.filter((item) => !item.purchased && !item.pantry);
  const pantryItems = items.filter((item) => item.pantry && !item.purchased);
  const purchasedItems = items.filter((item) => item.purchased);
  const grouped = useMemo(
    () =>
      ShoppingCategories.map((category) => ({
        category,
        items: activeItems.filter((item) => item.category === category),
      })).filter((group) => group.items.length),
    [activeItems],
  );
  const duplicate = possibleShoppingDuplicates(activeItems).find(
    ({ first, second }) => !ignoredPairs.has(`${first.id}:${second.id}`),
  );

  const copyList = async () => navigator.clipboard.writeText(listText(items));
  const shareList = async () => {
    const text = listText(items);
    if (navigator.share) await navigator.share({ text, title: localize('com_shopping_title') });
    else await navigator.clipboard.writeText(text);
  };

  const removeItem = (item: ShoppingListItem) =>
    deleteItem.mutate(item.id, { onSuccess: () => setRemovedItem(item) });

  const undoRemove = () => {
    if (!removedItem) return;
    const inputs: AddShoppingItemInput[] = removedItem.contributions.map((contribution, index) => ({
      category: removedItem.category,
      categoryOverride: removedItem.categoryOverride,
      displayName: removedItem.displayName,
      note: index === 0 ? removedItem.note : undefined,
      optional: contribution.optional,
      pantry: removedItem.pantry,
      purchaseQuantity: index === 0 ? removedItem.purchaseQuantity : undefined,
      quantity: contribution.quantity,
      unit: contribution.unit,
      ...(contribution.kind === 'recipe' &&
      contribution.recipeId &&
      contribution.recipeTitle &&
      contribution.ingredientId
        ? {
            recipeReference: {
              ingredientId: contribution.ingredientId,
              quantity: contribution.quantity,
              recipeId: contribution.recipeId,
              recipeTitle: contribution.recipeTitle,
              servings: contribution.servings,
              unit: contribution.unit,
            },
          }
        : { contributionId: contribution.id }),
    }));
    addItems.mutate(inputs, { onSuccess: () => setRemovedItem(null) });
  };

  return (
    <main
      className="rekky-ui flex h-full min-h-0 flex-col bg-surface-primary-alt text-text-primary"
      data-testid="shopping-page"
      aria-busy={listQuery.isLoading}
    >
      <div className={collectionMobileHeader}>
        <span className="text-[1.05rem] font-medium tracking-normal text-text-primary">
          {localize('com_shopping_title')}
        </span>
      </div>

      <div className={collectionPageScroll}>
        <div className={collectionPageContent}>
          <header className="pt-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-3">
                <h1 className={collectionPageTitle}>{localize('com_shopping_title')}</h1>
                <span className="hidden text-sm font-normal text-text-secondary sm:block">
                  {localize('com_shopping_remaining', { count: activeItems.length })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditorItem('new')}
                className={collectionPrimaryAction}
              >
                <Plus className="size-4" aria-hidden="true" />
                {localize('com_shopping_add_item')}
              </button>
            </div>
            <p className="mt-2 hidden text-sm text-text-secondary sm:block">
              {localize('com_shopping_subtitle')}
            </p>
          </header>

          <div className="flex flex-wrap gap-1 border-b border-border-light pb-3">
            <button
              type="button"
              onClick={() => void copyList()}
              className="flex h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Clipboard className="size-4" /> {localize('com_shopping_copy')}
            </button>
            <button
              type="button"
              onClick={() => void shareList()}
              className="flex h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Share2 className="size-4" /> {localize('com_shopping_share')}
            </button>
            {purchasedItems.length ? (
              <button
                type="button"
                onClick={() => clearPurchased.mutate()}
                className="flex h-11 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Trash2 className="size-4" /> {localize('com_shopping_clear_purchased')}
              </button>
            ) : null}
          </div>

          {duplicate ? (
            <section className="border-status-caution/30 bg-status-caution/10 rounded-card border p-4">
              <h2 className="font-semibold">{localize('com_shopping_duplicates')}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {duplicate.first.displayName} · {duplicate.second.displayName}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    mergeItems.mutate({
                      targetId: duplicate.first.id,
                      sourceId: duplicate.second.id,
                    })
                  }
                  className="rounded-full bg-status-caution px-3 py-1.5 text-sm font-medium text-status-ink"
                >
                  {localize('com_shopping_merge')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIgnoredPairs((current) =>
                      new Set(current).add(`${duplicate.first.id}:${duplicate.second.id}`),
                    )
                  }
                  className="rounded-full px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
                >
                  {localize('com_shopping_keep_separate')}
                </button>
              </div>
            </section>
          ) : null}

          {listQuery.isLoading ? (
            <div
              className="flex min-h-72 items-center justify-center gap-3 text-text-secondary"
              role="status"
            >
              <LoaderCircle className="size-5 animate-spin" /> {localize('com_shopping_loading')}
            </div>
          ) : null}
          {listQuery.isError ? (
            <p className="mt-8 text-status-danger">{localize('com_shopping_error')}</p>
          ) : null}
          {!listQuery.isLoading && !items.length ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-card border border-border-light p-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full border border-border-light text-text-secondary">
                <ShoppingBasket className="size-5" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">{localize('com_shopping_empty')}</h2>
              <p className="mt-2 max-w-sm text-sm text-text-secondary">
                {localize('com_shopping_empty_hint')}
              </p>
            </div>
          ) : null}

          <div className="grid gap-x-8 gap-y-8 md:grid-cols-2 2xl:grid-cols-3">
            {grouped.map((group) => (
              <section key={group.category} className="min-w-0">
                <h2 className="border-b border-border-light pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
                  {localize(categoryKey(group.category))}
                </h2>
                {group.items.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditorItem(item)}
                    onRemove={() => removeItem(item)}
                  />
                ))}
              </section>
            ))}
            {pantryItems.length ? (
              <section className="min-w-0">
                <h2 className="border-b border-border-light pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
                  {localize('com_shopping_in_pantry')}
                </h2>
                {pantryItems.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditorItem(item)}
                    onRemove={() => removeItem(item)}
                  />
                ))}
              </section>
            ) : null}
            {purchasedItems.length ? (
              <section className="min-w-0 opacity-70">
                <h2 className="border-b border-border-light pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">
                  {localize('com_shopping_purchased')}
                </h2>
                {purchasedItems.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditorItem(item)}
                    onRemove={() => removeItem(item)}
                  />
                ))}
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {editorItem ? (
        <ItemEditor
          item={editorItem === 'new' ? undefined : editorItem}
          onClose={() => setEditorItem(null)}
        />
      ) : null}
      {removedItem ? (
        <div className="fixed bottom-5 left-1/2 z-toast flex -translate-x-1/2 items-center gap-5 rounded-full border border-border-light bg-surface-primary px-5 py-3 text-sm text-text-primary shadow-floating">
          <span>{localize('com_shopping_item_removed')}</span>
          <button type="button" onClick={undoRemove} className="font-semibold text-status-caution">
            {localize('com_shopping_undo')}
          </button>
        </div>
      ) : null}
    </main>
  );
}
