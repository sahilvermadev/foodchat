export const ShoppingCategories = [
  'produce',
  'bakery',
  'dairy',
  'meat_seafood',
  'pantry',
  'frozen',
  'beverages',
  'household',
  'other',
] as const;

export type ShoppingCategory = (typeof ShoppingCategories)[number];

export type ShoppingRecipeReference = {
  recipeId: string;
  recipeTitle: string;
  ingredientId: string;
  quantity?: number;
  unit?: string;
  servings?: number;
};

export type ShoppingContribution = {
  id: string;
  kind: 'manual' | 'recipe';
  quantity?: number;
  unit?: string;
  optional: boolean;
  recipeId?: string;
  recipeTitle?: string;
  ingredientId?: string;
  servings?: number;
};

export type ShoppingListItem = {
  id: string;
  canonicalName: string;
  displayName: string;
  quantity?: number;
  unit?: string;
  purchaseQuantity?: string;
  category: ShoppingCategory;
  categoryOverride: boolean;
  purchased: boolean;
  note?: string;
  optional: boolean;
  pantry: boolean;
  contributions: ShoppingContribution[];
  createdAt: string;
  updatedAt: string;
};

export type ShoppingList = {
  _id: string;
  name: string;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
};

export type LegacyShoppingListItem = Omit<
  ShoppingListItem,
  'categoryOverride' | 'contributions'
> & {
  categoryOverride?: boolean;
  contributions?: ShoppingContribution[];
  recipeReferences?: ShoppingRecipeReference[];
};

export type LegacyShoppingList = Omit<ShoppingList, 'items'> & {
  items: LegacyShoppingListItem[];
};

export type AddShoppingItemInput = {
  id?: string;
  displayName: string;
  quantity?: number;
  unit?: string;
  purchaseQuantity?: string;
  category?: ShoppingCategory;
  categoryOverride?: boolean;
  note?: string;
  optional?: boolean;
  pantry?: boolean;
  contributionId?: string;
  recipeReference?: ShoppingRecipeReference;
};

export type AddShoppingItemsRequest = { items: AddShoppingItemInput[]; mutationId: string };

export type RemoveShoppingContributionRequest = { mutationId: string };

export type UpdateShoppingItemRequest = Partial<
  Pick<
    ShoppingListItem,
    | 'displayName'
    | 'quantity'
    | 'unit'
    | 'purchaseQuantity'
    | 'category'
    | 'categoryOverride'
    | 'purchased'
    | 'note'
    | 'optional'
    | 'pantry'
  >
>;
