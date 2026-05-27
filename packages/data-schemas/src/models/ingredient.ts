import type * as t from '~/types';
import { specialtyIngredientSchema } from '~/schema/ingredient';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createSpecialtyIngredientModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(specialtyIngredientSchema);
  return (
    mongoose.models.SpecialtyIngredient ||
    mongoose.model<t.ISpecialtyIngredient>('SpecialtyIngredient', specialtyIngredientSchema)
  );
}
