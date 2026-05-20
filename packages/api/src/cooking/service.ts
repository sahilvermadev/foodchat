import mongoose from 'mongoose';
import type {
  CookingDraft,
  CookingSession,
  CookingSessionEvent,
  StructuredRecipe,
} from 'librechat-data-provider';
import type { ICookingDraft, ICookingSession } from '@librechat/data-schemas';
import { reduceSessionEvent } from './reducer';
import { CookingValidationError, normalizeRecipe } from './validation';

const draftTtlMs = 1000 * 60 * 60 * 24 * 14;

function idOf(doc: { _id: unknown }): string {
  return String(doc._id);
}

function iso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function serializeStructuredRecipe(recipe: StructuredRecipe): StructuredRecipe {
  return normalizeRecipe(recipe);
}

function models() {
  return {
    Draft: mongoose.model<ICookingDraft>('CookingDraft'),
    Session: mongoose.model<ICookingSession>('CookingSession'),
    Event: mongoose.model('CookingSessionEvent'),
  };
}

function serializeDraft(draft: ICookingDraft): CookingDraft {
  return {
    _id: idOf(draft),
    user: draft.user,
    ...(draft.conversationId ? { conversationId: draft.conversationId } : {}),
    prompt: draft.prompt,
    status: draft.status,
    ...(draft.documentMarkdown ? { documentMarkdown: draft.documentMarkdown } : {}),
    recipe: serializeStructuredRecipe(draft.recipe),
    expiresAt: iso(draft.expiresAt),
    createdAt: iso(draft.createdAt),
    updatedAt: iso(draft.updatedAt),
  };
}

function serializeSession(session: ICookingSession): CookingSession {
  return {
    _id: idOf(session),
    user: session.user,
    status: session.status,
    currentStepIndex: session.currentStepIndex,
    ...(session.draftId ? { draftId: session.draftId } : {}),
    recipeSnapshot: serializeStructuredRecipe(session.recipeSnapshot),
    summary: {
      notes: [...session.summary.notes],
      substitutions: session.summary.substitutions.map((substitution) => ({
        ...(substitution.ingredientId ? { ingredientId: substitution.ingredientId } : {}),
        text: substitution.text,
      })),
      problems: [...session.summary.problems],
      ...(session.summary.rating ? { rating: session.summary.rating } : {}),
      ...(session.summary.reviewNote ? { reviewNote: session.summary.reviewNote } : {}),
    },
    startedAt: iso(session.startedAt),
    ...(session.completedAt ? { completedAt: iso(session.completedAt) } : {}),
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
  };
}

function assertPrompt(prompt: string): string {
  const clean = prompt.trim();
  if (!clean) {
    throw new CookingValidationError('Prompt is required.');
  }
  return clean;
}

function blankRecipe(title: string): StructuredRecipe {
  return {
    title:
      title
        .split('\n')
        .find(Boolean)
        ?.replace(/^#+\s*/, '')
        .slice(0, 80) || 'Recipe',
    description: '',
    servings: 2,
    timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '1 item',
        item: 'item',
        quantityType: 'estimated',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Prepare the recipe.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
    ],
    notes: [],
    tags: [],
  };
}

export async function generateCookingDraft(
  user: string,
  prompt: string,
  conversationId?: string,
  documentMarkdown?: string,
): Promise<CookingDraft> {
  const { Draft } = models();
  const cleanPrompt = assertPrompt(prompt);
  const recipe = normalizeRecipe(blankRecipe(cleanPrompt));
  const cleanDocumentMarkdown = documentMarkdown?.trim();
  const payload = {
    user,
    ...(conversationId ? { conversationId } : {}),
    prompt: cleanPrompt,
    status: 'active',
    ...(cleanDocumentMarkdown ? { documentMarkdown: cleanDocumentMarkdown } : {}),
    recipe,
    expiresAt: new Date(Date.now() + draftTtlMs),
  };
  const draft = conversationId
    ? await Draft.findOneAndUpdate(
        { user, conversationId, status: 'active' },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
    : await Draft.create(payload);
  return serializeDraft(draft);
}

export async function getCookingDraftByConversation(
  user: string,
  conversationId: string,
): Promise<CookingDraft | null> {
  const { Draft } = models();
  const draft = await Draft.findOne({
    user,
    conversationId,
    status: 'active',
    expiresAt: { $gt: new Date() },
  }).sort({ updatedAt: -1 });
  return draft ? serializeDraft(draft) : null;
}

export async function updateCookingDraft(
  user: string,
  draftId: string,
  recipe?: StructuredRecipe,
  documentMarkdown?: string,
): Promise<CookingDraft | null> {
  const { Draft } = models();
  const set: Partial<Pick<ICookingDraft, 'recipe' | 'documentMarkdown'>> = {};
  if (recipe) {
    set.recipe = normalizeRecipe(recipe);
  }
  if (typeof documentMarkdown === 'string') {
    set.documentMarkdown = documentMarkdown.trim();
  }
  if (!set.recipe && set.documentMarkdown == null) {
    throw new CookingValidationError('Draft update is empty.');
  }
  const draft = await Draft.findOneAndUpdate(
    { _id: draftId, user, status: 'active' },
    { $set: set },
    { new: true },
  );
  return draft ? serializeDraft(draft) : null;
}

export async function startCookingSession(params: {
  user: string;
  draftId: string;
}): Promise<CookingSession | null> {
  const { Draft, Session } = models();
  const draft = await Draft.findOne({ _id: params.draftId, user: params.user, status: 'active' });
  if (!draft) {
    return null;
  }

  const session = await Session.create({
    user: params.user,
    status: 'active',
    currentStepIndex: 0,
    draftId: idOf(draft),
    recipeSnapshot: draft.recipe,
    summary: { notes: [], substitutions: [], problems: [] },
    startedAt: new Date(),
  });
  return serializeSession(session);
}

export async function getCookingSession(
  user: string,
  sessionId: string,
): Promise<CookingSession | null> {
  const { Session } = models();
  const session = await Session.findOne({ _id: sessionId, user });
  return session ? serializeSession(session) : null;
}

export async function appendCookingSessionEvent(params: {
  user: string;
  sessionId: string;
  event: CookingSessionEvent;
}): Promise<CookingSession | null> {
  const { Session, Event } = models();
  const session = await Session.findOne({ _id: params.sessionId, user: params.user });
  if (!session) {
    return null;
  }
  const serialized = serializeSession(session);
  const next = reduceSessionEvent(serialized, params.event);
  await Event.create({
    user: params.user,
    sessionId: params.sessionId,
    stepIndex: 'stepIndex' in params.event ? params.event.stepIndex : undefined,
    event: params.event,
  });
  session.currentStepIndex = next.currentStepIndex;
  session.summary = next.summary;
  session.status = next.status;
  await session.save();
  return serializeSession(session);
}

export async function completeCookingSession(params: {
  user: string;
  sessionId: string;
  rating: number;
  note: string;
}): Promise<CookingSession | null> {
  const rating = Math.max(1, Math.min(5, Number(params.rating)));
  const session = await appendCookingSessionEvent({
    user: params.user,
    sessionId: params.sessionId,
    event: { type: 'review', rating, note: params.note.trim() },
  });
  if (!session) {
    return null;
  }
  const { Session } = models();
  const completed = await Session.findOneAndUpdate(
    { _id: params.sessionId, user: params.user },
    { $set: { status: 'completed', completedAt: new Date() } },
    { new: true },
  );
  return completed ? serializeSession(completed) : null;
}

export { CookingValidationError };
