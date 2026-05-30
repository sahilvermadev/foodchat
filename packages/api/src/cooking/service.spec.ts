import mongoose from 'mongoose';
import { createModels, migrateCookingDocuments } from '@librechat/data-schemas';
import type { CookingSessionEvent, StructuredRecipe } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  CookingValidationError,
  deleteCookingDocument,
  getCookingSession,
  listCookingDocuments,
  selectCookingDocument,
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
  test('generate document persists durable selected recipe content', async () => {
    const draft = await generateCookingDraft(userA, '  chickpea curry  ');

    expect(draft.user).toBe(userA);
    expect(draft.prompt).toBe('chickpea curry');
    expect(draft.status).toBe('active');
    expect(draft.documentType).toBe('recipe');
    expect(draft.selected).toBe(true);
    expect(draft.recipe.title).toBe('chickpea curry');
    expect(draft.recipe.ingredients.length).toBeGreaterThan(0);
    expect(draft.recipe.steps.length).toBeGreaterThan(0);
    expect(draft.expiresAt).toBeUndefined();

    const saved = await mongoose.models.CookingDraft.findById(draft._id).lean();
    expect(saved).toMatchObject({
      user: userA,
      prompt: 'chickpea curry',
      status: 'active',
      documentType: 'recipe',
      selected: true,
    });
  });

  test('generate document accepts and persists a structured recipe when provided', async () => {
    const customRecipe: StructuredRecipe = {
      title: 'Custom tea',
      description: 'A special custom tea',
      servings: 4,
      timing: { prepMinutes: 2, cookMinutes: 3, totalMinutes: 5 },
      ingredients: [
        {
          id: 'custom-ingredient',
          originalText: '1 custom tea bag',
          item: 'custom tea bag',
          quantityType: 'measured',
          quantity: 1,
        },
      ],
      steps: [
        {
          id: 'custom-step',
          order: 1,
          text: 'Brew the custom tea.',
          ingredientIds: ['custom-ingredient'],
          timers: [],
          warnings: [],
          tips: [],
        },
      ],
      notes: ['Serve chilled'],
      tags: ['beverage'],
    };

    const draft = await generateCookingDraft(
      userA,
      'custom tea prompt',
      undefined,
      undefined,
      'recipe',
      customRecipe,
    );

    expect(draft.recipe.title).toBe('Custom tea');
    expect(draft.recipe.servings).toBe(4);
    expect(draft.recipe.ingredients[0].item).toBe('custom tea bag');
    expect(draft.recipe.steps[0].text).toBe('Brew the custom tea.');
    expect(draft.recipe.notes).toEqual(['Serve chilled']);
    expect(draft.recipe.tags).toEqual(['beverage']);

    const persisted = await mongoose.models.CookingDraft.findById(draft._id).lean();
    expect(persisted?.recipe.title).toBe('Custom tea');
    expect(persisted?.recipe.servings).toBe(4);
  });

  test('creates multiple documents and revisions target only one document', async () => {
    const guide = await generateCookingDraft(
      userA,
      'Sourdough starter',
      'conversation-1',
      undefined,
      'guide',
    );
    const bread = await generateCookingDraft(
      userA,
      'Basic bread',
      'conversation-1',
      undefined,
      'recipe',
    );
    await updateCookingDraft(
      userA,
      guide._id,
      undefined,
      '# Starter Guide\n\n## Ingredients\n\n- Flour\n\n## Instructions\n\n1. Feed.',
    );

    let collection = await listCookingDocuments(userA, 'conversation-1');
    expect(collection.documents).toHaveLength(2);
    expect(collection.selectedDocumentId).toBe(bread._id);
    expect(collection.documents.find((document) => document._id === guide._id)?.recipe.title).toBe(
      'Starter Guide',
    );
    expect(collection.documents.find((document) => document._id === bread._id)?.recipe.title).toBe(
      'Basic bread',
    );

    collection = (await selectCookingDocument(userA, guide._id))!;
    expect(collection.selectedDocumentId).toBe(guide._id);
    collection = (await deleteCookingDocument(userA, guide._id))!;
    expect(collection.selectedDocumentId).toBe(bread._id);
    expect(collection.documents).toHaveLength(1);
  });

  test('migrates non-expired legacy drafts into durable recipe documents', async () => {
    const recipe = (await generateCookingDraft(userA, 'base')).recipe;
    await mongoose.models.CookingDraft.deleteMany({});
    const collection = mongoose.connection.collection('cookingdrafts');
    await collection.insertMany([
      {
        user: userA,
        conversationId: 'legacy-conversation',
        prompt: 'older',
        status: 'active',
        recipe,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        user: userA,
        conversationId: 'legacy-conversation',
        prompt: 'newer',
        status: 'active',
        recipe,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
      },
      {
        user: userA,
        conversationId: 'legacy-conversation',
        prompt: 'already expired',
        status: 'active',
        recipe,
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date('2026-01-03'),
        updatedAt: new Date('2026-01-03'),
      },
    ]);
    await mongoose.connection.collection('savedrecipes').insertOne({
      user: userA,
      title: 'Legacy saved recipe',
      documentMarkdown: '# Legacy\n\n## Ingredients\n- Flour\n\n## Instructions\n1. Mix.',
    });
    await mongoose.connection.collection('savedrecipes').insertOne({
      user: userA,
      title: 'Legacy saved guide',
      documentType: 'guide',
      illustrationStatus: 'failed',
      documentMarkdown: '# Guide\n\nMaintain a starter.',
    });

    const result = await migrateCookingDocuments(mongoose.connection);
    const migrated = await listCookingDocuments(userA, 'legacy-conversation');
    const saved = await mongoose.connection
      .collection('savedrecipes')
      .findOne({ title: 'Legacy saved recipe' });
    const savedGuide = await mongoose.connection
      .collection('savedrecipes')
      .findOne({ title: 'Legacy saved guide' });

    expect(result.migrated).toBe(2);
    expect(result.expiredDeleted).toBe(1);
    expect(result.savedMigrated).toBe(1);
    expect(result.illustrationsQueued).toBe(1);
    expect(saved?.documentType).toBe('recipe');
    expect(savedGuide?.illustrationStatus).toBe('pending');
    expect(migrated.documents.every((document) => document.documentType === 'recipe')).toBe(true);
    expect(migrated.documents.every((document) => !document.expiresAt)).toBe(true);
    expect(
      migrated.documents.find((document) => document._id === migrated.selectedDocumentId)?.prompt,
    ).toBe('newer');
  });

  test('uses a markdown heading as the canonical title for generated drafts', async () => {
    const draft = await generateCookingDraft(
      userA,
      '{',
      undefined,
      '# Thai Iced Tea\n\n## Ingredients\n\n- Tea\n\n## Instructions\n\n1. Brew tea.',
    );

    expect(draft.prompt).toBe('{');
    expect(draft.recipe.title).toBe('Thai Iced Tea');
  });

  test('does not use a wrapper-only markdown heading as a recipe title', async () => {
    const draft = await generateCookingDraft(
      userA,
      'Thai Iced Tea',
      undefined,
      '# {\n\n## Ingredients\n\n- Tea\n\n## Instructions\n\n1. Brew tea.',
    );

    expect(draft.recipe.title).toBe('Thai Iced Tea');
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

  test('syncs a structured recipe title when updated markdown changes its heading', async () => {
    const draft = await generateCookingDraft(userA, 'placeholder recipe');
    const updated = await updateCookingDraft(
      userA,
      draft._id,
      undefined,
      '# Corrected Recipe Title\n\n## Ingredients\n\n- Item\n\n## Instructions\n\n1. Cook.',
    );

    expect(updated?.recipe.title).toBe('Corrected Recipe Title');
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
