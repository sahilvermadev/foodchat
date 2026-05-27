import type { Document } from 'mongoose';
import type {
  SpecialtyIngredientCategory,
  SpecialtyIngredientImageStatus,
} from 'librechat-data-provider';

export interface ISpecialtyIngredient extends Document {
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  category: SpecialtyIngredientCategory;
  aliases: string[];
  imageStatus: SpecialtyIngredientImageStatus;
  imageUrl?: string;
  imageData?: Buffer;
  imageContentType?: string;
  imageThumbnail?: Buffer;
  imagePrompt?: string;
  imageStyle: string;
  imageModel?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
