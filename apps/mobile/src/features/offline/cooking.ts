import type { ConversationCookingDocuments } from 'librechat-data-provider';

import { offlineDatabase } from './database';

export type OfflineWorkspaceState = {
  checked: Record<string, boolean>;
  notes: string;
  servings: number;
  timers: Record<
    string,
    { endsAt?: number; id: string; label: string; remaining: number; running: boolean }
  >;
  unitMode: 'original' | 'metric' | 'imperial';
  updatedAt: string;
};

type PayloadRow = { payload_json: string };

export async function cacheOfflineCookingDocuments(
  userId: string,
  conversationId: string,
  documents: ConversationCookingDocuments,
) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_cooking_documents
      (user_id, conversation_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, conversation_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    userId,
    conversationId,
    JSON.stringify(documents),
    new Date().toISOString(),
  );
}

export async function getOfflineCookingDocuments(userId: string, conversationId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<PayloadRow>(
    `SELECT payload_json FROM offline_cooking_documents
     WHERE user_id = ? AND conversation_id = ?`,
    userId,
    conversationId,
  );
  return row ? (JSON.parse(row.payload_json) as ConversationCookingDocuments) : null;
}

export async function getOfflineWorkspaceState(userId: string, workspaceId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<PayloadRow>(
    `SELECT payload_json FROM offline_workspace_state
     WHERE user_id = ? AND workspace_id = ?`,
    userId,
    workspaceId,
  );
  return row ? (JSON.parse(row.payload_json) as OfflineWorkspaceState) : null;
}

export async function cacheOfflineWorkspaceState(
  userId: string,
  workspaceId: string,
  state: OfflineWorkspaceState,
) {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_workspace_state (user_id, workspace_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, workspace_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    userId,
    workspaceId,
    JSON.stringify(state),
    new Date().toISOString(),
  );
}
