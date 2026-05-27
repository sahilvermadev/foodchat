import { Schema } from 'mongoose';
import type { ISpecialtyIngredient } from '~/types';

export const specialtyIngredientSchema = new Schema<ISpecialtyIngredient>(
  {
    canonicalName: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        'Condiments & Sauces',
        'Cheese & Dairy',
        'Preserved & Pickled',
        'Freezer',
        'Meat & Protein',
        'Other',
      ],
      required: true,
      default: 'Other',
    },
    aliases: { type: [String], default: [] },
    imageStatus: {
      type: String,
      enum: ['pending', 'generating', 'ready', 'failed'],
      required: true,
      default: 'pending',
    },
    imageUrl: { type: String, default: '' },
    imageData: { type: Buffer },
    imageContentType: { type: String },
    imageThumbnail: { type: Buffer },
    imagePrompt: { type: String, default: '' },
    imageStyle: { type: String, required: true },
    imageModel: { type: String },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

specialtyIngredientSchema.index(
  { normalizedName: 1, imageStyle: 1, tenantId: 1 },
  { unique: true },
);
specialtyIngredientSchema.index({ aliases: 1, imageStyle: 1, tenantId: 1 });
specialtyIngredientSchema.index({ displayName: 1, tenantId: 1 });
