import { openDatabaseAsync } from 'expo-sqlite';

const database = openDatabaseAsync('rekky-offline-v1.db').then(async (db) => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS offline_recipes (
      user_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      detail_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, recipe_id)
    );

    CREATE INDEX IF NOT EXISTS offline_recipes_user_updated
      ON offline_recipes (user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS offline_imports (
      user_id TEXT NOT NULL,
      import_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, import_id)
    );

    CREATE INDEX IF NOT EXISTS offline_imports_user_created
      ON offline_imports (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS offline_playlists (
      user_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, playlist_id)
    );

    CREATE TABLE IF NOT EXISTS offline_sync_state (
      user_id TEXT NOT NULL,
      dataset TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (user_id, dataset)
    );

    CREATE TABLE IF NOT EXISTS offline_shopping_lists (
      user_id TEXT NOT NULL PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_shopping_mutations (
      mutation_id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS offline_shopping_mutations_user_created
      ON offline_shopping_mutations (user_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS offline_cooking_documents (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, conversation_id)
    );

    CREATE TABLE IF NOT EXISTS offline_workspace_state (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS offline_recipe_mutations (
      mutation_id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS offline_recipe_mutations_user_created
      ON offline_recipe_mutations (user_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS offline_import_mutations (
      mutation_id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      playlist INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS offline_import_mutations_user_url
      ON offline_import_mutations (user_id, source_url);

    CREATE TABLE IF NOT EXISTS offline_media (
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, url)
    );

    CREATE INDEX IF NOT EXISTS offline_media_user_updated
      ON offline_media (user_id, updated_at DESC);
  `);
  const shoppingColumns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(offline_shopping_mutations)',
  );
  const names = new Set(shoppingColumns.map((column) => column.name));
  if (!names.has('attempts')) {
    await db.execAsync(
      'ALTER TABLE offline_shopping_mutations ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!names.has('last_error')) {
    await db.execAsync('ALTER TABLE offline_shopping_mutations ADD COLUMN last_error TEXT');
  }
  return db;
});

export const offlineDatabase = () => database;

export async function clearOfflineUser(userId: string) {
  const db = await database;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM offline_recipes WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_imports WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_playlists WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_sync_state WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_shopping_lists WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_shopping_mutations WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_cooking_documents WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_workspace_state WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_recipe_mutations WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_import_mutations WHERE user_id = ?', userId);
    await transaction.runAsync('DELETE FROM offline_media WHERE user_id = ?', userId);
  });
}

export async function readLastSync(userId: string) {
  const db = await database;
  const row = await db.getFirstAsync<{ synced_at: string }>(
    'SELECT MAX(synced_at) AS synced_at FROM offline_sync_state WHERE user_id = ?',
    userId,
  );
  return row?.synced_at;
}

export async function readCompleteSync(userId: string) {
  const db = await database;
  const rows = await db.getAllAsync<{ dataset: string; synced_at: string }>(
    `SELECT dataset, synced_at FROM offline_sync_state
     WHERE user_id = ? AND dataset IN ('recipes', 'imports', 'playlists', 'shopping')`,
    userId,
  );
  if (new Set(rows.map((row) => row.dataset)).size < 4) return undefined;
  return rows.reduce(
    (oldest, row) => (row.synced_at < oldest ? row.synced_at : oldest),
    rows[0].synced_at,
  );
}

export async function readDatasetSync(userId: string, dataset: string) {
  const db = await database;
  const row = await db.getFirstAsync<{ synced_at: string }>(
    `SELECT synced_at FROM offline_sync_state WHERE user_id = ? AND dataset = ?`,
    userId,
    dataset,
  );
  return row?.synced_at;
}

export async function writeLastSync(userId: string, dataset: string, syncedAt: string) {
  const db = await database;
  await db.runAsync(
    `INSERT INTO offline_sync_state (user_id, dataset, synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, dataset) DO UPDATE SET synced_at = excluded.synced_at`,
    userId,
    dataset,
    syncedAt,
  );
}
