import type {
  SocialImport,
  SocialImportsQuery,
  SocialImportsResponse,
  SocialPlaylistSubscription,
  SocialPlaylistSubscriptionsResponse,
} from 'librechat-data-provider';

import { offlineDatabase, writeLastSync } from './database';

type PayloadRow = { payload_json: string };

const matchesView = (item: SocialImport, view: SocialImportsQuery['view']) => {
  if (!view || view === 'all') return true;
  if (view === 'processing') return item.status === 'processing';
  if (view === 'needs_help') return item.status === 'failed' || item.status === 'needs_review';
  if (view === 'saved') return item.status === 'saved_recipe';
  return item.status === 'draft_ready' || item.status === 'inspiration' || item.status === 'saved';
};

export async function replaceOfflineImports(
  userId: string,
  imports: SocialImport[],
  syncedAt: string,
) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM offline_imports WHERE user_id = ?', userId);
    for (const item of imports) {
      await transaction.runAsync(
        `INSERT INTO offline_imports (user_id, import_id, payload_json, created_at)
         VALUES (?, ?, ?, ?)`,
        userId,
        item._id,
        JSON.stringify(item),
        item.createdAt,
      );
    }
  });
  await writeLastSync(userId, 'imports', syncedAt);
}

export async function cacheOfflineImports(userId: string, imports: SocialImport[]) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const item of imports) {
      await transaction.runAsync(
        `INSERT INTO offline_imports (user_id, import_id, payload_json, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, import_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           created_at = excluded.created_at`,
        userId,
        item._id,
        JSON.stringify(item),
        item.createdAt,
      );
    }
  });
}

export async function listOfflineImports(
  userId: string,
  params: SocialImportsQuery,
): Promise<SocialImportsResponse> {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<PayloadRow>(
    `SELECT payload_json FROM offline_imports
     WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  );
  const query = params.q?.trim().toLowerCase();
  const imports = rows
    .map((row) => JSON.parse(row.payload_json) as SocialImport)
    .filter((item) => {
      if (params.provider && item.provider !== params.provider) return false;
      if (params.status && item.status !== params.status) return false;
      if (!matchesView(item, params.view)) return false;
      if (!query) return true;
      const searchable = [
        item.title,
        item.creatorName,
        item.canonicalUrl,
        item.extractedText,
        item.userSuppliedText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return query.split(/\s+/).every((term) => searchable.includes(term));
    });
  return { imports, total: imports.length };
}

export async function replaceOfflinePlaylists(
  userId: string,
  playlists: SocialPlaylistSubscription[],
  syncedAt: string,
) {
  const db = await offlineDatabase();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM offline_playlists WHERE user_id = ?', userId);
    for (const playlist of playlists) {
      await transaction.runAsync(
        `INSERT INTO offline_playlists (user_id, playlist_id, payload_json, updated_at)
         VALUES (?, ?, ?, ?)`,
        userId,
        playlist._id,
        JSON.stringify(playlist),
        playlist.updatedAt,
      );
    }
  });
  await writeLastSync(userId, 'playlists', syncedAt);
}

export async function listOfflinePlaylists(
  userId: string,
): Promise<SocialPlaylistSubscriptionsResponse> {
  const db = await offlineDatabase();
  const rows = await db.getAllAsync<PayloadRow>(
    `SELECT payload_json FROM offline_playlists
     WHERE user_id = ? ORDER BY updated_at DESC`,
    userId,
  );
  return {
    subscriptions: rows.map((row) => JSON.parse(row.payload_json) as SocialPlaylistSubscription),
  };
}
