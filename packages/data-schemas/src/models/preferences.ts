import type * as t from '~/types';
import { preferencesSchema } from '~/schema/preferences';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createPreferencesModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(preferencesSchema);
  return (
    mongoose.models.Preferences || mongoose.model<t.IPreferences>('Preferences', preferencesSchema)
  );
}
