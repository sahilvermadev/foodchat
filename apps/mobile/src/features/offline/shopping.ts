import type { LegacyShoppingList, ShoppingList } from 'librechat-data-provider';
import { normalizeShoppingList } from 'librechat-data-provider/mobile';
import type { OfflineShoppingMutation } from '@/features/shopping/model';
import { offlineDatabase, writeLastSync } from './database';

type MutationRow = { mutation_id: string; payload_json: string };
type ShoppingRow = { payload_json: string };

export async function cacheOfflineShoppingList(userId: string, list: ShoppingList) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_shopping_lists (user_id, payload_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    userId,
    JSON.stringify(list),
    list.updatedAt,
  );
  await writeLastSync(userId, 'shopping', list.updatedAt);
}

export async function getOfflineShoppingList(userId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<ShoppingRow>(
    'SELECT payload_json FROM offline_shopping_lists WHERE user_id = ?',
    userId,
  );
  return row ? normalizeShoppingList(JSON.parse(row.payload_json) as LegacyShoppingList) : null;
}

export async function queueOfflineShoppingMutation(
  userId: string,
  mutationId: string,
  mutation: OfflineShoppingMutation,
) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_shopping_mutations (mutation_id, user_id, payload_json, created_at)
     VALUES (?, ?, ?, ?)`,
    mutationId,
    userId,
    JSON.stringify(mutation),
    new Date().toISOString(),
  );
}

export async function listOfflineShoppingMutations(userId: string) {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<MutationRow>(
    `SELECT mutation_id, payload_json FROM offline_shopping_mutations
     WHERE user_id = ? ORDER BY created_at ASC`,
    userId,
  );
  return rows.map((row) => {
    const mutation = JSON.parse(row.payload_json) as OfflineShoppingMutation;
    if (!mutation.id) mutation.id = row.mutation_id;
    if (mutation.type === 'add' && !mutation.request.mutationId) {
      mutation.request.mutationId = mutation.id;
    }
    if (mutation.type === 'add') {
      mutation.request.items = mutation.request.items.map((item, index) => ({
        ...item,
        id: item.id ?? `${mutation.id}:item:${index}`,
        contributionId:
          item.contributionId ??
          (item.recipeReference ? undefined : `${mutation.id}:contribution:${index}`),
      }));
    }
    return { id: row.mutation_id, mutation };
  });
}

export async function countOfflineShoppingMutations(userId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM offline_shopping_mutations WHERE user_id = ?',
    userId,
  );
  return row?.count ?? 0;
}

export async function deleteOfflineShoppingMutation(mutationId: string) {
  const db = await offlineDatabase();
  await db.runAsync('DELETE FROM offline_shopping_mutations WHERE mutation_id = ?', mutationId);
}
