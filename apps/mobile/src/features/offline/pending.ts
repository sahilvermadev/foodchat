import { offlineDatabase } from './database';

export type PendingImport = {
  id: string;
  playlist: boolean;
  sourceUrl: string;
};

type PendingImportRow = {
  mutation_id: string;
  playlist: number;
  source_url: string;
};

export async function queuePendingImport(userId: string, pending: PendingImport) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO offline_import_mutations
      (mutation_id, user_id, source_url, playlist, created_at) VALUES (?, ?, ?, ?, ?)`,
    pending.id,
    userId,
    pending.sourceUrl,
    pending.playlist ? 1 : 0,
    new Date().toISOString(),
  );
}

export async function listPendingImports(userId: string) {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<PendingImportRow>(
    `SELECT mutation_id, source_url, playlist FROM offline_import_mutations
     WHERE user_id = ? ORDER BY created_at ASC`,
    userId,
  );
  return rows.map((row) => ({
    id: row.mutation_id,
    playlist: Boolean(row.playlist),
    sourceUrl: row.source_url,
  }));
}

export async function deletePendingImport(id: string) {
  const db = await offlineDatabase();
  await db.runAsync('DELETE FROM offline_import_mutations WHERE mutation_id = ?', id);
}

export async function failPendingImport(id: string, error: string) {
  const db = await offlineDatabase();
  await db.runAsync(
    `UPDATE offline_import_mutations SET attempts = attempts + 1, last_error = ?
     WHERE mutation_id = ?`,
    error.slice(0, 500),
    id,
  );
}
