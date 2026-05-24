import mongoose from 'mongoose';
import type { PreferencesDocument } from 'librechat-data-provider';
import type { IMessage } from '@librechat/data-schemas';
import {
  PREFERENCE_HEADINGS,
  applyPreferencePatch,
  isPreferenceHeading,
  renderPreferencesMarkdown,
} from './artifact';
import type { PreferenceHeading } from './artifact';
import { getPreferences, updatePreferences } from './service';

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type CompletionChoice = {
  message?: {
    content?: string | null;
  };
};

type CompletionResponse = {
  choices?: CompletionChoice[];
};

type PreferenceBatchMetadata = {
  status: 'pending' | 'processing' | 'processed' | 'failed';
  queuedAt?: string;
  claimedAt?: string;
  processedAt?: string;
  failedAt?: string;
  claimId?: string;
  reason?: string;
};

type MetadataCarrier = {
  metadata?: Record<string, unknown>;
};

type PendingMessage = {
  messageId: string;
  conversationId: string;
  parentMessageId?: string | null;
  text?: string;
  createdAt?: Date;
};

type PendingTurn = {
  messageId: string;
  conversationId: string;
  createdAt?: Date;
  userMessage: string;
  assistantMessage: string;
};

type CuratorDecision = {
  changed: boolean;
  reason: string;
  updatedSections: Partial<Record<PreferenceHeading, string>>;
  processedMessageIds: string[];
};

export type PreferenceBatchInput = {
  user: string;
  conversationId?: string;
  force?: boolean;
  maxTurns?: number;
  minTurns?: number;
  model?: string;
};

export type PreferenceBatchResult = {
  attempted: boolean;
  changed: boolean;
  processedCount: number;
  preferences?: PreferencesDocument;
  reason?: string;
  warnings: string[];
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';
const defaultMinTurns = 8;
const defaultMaxTurns = 16;
const maxMessageChars = 1200;
const processingStaleMs = 10 * 60 * 1000;
const pendingStatusPath = 'metadata.cookingPreferenceBatch.status';
const claimedAtPath = 'metadata.cookingPreferenceBatch.claimedAt';
const claimIdPath = 'metadata.cookingPreferenceBatch.claimId';

const curatorInstructions = `You are Mise's batch cooking profile curator.

You edit a saved cooking preference markdown document from a batch of unprocessed cooking chat turns.

Return only compact JSON:
{"changed":false,"reason":"","updatedSections":{},"processedMessageIds":["..."]}

Canonical sections:
Safety, Diet, Religious & Cultural Rules, Cooking Level, Household, Kitchen, Taste, Goals, Location, Personal Context

Rules:
- You are a profile editor, not a note taker. Most batches should produce no changes.
- Store only durable, reusable cooking data that will help future cooking support.
- Prefer compact, consolidated bullets over adding many narrow notes.
- Rewrite only affected sections. updatedSections values must be bullet markdown for the full section body, without the "## Heading" line.
- Include all reviewed user message ids in processedMessageIds, even when changed is false.
- Do not save one-off recipe requests, current projects, ingredients on hand today, educational curiosity, assistant suggestions, or tools the user is merely considering.
- Do not save "interested in learning...", "currently working on...", "attempting to master...", or "considering buying..." facts unless the user explicitly asks Mise to remember that exact long-term goal.
- When repeated project chat reveals a stable pattern, save only the broad durable pattern, e.g. "Enjoys occasional long kitchen projects for technique mastery."
- Save absence facts like no allergies, no dietary rules, or no religious restrictions only when the user directly says there are none.
- Never remove or weaken Safety preferences unless the user explicitly says the restriction is no longer true.
- Do not duplicate existing preference lines; merge, replace, or skip.
- Keep each saved line short, concrete, and reusable.`;

function apiKey(): string {
  return (
    process.env.PREFERENCES_AGENT_API_KEY ||
    process.env.COOKING_AGENT_API_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  );
}

function baseUrl(): string {
  return (
    process.env.PREFERENCES_AGENT_BASE_URL ||
    process.env.COOKING_AGENT_BASE_URL ||
    defaultBaseUrl
  ).replace(/\/+$/, '');
}

function selectedModel(model?: string): string {
  return (
    model?.trim() ||
    process.env.PREFERENCES_AGENT_MODEL ||
    process.env.COOKING_AGENT_MODEL ||
    defaultModel
  );
}

function requestTimeoutMs(): number {
  const value = Number(
    process.env.PREFERENCES_AGENT_TIMEOUT_MS || process.env.COOKING_AGENT_TIMEOUT_MS,
  );
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

function batchMinTurns(value?: number): number {
  if (Number.isFinite(value) && value && value > 0) {
    return Math.floor(value);
  }
  const configured = Number(process.env.PREFERENCES_BATCH_MIN_TURNS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : defaultMinTurns;
}

function batchMaxTurns(value?: number): number {
  if (Number.isFinite(value) && value && value > 0) {
    return Math.floor(value);
  }
  const configured = Number(process.env.PREFERENCES_BATCH_MAX_TURNS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : defaultMaxTurns;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function messageModel() {
  return mongoose.model<IMessage>('Message');
}

function cleanText(value: string | undefined): string {
  const clean = (value ?? '').trim().replace(/\s+/g, ' ');
  return clean.length > maxMessageChars ? `${clean.slice(0, maxMessageChars)}...` : clean;
}

function extractJson(text: string): Record<string, unknown> | null {
  const source =
    text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.match(/({[\s\S]*})/)?.[1] ?? text;
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeReason(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, 240);
}

function normalizeUpdatedSections(value: unknown): Partial<Record<PreferenceHeading, string>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.entries(value).reduce<Partial<Record<PreferenceHeading, string>>>(
    (sections, [heading, markdown]) => {
      if (!isPreferenceHeading(heading) || typeof markdown !== 'string') {
        return sections;
      }
      return { ...sections, [heading]: markdown };
    },
    {},
  );
}

function normalizeProcessedIds(value: unknown, allowedIds: string[]): string[] {
  if (!Array.isArray(value)) {
    return allowedIds;
  }
  const allowed = new Set(allowedIds);
  const ids = value.filter((id): id is string => typeof id === 'string' && allowed.has(id));
  return ids.length > 0 ? ids : allowedIds;
}

function parseDecision(content: string, reviewedIds: string[]): CuratorDecision | null {
  const parsed = extractJson(content);
  if (!parsed) {
    return null;
  }
  const updatedSections = normalizeUpdatedSections(parsed.updatedSections);
  const changed = parsed.changed === true && Object.keys(updatedSections).length > 0;
  return {
    changed,
    updatedSections,
    reason: normalizeReason(parsed.reason),
    processedMessageIds: normalizeProcessedIds(parsed.processedMessageIds, reviewedIds),
  };
}

function turnsTranscript(turns: PendingTurn[]): string {
  return turns
    .map((turn, index) =>
      [
        `Turn ${index + 1}`,
        `User message id: ${turn.messageId}`,
        `Conversation id: ${turn.conversationId}`,
        `User: ${cleanText(turn.userMessage)}`,
        turn.assistantMessage ? `Assistant: ${cleanText(turn.assistantMessage)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

function curatorMessages(preferencesMarkdown: string, turns: PendingTurn[]): ChatMessage[] {
  return [
    { role: 'system', content: curatorInstructions },
    {
      role: 'user',
      content: [
        'Current preference markdown:',
        renderPreferencesMarkdown(preferencesMarkdown).trim() || '(empty)',
        '',
        'Unprocessed cooking turns:',
        turnsTranscript(turns),
      ].join('\n'),
    },
  ];
}

async function complete(messages: ChatMessage[], model: string): Promise<string> {
  const key = apiKey();
  if (!key) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return '';
  }

  const body = (await response.json()) as CompletionResponse;
  return body.choices?.[0]?.message?.content?.trim() ?? '';
}

async function claimPendingTurns(input: PreferenceBatchInput): Promise<PendingTurn[]> {
  const Message = messageModel();
  const claimId = new mongoose.Types.ObjectId().toString();
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - processingStaleMs).toISOString();
  const claimableStatus = {
    $or: [
      { [pendingStatusPath]: 'pending' },
      {
        [pendingStatusPath]: 'processing',
        [claimedAtPath]: { $lt: staleBefore },
      },
    ],
  };
  const filter = {
    user: input.user,
    isCreatedByUser: true,
    error: { $ne: true },
    ...claimableStatus,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };
  const candidates = await Message.find(filter)
    .select('messageId conversationId text createdAt')
    .sort({ createdAt: 1 })
    .limit(batchMaxTurns(input.maxTurns))
    .lean<PendingMessage[]>();
  if (candidates.length === 0) {
    return [];
  }

  const candidateIds = candidates.map((message) => message.messageId);
  await Message.updateMany(
    {
      user: input.user,
      isCreatedByUser: true,
      error: { $ne: true },
      messageId: { $in: candidateIds },
      ...claimableStatus,
    },
    {
      $set: {
        [pendingStatusPath]: 'processing',
        [claimedAtPath]: claimedAt,
        [claimIdPath]: claimId,
      },
    },
  );

  const userMessages = await Message.find({
    user: input.user,
    isCreatedByUser: true,
    error: { $ne: true },
    [pendingStatusPath]: 'processing',
    [claimIdPath]: claimId,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  })
    .select('messageId conversationId text createdAt')
    .sort({ createdAt: 1 })
    .lean<PendingMessage[]>();
  if (userMessages.length === 0) {
    return [];
  }

  const parentIds = userMessages.map((message) => message.messageId);
  const assistantMessages = await Message.find({
    user: input.user,
    isCreatedByUser: false,
    parentMessageId: { $in: parentIds },
  })
    .select('parentMessageId text')
    .sort({ createdAt: 1 })
    .lean<PendingMessage[]>();
  const assistantsByParent = assistantMessages.reduce<Map<string, string>>((messages, message) => {
    const parentId = message.parentMessageId;
    if (!parentId || messages.has(parentId)) {
      return messages;
    }
    messages.set(parentId, message.text ?? '');
    return messages;
  }, new Map<string, string>());

  return userMessages.map((message) => ({
    messageId: message.messageId,
    conversationId: message.conversationId,
    createdAt: message.createdAt,
    userMessage: message.text ?? '',
    assistantMessage: assistantsByParent.get(message.messageId) ?? '',
  }));
}

async function releaseClaim(user: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  await messageModel().updateMany(
    { user, messageId: { $in: messageIds }, [pendingStatusPath]: 'processing' },
    {
      $set: { [pendingStatusPath]: 'pending' },
      $unset: {
        [claimedAtPath]: '',
        [claimIdPath]: '',
      },
    },
  );
}

async function markProcessed(user: string, messageIds: string[], reason: string): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  const metadata: PreferenceBatchMetadata = {
    status: 'processed',
    processedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
  await messageModel().updateMany(
    { user, messageId: { $in: messageIds } },
    { $set: { 'metadata.cookingPreferenceBatch': metadata } },
  );
}

async function markFailed(user: string, messageIds: string[], reason: string): Promise<void> {
  if (messageIds.length === 0) {
    return;
  }
  const metadata: PreferenceBatchMetadata = {
    status: 'failed',
    failedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
  await messageModel().updateMany(
    { user, messageId: { $in: messageIds } },
    { $set: { 'metadata.cookingPreferenceBatch': metadata } },
  );
}

export function withPendingPreferenceBatch<T extends MetadataCarrier>(
  message: T,
): T & { metadata: Record<string, unknown> } {
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const batch: PreferenceBatchMetadata = {
    status: 'pending',
    queuedAt: new Date().toISOString(),
  };
  return {
    ...message,
    metadata: {
      ...metadata,
      cookingPreferenceBatch: batch,
    },
  };
}

export function applyCuratedPreferenceSections(
  currentMarkdown: string,
  updatedSections: Partial<Record<PreferenceHeading, string>>,
): { markdown: string; changed: boolean; warnings: string[] } {
  return PREFERENCE_HEADINGS.reduce<{ markdown: string; changed: boolean; warnings: string[] }>(
    (state, heading) => {
      const markdown = updatedSections[heading];
      if (typeof markdown !== 'string') {
        return state;
      }
      const next = applyPreferencePatch(state.markdown, {
        op: 'set_section',
        heading,
        markdown,
      });
      return {
        markdown: next.markdown,
        changed: state.changed || next.changed,
        warnings: [...state.warnings, ...next.warnings],
      };
    },
    {
      markdown: renderPreferencesMarkdown(currentMarkdown),
      changed: false,
      warnings: [] as string[],
    },
  );
}

export async function curatePendingPreferences(
  input: PreferenceBatchInput,
): Promise<PreferenceBatchResult> {
  const turns = await claimPendingTurns(input);
  if (turns.length === 0) {
    return { attempted: false, changed: false, processedCount: 0, warnings: [] };
  }
  const reviewedIds = turns.map((turn) => turn.messageId);
  if (!input.force && turns.length < batchMinTurns(input.minTurns)) {
    await releaseClaim(input.user, reviewedIds);
    return { attempted: false, changed: false, processedCount: 0, warnings: [] };
  }

  const preferences = await getPreferences(input.user);
  const content = await complete(
    curatorMessages(preferences.markdown, turns),
    selectedModel(input.model),
  );
  if (!content) {
    const reason = 'Preference curator unavailable.';
    await markFailed(input.user, reviewedIds, reason);
    return {
      attempted: true,
      changed: false,
      processedCount: reviewedIds.length,
      preferences,
      reason,
      warnings: [reason],
    };
  }

  const decision = parseDecision(content, reviewedIds);
  if (!decision) {
    const reason = 'Preference curator returned malformed JSON.';
    await markFailed(input.user, reviewedIds, reason);
    return {
      attempted: true,
      changed: false,
      processedCount: reviewedIds.length,
      preferences,
      reason,
      warnings: [reason],
    };
  }

  const applied = decision.changed
    ? applyCuratedPreferenceSections(preferences.markdown, decision.updatedSections)
    : { markdown: preferences.markdown, changed: false, warnings: [] as string[] };
  const nextPreferences = applied.changed
    ? await updatePreferences(input.user, applied.markdown)
    : preferences;
  await markProcessed(input.user, decision.processedMessageIds, decision.reason);

  return {
    attempted: true,
    changed: applied.changed,
    processedCount: decision.processedMessageIds.length,
    preferences: nextPreferences,
    reason: decision.reason,
    warnings: applied.warnings,
  };
}
