import mongoose from 'mongoose';
import { createModels, migrateCookingDocuments } from '@librechat/data-schemas';
import type { StructuredRecipe } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  CookingValidationError,
  deleteCookingDocument,
  listCookingDocuments,
  selectCookingDocument,
  updateCookingDraft,
  generateCookingDraft,
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

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
  await mongoose.models.CookingDraft.syncIndexes();
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

    const persisted = await mongoose.models.CookingDraft.findById(draft._id).lean<{
      recipe: StructuredRecipe;
    }>();
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

  test('concurrent document creation leaves exactly one selected document', async () => {
    await Promise.all([
      generateCookingDraft(userA, 'First recipe', 'concurrent-conversation'),
      generateCookingDraft(userA, 'Second recipe', 'concurrent-conversation'),
    ]);

    const selected = await mongoose.models.CookingDraft.find({
      user: userA,
      conversationId: 'concurrent-conversation',
      selected: true,
    }).lean();
    expect(selected).toHaveLength(1);
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

  test('repairs legacy zero timing from generated markdown when drafts are read', async () => {
    const markdown = `# Tomato Soup

## Recipe Data
- **Servings:** 2
- **Prep time:** 10 minutes
- **Cook time:** 25 minutes
- **Total time:** 35 minutes

## Ingredients
- 4 tomatoes

## Instructions
1. Simmer the tomatoes until tender.`;
    const draft = await generateCookingDraft(
      userA,
      'tomato soup',
      'timing-conversation',
      markdown,
    );
    await mongoose.models.CookingDraft.updateOne(
      { _id: draft._id },
      { $set: { 'recipe.timing': { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 } } },
    );

    const collection = await listCookingDocuments(userA, 'timing-conversation');

    expect(collection.documents[0].recipe.timing).toEqual({
      prepMinutes: 10,
      cookMinutes: 25,
      totalMinutes: 35,
    });
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

  test('user isolation protects drafts', async () => {
    const draft = await generateCookingDraft(userA, 'lentil soup with rice');

    await expect(
      updateCookingDraft(userB, draft._id, editedRecipe(draft.recipe)),
    ).resolves.toBeNull();
  });
});
