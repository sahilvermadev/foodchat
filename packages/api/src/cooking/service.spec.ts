import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import type { CookingSessionEvent, StructuredRecipe } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  CookingValidationError,
  getCookingSession,
  updateCookingDraft,
  generateCookingDraft,
  completeCookingSession,
  startCookingSession,
  appendCookingSessionEvent,
} from './service';

jest.setTimeout(60000);

let mongoServer: MongoMemoryServer | undefined;

const userA = 'user-a';
const userB = 'user-b';

function editedRecipe(recipe: StructuredRecipe): StructuredRecipe {
  return {
    ...recipe,
    title: 'Edited lentil soup',
    ingredients: [
      {
        ...recipe.ingredients[0],
        id: '',
        originalText: '',
        item: 'red lentils',
      },
    ],
    steps: [
      {
        ...recipe.steps[0],
        id: '',
        order: 12,
        text: 'Simmer until the lentils are soft.',
        ingredientIds: [recipe.ingredients[0].id, 'missing-ingredient'],
      },
    ],
    notes: ['  Serve hot  ', ''],
    tags: [' dinner ', ''],
  };
}

async function createStartedSession(user = userA) {
  const draft = await generateCookingDraft(user, 'lentil soup with rice');
  const session = await startCookingSession({ user, draftId: draft._id });
  if (!session) {
    throw new Error('Expected cooking session to start.');
  }
  return { draft, session };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('cooking service', () => {
  test('generate draft persists user, prompt, active status, recipe content, and expiration', async () => {
    const before = Date.now();
    const draft = await generateCookingDraft(userA, '  chickpea curry  ');

    expect(draft.user).toBe(userA);
    expect(draft.prompt).toBe('chickpea curry');
    expect(draft.status).toBe('active');
    expect(draft.recipe.title).toBe('chickpea curry');
    expect(draft.recipe.ingredients.length).toBeGreaterThan(0);
    expect(draft.recipe.steps.length).toBeGreaterThan(0);
    expect(new Date(draft.expiresAt).getTime()).toBeGreaterThan(before);

    const saved = await mongoose.models.CookingDraft.findById(draft._id).lean();
    expect(saved).toMatchObject({
      user: userA,
      prompt: 'chickpea curry',
      status: 'active',
    });
  });

  test('update draft normalizes valid edits and rejects invalid recipes', async () => {
    const draft = await generateCookingDraft(userA, 'lentil soup');
    const updated = await updateCookingDraft(userA, draft._id, editedRecipe(draft.recipe));

    expect(updated?.recipe.title).toBe('Edited lentil soup');
    expect(updated?.recipe.ingredients[0]).toMatchObject({
      id: 'ingredient-1',
      item: 'red lentils',
      quantityType: 'estimated',
    });
    expect(updated?.recipe.steps[0]).toMatchObject({
      id: 'step-1',
      order: 1,
      ingredientIds: ['ingredient-1'],
    });
    expect(updated?.recipe.notes).toEqual(['Serve hot']);
    expect(updated?.recipe.tags).toEqual(['dinner']);

    await expect(
      updateCookingDraft(userA, draft._id, { ...draft.recipe, title: '   ' }),
    ).rejects.toThrow(CookingValidationError);
    await expect(
      updateCookingDraft(userA, draft._id, { ...draft.recipe, ingredients: [] }),
    ).rejects.toThrow(CookingValidationError);
    await expect(
      updateCookingDraft(userA, draft._id, { ...draft.recipe, steps: [] }),
    ).rejects.toThrow(CookingValidationError);
  });

  test('user isolation protects drafts and sessions', async () => {
    const { draft, session } = await createStartedSession(userA);

    await expect(
      updateCookingDraft(userB, draft._id, editedRecipe(draft.recipe)),
    ).resolves.toBeNull();
    await expect(getCookingSession(userB, session._id)).resolves.toBeNull();
    await expect(
      appendCookingSessionEvent({
        user: userB,
        sessionId: session._id,
        event: { type: 'note', text: 'Should not attach' },
      }),
    ).resolves.toBeNull();
  });

  test('start session from draft stores a snapshot without mutating the draft', async () => {
    const draft = await generateCookingDraft(userA, 'tomato pasta');
    const originalTitle = draft.recipe.title;
    const session = await startCookingSession({ user: userA, draftId: draft._id });

    expect(session).toMatchObject({
      user: userA,
      draftId: draft._id,
      status: 'active',
      currentStepIndex: 0,
      recipeSnapshot: draft.recipe,
      summary: { notes: [], substitutions: [], problems: [] },
    });

    await updateCookingDraft(userA, draft._id, {
      ...draft.recipe,
      title: 'Changed after session start',
    });
    const refetchedSession = await getCookingSession(userA, session?._id ?? '');
    const refetchedDraft = await mongoose.models.CookingDraft.findById(draft._id).lean();

    expect(refetchedSession?.recipeSnapshot.title).toBe(originalTitle);
    expect(refetchedDraft?.recipe.title).toBe('Changed after session start');
  });

  test('append events persists event docs and updates derived session state', async () => {
    const draft = await generateCookingDraft(userA, 'lentil soup with rice');
    const recipe = editedRecipe(draft.recipe);
    recipe.steps = [
      ...recipe.steps,
      {
        ...recipe.steps[0],
        id: 'step-2',
        order: 2,
        text: 'Serve with rice.',
        ingredientIds: ['ingredient-1'],
      },
    ];
    await updateCookingDraft(userA, draft._id, recipe);
    const session = await startCookingSession({ user: userA, draftId: draft._id });
    if (!session) {
      throw new Error('Expected cooking session to start.');
    }
    const events: CookingSessionEvent[] = [
      { type: 'navigation', action: 'next' },
      { type: 'note', stepIndex: 1, text: 'Add lemon at the end' },
      { type: 'substitution', ingredientId: 'ingredient-1', text: 'Used barley' },
      { type: 'timer', timerId: 'timer-1', action: 'started', durationSeconds: 300 },
      { type: 'problem', text: 'Needed a wider pot' },
    ];

    let current = session;
    for (const event of events) {
      const next = await appendCookingSessionEvent({
        user: userA,
        sessionId: session._id,
        event,
      });
      if (!next) {
        throw new Error('Expected event append to return a session.');
      }
      current = next;
    }

    expect(current.currentStepIndex).toBe(1);
    expect(current.summary.notes).toEqual(['Add lemon at the end']);
    expect(current.summary.substitutions).toEqual([
      { ingredientId: 'ingredient-1', text: 'Used barley' },
    ]);
    expect(current.summary.problems).toEqual(['Needed a wider pot']);

    const persisted = await mongoose.models.CookingSessionEvent.find({ sessionId: session._id })
      .sort({ createdAt: 1 })
      .lean();
    expect(persisted).toHaveLength(events.length);
    expect(persisted.map((eventDoc) => eventDoc.event.type)).toEqual([
      'navigation',
      'note',
      'substitution',
      'timer',
      'problem',
    ]);
    expect(persisted[1].stepIndex).toBe(1);
  });

  test('complete session stores review summary and completion timestamp', async () => {
    const { session } = await createStartedSession(userA);
    const completed = await completeCookingSession({
      user: userA,
      sessionId: session._id,
      rating: 5,
      note: 'Keeping this one.',
    });

    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBeDefined();
    expect(completed?.summary.rating).toBe(5);
    expect(completed?.summary.reviewNote).toBe('Keeping this one.');

    const reviewEvents = await mongoose.models.CookingSessionEvent.find({
      sessionId: session._id,
      'event.type': 'review',
    });
    expect(reviewEvents).toHaveLength(1);
  });
});
