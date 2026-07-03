import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import {
  cookingDraftSchema,
  savedRecipeSchema,
  cookingSessionSchema,
  cookingSessionEventSchema,
  guestLimitSchema,
  socialImportSchema,
  socialImportJobSchema,
  socialPlaylistSubscriptionSchema,
  socialTranscriptSchema,
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

export function createSocialImportModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(socialImportSchema);
  return (
    mongoose.models.SocialImport ||
    mongoose.model<t.ISocialImport>('SocialImport', socialImportSchema)
  );
}

export function createSocialImportJobModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(socialImportJobSchema);
  return (
    mongoose.models.SocialImportJob ||
    mongoose.model<t.ISocialImportJob>('SocialImportJob', socialImportJobSchema)
  );
}

export function createSocialTranscriptModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(socialTranscriptSchema);
  return (
    mongoose.models.SocialTranscript ||
    mongoose.model<t.ISocialTranscript>('SocialTranscript', socialTranscriptSchema)
  );
}

export function createSocialPlaylistSubscriptionModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(socialPlaylistSubscriptionSchema);
  return (
    mongoose.models.SocialPlaylistSubscription ||
    mongoose.model<t.ISocialPlaylistSubscription>(
      'SocialPlaylistSubscription',
      socialPlaylistSubscriptionSchema,
    )
  );
}

export function createGuestLimitModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.GuestLimit || mongoose.model<t.IGuestLimit>('GuestLimit', guestLimitSchema)
  );
}
