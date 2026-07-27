import { Schema } from 'mongoose';
import type { IShoppingList } from '~/types';

const recipeReferenceSchema = new Schema(
  {
    recipeId: { type: String, required: true },
    recipeTitle: { type: String, required: true },
    ingredientId: { type: String, required: true },
    quantity: { type: Number },
    unit: { type: String },
    servings: { type: Number },
  },
  { _id: false },
);

const contributionSchema = new Schema(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: ['manual', 'recipe'], required: true },
    quantity: { type: Number },
    unit: { type: String },
    optional: { type: Boolean, default: false, required: true },
    recipeId: { type: String },
    recipeTitle: { type: String },
    ingredientId: { type: String },
    servings: { type: Number },
  },
  { _id: false },
);

const shoppingItemSchema = new Schema(
  {
    id: { type: String, required: true },
    canonicalName: { type: String, required: true },
    displayName: { type: String, required: true },
    quantity: { type: Number },
    unit: { type: String },
    purchaseQuantity: { type: String },
    category: {
      type: String,
      enum: [
        'produce',
        'bakery',
        'dairy',
        'meat_seafood',
        'pantry',
        'frozen',
        'beverages',
        'household',
        'other',
      ],
      default: 'other',
      required: true,
    },
    categoryOverride: { type: Boolean, default: false, required: true },
    purchased: { type: Boolean, default: false, required: true },
    note: { type: String },
    optional: { type: Boolean, default: false, required: true },
    pantry: { type: Boolean, default: false, required: true },
    contributions: { type: [contributionSchema], default: [] },
    recipeReferences: { type: [recipeReferenceSchema], default: undefined },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false },
);

export const shoppingListSchema = new Schema<IShoppingList>(
  {
    user: { type: String, required: true, index: true },
    name: { type: String, default: 'Shopping list', required: true },
    items: { type: [shoppingItemSchema], default: [] },
    appliedMutationIds: { type: [String], default: [] },
    tenantId: { type: String, index: true },
  },
  { optimisticConcurrency: true, timestamps: true },
);

shoppingListSchema.index({ user: 1, tenantId: 1 }, { unique: true });
