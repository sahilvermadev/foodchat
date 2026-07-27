import mongoose from 'mongoose';
import type {
  AddShoppingItemInput,
  ShoppingList,
  ShoppingContribution,
  ShoppingListItem,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import {
  canonicalShoppingName,
  compatibleShoppingUnits,
  combineShoppingItems,
  createShoppingItem,
  mergeShoppingItem,
  normalizeShoppingItem,
  normalizeShoppingList,
  recipeContributionId,
  removeShoppingContribution as removeContributionFromItem,
  shoppingQuantity,
  ShoppingCategories,
} from 'librechat-data-provider';
import type { IShoppingList } from '@librechat/data-schemas';
import { CookingValidationError } from '../cooking/validation';

const maxItems = 500;
const maxRetries = 3;
const maxMutationIds = 250;
const patchFields = new Set([
  'displayName',
  'quantity',
  'unit',
  'purchaseQuantity',
  'category',
  'categoryOverride',
  'purchased',
  'note',
  'optional',
  'pantry',
]);

const model = () => mongoose.model<IShoppingList>('ShoppingList');
const id = () => new mongoose.Types.ObjectId().toString();
const iso = (date?: Date) => (date ?? new Date()).toISOString();

const plainItem = (item: IShoppingList['items'][number]): ShoppingListItem =>
  normalizeShoppingItem({
    id: item.id,
    canonicalName: item.canonicalName,
    displayName: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    purchaseQuantity: item.purchaseQuantity,
    category: item.category,
    categoryOverride: item.categoryOverride,
    purchased: item.purchased,
    note: item.note,
    optional: item.optional,
    pantry: item.pantry,
    contributions: item.contributions?.map((contribution) => ({
      id: contribution.id.replace(/^recipe:saved:/, 'recipe:'),
      kind: contribution.kind,
      quantity: contribution.quantity,
      unit: contribution.unit,
      optional: contribution.optional,
      recipeId: contribution.recipeId?.replace(/^saved:/, ''),
      recipeTitle: contribution.recipeTitle,
      ingredientId: contribution.ingredientId,
      servings: contribution.servings,
    })),
    recipeReferences: item.recipeReferences?.map((reference) => ({
      recipeId: reference.recipeId,
      recipeTitle: reference.recipeTitle,
      ingredientId: reference.ingredientId,
      quantity: reference.quantity,
      unit: reference.unit,
      servings: reference.servings,
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });

const serialize = (list: IShoppingList): ShoppingList =>
  normalizeShoppingList({
    _id: String(list._id),
    name: list.name,
    items: list.items.map(plainItem),
    createdAt: iso(list.createdAt),
    updatedAt: iso(list.updatedAt),
  });

async function activeList(user: string): Promise<IShoppingList> {
  return model().findOneAndUpdate(
    { user },
    { $setOnInsert: { user, name: 'Shopping list', items: [] } },
    { new: true, upsert: true },
  );
}

async function updateWithRetry(
  user: string,
  mutationId: string | undefined,
  update: (list: IShoppingList, now: string) => void,
): Promise<ShoppingList> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const list = await activeList(user);
    const appliedMutationIds = list.appliedMutationIds ?? [];
    if (mutationId && appliedMutationIds.includes(mutationId)) return serialize(list);
    list.items = serialize(list).items;
    update(list, new Date().toISOString());
    if (mutationId) {
      list.appliedMutationIds = [...appliedMutationIds, mutationId].slice(-maxMutationIds);
      list.markModified('appliedMutationIds');
    }
    list.markModified('items');
    try {
      return serialize(await list.save());
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError) || attempt === maxRetries - 1)
        throw error;
    }
  }
  throw new Error('Shopping list update could not be completed.');
}

export async function getShoppingList(user: string): Promise<ShoppingList> {
  return serialize(await activeList(user));
}

export async function addShoppingItems(
  user: string,
  inputs: AddShoppingItemInput[],
  mutationId?: string,
): Promise<ShoppingList> {
  if (!inputs.length) throw new CookingValidationError('Select at least one ingredient.');
  return updateWithRetry(user, mutationId, (list, now) => {
    for (const input of inputs) {
      const canonicalName = canonicalShoppingName(input.displayName);
      const contributionId = input.recipeReference
        ? recipeContributionId(input.recipeReference)
        : input.contributionId;
      const existingIndex = list.items.findIndex((item) => {
        if (input.id && item.id === input.id) return true;
        if (
          contributionId &&
          plainItem(item).contributions.some((entry) => entry.id === contributionId)
        ) {
          return true;
        }
        return (
          item.canonicalName === canonicalName && compatibleShoppingUnits(item.unit, input.unit)
        );
      });
      if (existingIndex >= 0) {
        list.items[existingIndex] = mergeShoppingItem(
          plainItem(list.items[existingIndex]),
          input,
          now,
        );
        continue;
      }
      if (list.items.length >= maxItems) {
        throw new CookingValidationError('Shopping list item limit reached.');
      }
      list.items.push(createShoppingItem(input, input.id ?? id(), now));
    }
  });
}

export async function updateShoppingItem(
  user: string,
  itemId: string,
  patch: UpdateShoppingItemRequest,
  mutationId?: string,
): Promise<ShoppingList | null> {
  const exists = await model().exists({ user, 'items.id': itemId });
  if (!exists) return null;
  return updateWithRetry(user, mutationId, (list, now) => {
    const index = list.items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const current = plainItem(list.items[index]);
    const next = { ...current, updatedAt: now };
    if (patch.displayName != null) {
      next.displayName = patch.displayName.trim();
      next.canonicalName = canonicalShoppingName(next.displayName);
    }
    if (patch.quantity !== undefined) {
      const manualIndex = next.contributions.findIndex((entry) => entry.kind === 'manual');
      const manual: ShoppingContribution = {
        id: `manual:${next.id}`,
        kind: 'manual',
        quantity: patch.quantity,
        unit: patch.unit ?? next.unit,
        optional: next.optional,
      };
      if (manualIndex >= 0) next.contributions[manualIndex] = manual;
      else next.contributions.push(manual);
      next.quantity = shoppingQuantity(next.contributions, next.unit);
    }
    if (patch.unit !== undefined) next.unit = patch.unit?.trim() || undefined;
    if (patch.purchaseQuantity !== undefined) {
      next.purchaseQuantity = patch.purchaseQuantity?.trim() || undefined;
    }
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.categoryOverride !== undefined) next.categoryOverride = patch.categoryOverride;
    if (patch.purchased !== undefined) next.purchased = patch.purchased;
    if (patch.note !== undefined) next.note = patch.note?.trim() || undefined;
    if (patch.optional !== undefined) next.optional = patch.optional;
    if (patch.pantry !== undefined) next.pantry = patch.pantry;
    list.items[index] = next;
  });
}

export async function deleteShoppingItem(
  user: string,
  itemId: string,
  mutationId?: string,
): Promise<ShoppingList | null> {
  const exists = await model().exists({ user, 'items.id': itemId });
  if (!exists) return null;
  return updateWithRetry(user, mutationId, (list) => {
    list.items = list.items.filter((item) => item.id !== itemId);
  });
}

export async function clearPurchasedShoppingItems(
  user: string,
  mutationId?: string,
): Promise<ShoppingList> {
  return updateWithRetry(user, mutationId, (list) => {
    list.items = list.items.filter((item) => !item.purchased);
  });
}

export async function deleteShoppingContribution(
  user: string,
  itemId: string,
  contributionId: string,
  mutationId?: string,
): Promise<ShoppingList | null> {
  const exists = await model().exists({ user, 'items.id': itemId });
  if (!exists) return null;
  return updateWithRetry(user, mutationId, (list, now) => {
    const index = list.items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const next = removeContributionFromItem(plainItem(list.items[index]), contributionId, now);
    if (next) list.items[index] = next;
    else list.items.splice(index, 1);
  });
}

export async function mergeShoppingListItems(
  user: string,
  targetId: string,
  sourceId: string,
  mutationId?: string,
): Promise<ShoppingList | null> {
  const exists = await model().exists({ user, 'items.id': { $all: [targetId, sourceId] } });
  if (!exists) return null;
  return updateWithRetry(user, mutationId, (list, now) => {
    const targetIndex = list.items.findIndex((item) => item.id === targetId);
    const sourceIndex = list.items.findIndex((item) => item.id === sourceId);
    if (targetIndex < 0 || sourceIndex < 0 || targetIndex === sourceIndex) return;
    const merged = combineShoppingItems(
      plainItem(list.items[targetIndex]),
      plainItem(list.items[sourceIndex]),
      now,
    );
    if (!merged) throw new CookingValidationError('These shopping quantities cannot be merged.');
    list.items[targetIndex] = merged;
    list.items.splice(sourceIndex, 1);
  });
}

export function assertShoppingInputs(inputs: AddShoppingItemInput[]): void {
  if (!Array.isArray(inputs) || inputs.length > 100) {
    throw new CookingValidationError('Shopping list ingredients are malformed.');
  }
  for (const input of inputs) {
    if (!input || typeof input.displayName !== 'string' || !input.displayName.trim()) {
      throw new CookingValidationError('Every shopping item needs a name.');
    }
    if (input.displayName.trim().length > 160) {
      throw new CookingValidationError('Shopping item name is too long.');
    }
    if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0)) {
      throw new CookingValidationError('Shopping item quantity is malformed.');
    }
    if (input.unit != null && (typeof input.unit !== 'string' || input.unit.length > 40)) {
      throw new CookingValidationError('Shopping item unit is malformed.');
    }
    if (
      input.purchaseQuantity != null &&
      (typeof input.purchaseQuantity !== 'string' || input.purchaseQuantity.length > 80)
    ) {
      throw new CookingValidationError('Shopping purchase quantity is malformed.');
    }
    if (input.note != null && (typeof input.note !== 'string' || input.note.length > 500)) {
      throw new CookingValidationError('Shopping item note is malformed.');
    }
    if (input.optional != null && typeof input.optional !== 'boolean') {
      throw new CookingValidationError('Shopping item optional state is malformed.');
    }
    if (input.pantry != null && typeof input.pantry !== 'boolean') {
      throw new CookingValidationError('Shopping item pantry state is malformed.');
    }
    if (input.category != null && !ShoppingCategories.includes(input.category)) {
      throw new CookingValidationError('Shopping item category is malformed.');
    }
    if (input.categoryOverride != null && typeof input.categoryOverride !== 'boolean') {
      throw new CookingValidationError('Shopping item category preference is malformed.');
    }
    if (input.contributionId != null && !input.contributionId.trim()) {
      throw new CookingValidationError('Shopping contribution identifier is malformed.');
    }
    const reference = input.recipeReference;
    if (
      reference &&
      (typeof reference.recipeId !== 'string' ||
        !reference.recipeId.trim() ||
        typeof reference.recipeTitle !== 'string' ||
        !reference.recipeTitle.trim() ||
        typeof reference.ingredientId !== 'string' ||
        !reference.ingredientId.trim())
    ) {
      throw new CookingValidationError('Shopping item recipe reference is malformed.');
    }
    if (
      reference?.quantity != null &&
      (!Number.isFinite(reference.quantity) || reference.quantity <= 0)
    ) {
      throw new CookingValidationError('Shopping item recipe quantity is malformed.');
    }
    if (
      reference?.servings != null &&
      (!Number.isFinite(reference.servings) || reference.servings <= 0)
    ) {
      throw new CookingValidationError('Shopping item recipe servings are malformed.');
    }
  }
}

export function assertShoppingMutationId(mutationId: string): void {
  if (!mutationId || mutationId.length > 160) {
    throw new CookingValidationError('Shopping mutation identifier is malformed.');
  }
}

export function assertShoppingPatch(patch: UpdateShoppingItemRequest): void {
  if (!patch || !Object.keys(patch).length) {
    throw new CookingValidationError('Shopping item update is empty.');
  }
  if (Object.keys(patch).some((field) => !patchFields.has(field))) {
    throw new CookingValidationError('Shopping item update is malformed.');
  }
  if (patch.displayName != null && !patch.displayName.trim()) {
    throw new CookingValidationError('Shopping item name is required.');
  }
  if (patch.quantity != null && (!Number.isFinite(patch.quantity) || patch.quantity <= 0)) {
    throw new CookingValidationError('Shopping item quantity is malformed.');
  }
  if (patch.unit != null && (typeof patch.unit !== 'string' || patch.unit.length > 40)) {
    throw new CookingValidationError('Shopping item unit is malformed.');
  }
  if (
    patch.purchaseQuantity != null &&
    (typeof patch.purchaseQuantity !== 'string' || patch.purchaseQuantity.length > 80)
  ) {
    throw new CookingValidationError('Shopping purchase quantity is malformed.');
  }
  if (patch.note != null && (typeof patch.note !== 'string' || patch.note.length > 500)) {
    throw new CookingValidationError('Shopping item note is malformed.');
  }
  if (patch.purchased != null && typeof patch.purchased !== 'boolean') {
    throw new CookingValidationError('Shopping item purchased state is malformed.');
  }
  if (patch.optional != null && typeof patch.optional !== 'boolean') {
    throw new CookingValidationError('Shopping item optional state is malformed.');
  }
  if (patch.pantry != null && typeof patch.pantry !== 'boolean') {
    throw new CookingValidationError('Shopping item pantry state is malformed.');
  }
  if (patch.category != null && !ShoppingCategories.includes(patch.category)) {
    throw new CookingValidationError('Shopping item category is malformed.');
  }
  if (patch.categoryOverride != null && typeof patch.categoryOverride !== 'boolean') {
    throw new CookingValidationError('Shopping item category preference is malformed.');
  }
}
