import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import {
  cookingDraftSchema,
  savedRecipeSchema,
  cookingSessionSchema,
  cookingSessionEventSchema,
} from '~/schema/cooking';

export function createCookingDraftModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(cookingDraftSchema);
  return (
    mongoose.models.CookingDraft ||
    mongoose.model<t.ICookingDraft>('CookingDraft', cookingDraftSchema)
  );
}

export function createCookingSessionModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(cookingSessionSchema);
  return (
    mongoose.models.CookingSession ||
    mongoose.model<t.ICookingSession>('CookingSession', cookingSessionSchema)
  );
}

export function createCookingSessionEventModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(cookingSessionEventSchema);
  return (
    mongoose.models.CookingSessionEvent ||
    mongoose.model<t.ICookingSessionEvent>('CookingSessionEvent', cookingSessionEventSchema)
  );
}

export function createSavedRecipeModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(savedRecipeSchema);
  return (
    mongoose.models.SavedRecipe || mongoose.model<t.ISavedRecipe>('SavedRecipe', savedRecipeSchema)
  );
}
