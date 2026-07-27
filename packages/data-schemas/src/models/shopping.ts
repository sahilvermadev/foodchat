import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { shoppingListSchema } from '~/schema/shopping';

export function createShoppingListModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(shoppingListSchema);
  return (
    mongoose.models.ShoppingList ||
    mongoose.model<t.IShoppingList>('ShoppingList', shoppingListSchema)
  );
}
