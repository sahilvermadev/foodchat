import type { Document } from 'mongoose';
import type { ShoppingListItem, ShoppingRecipeReference } from 'librechat-data-provider';

export type PersistedShoppingListItem = ShoppingListItem & {
  recipeReferences?: ShoppingRecipeReference[];
};

export interface IShoppingList extends Document {
  user: string;
  name: string;
  items: PersistedShoppingListItem[];
  appliedMutationIds: string[];
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
