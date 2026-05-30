import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '@librechat/data-schemas';

import type { StructuredRecipe } from 'librechat-data-provider';

import { deleteSavedRecipe, getRecipe, listRecipes, saveRecipe, updateSavedRecipe, parseServingsFromMarkdown } from './service';
import { categorizeRecipe } from './categorize';
import { illustrateRecipe } from './illustrate';

jest.mock('./categorize', () => ({
  categorizeRecipe: jest.fn(),
}));

jest.mock('./illustrate', () => ({
  illustrateRecipe: jest.fn(),
}));

jest.mock('../illustrations/media', () => ({
  decodeIllustrationDataUrl: jest.fn((url) => {
    if (url === 'data:image/png;base64,mockimagedata') {
      return { buffer: Buffer.from('mockimagedata'), contentType: 'image/png' };
    }
    return null;
  }),
  createIllustrationThumbnail: jest.fn(async (media) => ({
    buffer: Buffer.from('thumbnail'),
    contentType: 'image/webp',
  })),
}));

jest.setTimeout(60000);

let mongoServer: MongoMemoryServer | undefined;

function recipe(title: string): StructuredRecipe {
  return {
    title,
    description: '',
    servings: 2,
    timing: { prepMinutes: 5, cookMinutes: 10, totalMinutes: 15 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '2 tea bags',
        item: 'tea bags',
        quantityType: 'measured',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Brew the tea.',
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

const markdown = '# Thai Iced Tea\n\n## Ingredients\n\n- Tea\n\n## Instructions\n\n1. Brew tea.';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(categorizeRecipe).mockRejectedValue(new Error('skip categorization'));
  jest.mocked(illustrateRecipe).mockRejectedValue(new Error('skip illustration'));
});

afterEach(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('saved recipe title integrity', () => {
  test('canonicalizes a malformed supplied title and structured title from markdown', async () => {
    const saved = await saveRecipe('new-recipe-user', {
      title: '{',
      documentMarkdown: markdown,
      recipe: recipe('{'),
    });

    expect(saved.title).toBe('Thai Iced Tea');
    expect(saved.recipe?.title).toBe('Thai Iced Tea');

    const persisted = await mongoose.models.SavedRecipe.findById(saved._id).lean();
    expect(persisted?.title).toBe('Thai Iced Tea');
    expect(persisted?.recipe.title).toBe('Thai Iced Tea');
  });

  test('does not replace a valid title with a wrapper-only markdown heading', async () => {
    const saved = await saveRecipe('invalid-heading-user', {
      title: 'Thai Iced Tea',
      documentMarkdown: markdown.replace('# Thai Iced Tea', '# {'),
      recipe: recipe('Thai Iced Tea'),
    });

    expect(saved.title).toBe('Thai Iced Tea');
    expect(saved.recipe?.title).toBe('Thai Iced Tea');
  });

  test('repairs legacy wrapper titles when listing saved recipes', async () => {
    const created = await mongoose.models.SavedRecipe.create({
      user: 'legacy-recipe-user',
      title: '{',
      documentMarkdown: markdown,
      recipe: recipe('{'),
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      categorizationVersion: 1,
    });

    const result = await listRecipes('legacy-recipe-user', {});

    expect(result.recipes[0]?.title).toBe('Thai Iced Tea');
    const repaired = await mongoose.models.SavedRecipe.findById(created._id).lean();
    expect(repaired?.title).toBe('Thai Iced Tea');
    expect(repaired?.recipe.title).toBe('Thai Iced Tea');
  });
});

describe('saved cooking document types', () => {
  test('stores guides without recipe categorization while scheduling a library illustration', async () => {
    const guide = await saveRecipe('guide-user', {
      title: 'Sourdough Starter Guide',
      documentType: 'guide',
      documentMarkdown: markdown.replace('Thai Iced Tea', 'Sourdough Starter Guide'),
      recipe: recipe('Sourdough Starter Guide'),
    });

    const result = await listRecipes('guide-user', { documentType: 'guide' });

    expect(guide.documentType).toBe('guide');
    expect(guide.categorizationStatus).toBe('complete');
    expect(guide.illustrationStatus).toBe('pending');
    expect(result.recipes[0]?.documentType).toBe('guide');
    expect(categorizeRecipe).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(illustrateRecipe).toHaveBeenCalledTimes(1);
  });
});

describe('saved recipe deletion', () => {
  test('deletes only recipes belonging to the requesting user', async () => {
    const ownRecipe = await mongoose.models.SavedRecipe.create({
      user: 'owner-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      categorizationVersion: 1,
    });
    const otherRecipe = await mongoose.models.SavedRecipe.create({
      user: 'other-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      categorizationVersion: 1,
    });

    await expect(deleteSavedRecipe('owner-user', String(ownRecipe._id))).resolves.toBe(true);
    await expect(deleteSavedRecipe('owner-user', String(otherRecipe._id))).resolves.toBe(false);

    await expect(mongoose.models.SavedRecipe.findById(ownRecipe._id)).resolves.toBeNull();
    await expect(mongoose.models.SavedRecipe.findById(otherRecipe._id)).resolves.not.toBeNull();
  });
});

describe('saved recipe illustrations', () => {
  test('claims pending illustration work before a second list read can generate it again', async () => {
    let rejectIllustration: (() => void) | undefined;
    jest.mocked(illustrateRecipe).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectIllustration = () => reject(new Error('finish illustration job'));
        }),
    );
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'pending-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      illustrationStatus: 'pending',
      categorizationVersion: 1,
    });

    await listRecipes('pending-image-user', {});
    let generating = await mongoose.models.SavedRecipe.findById(stored._id).lean();
    for (
      let attempt = 0;
      attempt < 10 && generating?.illustrationStatus !== 'generating';
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      generating = await mongoose.models.SavedRecipe.findById(stored._id).lean();
    }
    expect(generating?.illustrationStatus).toBe('generating');

    await listRecipes('pending-image-user', {});
    expect(illustrateRecipe).toHaveBeenCalledTimes(1);

    rejectIllustration?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  test('does not retry a failed illustration while listing recipes', async () => {
    await mongoose.models.SavedRecipe.create({
      user: 'failed-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      illustrationStatus: 'failed',
      categorizationVersion: 1,
    });

    await listRecipes('failed-image-user', {});
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(illustrateRecipe).not.toHaveBeenCalled();
  });

  test('returns a media endpoint for complete detail records without exposing image storage', async () => {
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'detail-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      illustrationData: Buffer.from('illustration'),
      illustrationContentType: 'image/png',
      categorizationVersion: 1,
    });

    const result = await getRecipe('detail-image-user', String(stored._id));

    expect(result?.illustrationUrl).toContain(`/api/recipes/${stored._id}/illustration?v=`);
    expect(result).not.toHaveProperty('illustrationData');
  });

  test('preserves existing illustration when title is unchanged', async () => {
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'preserve-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      illustrationData: Buffer.from('illustration'),
      illustrationContentType: 'image/png',
      categorizationVersion: 1,
    });

    const updated = await updateSavedRecipe('preserve-image-user', String(stored._id), {
      documentMarkdown: markdown + '\n\nExtra instruction step.',
    });

    expect(updated?.title).toBe('Thai Iced Tea');
    expect(updated?.illustrationStatus).toBe('complete');
    expect(updated?.illustrationUrl).toContain(`/api/recipes/${stored._id}/illustration?v=`);

    const persisted = await mongoose.models.SavedRecipe.findById(stored._id).lean();
    expect(persisted?.illustrationStatus).toBe('complete');
    expect(persisted?.illustrationData).toBeDefined();
    expect(illustrateRecipe).not.toHaveBeenCalled();
  });

  test('resets and regenerates illustration when title is changed', async () => {
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'change-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      illustrationData: Buffer.from('illustration'),
      illustrationContentType: 'image/png',
      categorizationVersion: 1,
    });

    jest.mocked(illustrateRecipe).mockResolvedValueOnce({
      illustrationUrl: 'data:image/png;base64,mockimagedata',
      model: 'mock-model',
    });

    const updated = await updateSavedRecipe('change-image-user', String(stored._id), {
      title: 'Green Iced Tea',
      documentMarkdown: markdown.replace('Thai Iced Tea', 'Green Iced Tea'),
    });

    expect(updated?.title).toBe('Green Iced Tea');
    expect(updated?.illustrationStatus).toBe('pending');

    let persisted = await mongoose.models.SavedRecipe.findById(stored._id).lean();
    for (let attempt = 0; attempt < 30 && persisted?.illustrationStatus !== 'complete'; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      persisted = await mongoose.models.SavedRecipe.findById(stored._id).lean();
    }

    expect(persisted?.illustrationStatus).toBe('complete');
    expect(persisted?.illustrationData).toBeDefined();
    expect(illustrateRecipe).toHaveBeenCalledTimes(1);
  });
});

describe('servings parsing and serialization overrides', () => {
  test('parseServingsFromMarkdown extracts servings correctly from various formats', () => {
    expect(parseServingsFromMarkdown('- **Servings:** 4-5')).toBe(4);
    expect(parseServingsFromMarkdown('- Servings: 2')).toBe(2);
    expect(parseServingsFromMarkdown('* **Yield:** 3–4 servings')).toBe(3);
    expect(parseServingsFromMarkdown('- Servings: 6 rolls')).toBe(6);
    expect(parseServingsFromMarkdown('Some other text without servings')).toBeUndefined();
  });

  test('listRecipes and saveRecipe overrides/includes correct servings count', async () => {
    const user = 'servings-test-user';
    const testMarkdown = '# Test Recipe\n\n- **Servings:** 4\n\n## Ingredients\n- 1 cup oats\n\n## Instructions\n1. Cook oats';
    
    // Save recipe with servings count in markdown
    const saved = await saveRecipe(user, {
      title: 'Test Recipe',
      documentMarkdown: testMarkdown,
      recipe: {
        title: 'Test Recipe',
        description: '',
        servings: 2, // structured payload has 2
        timing: { prepMinutes: 5, cookMinutes: 10, totalMinutes: 15 },
        ingredients: [{ id: 'i1', originalText: '1 cup oats', item: 'oats', quantityType: 'measured' }],
        steps: [{ id: 's1', order: 1, text: 'Cook oats', ingredientIds: ['i1'], timers: [], warnings: [], tips: [] }],
        notes: [],
        tags: [],
      },
    });

    // Expect the persisted recipe to have the parsed servings count (4) instead of payload's default (2)
    expect(saved.recipe?.servings).toBe(4);

    // Query listRecipes and check if serializeSavedRecipeSummary returns the parsed servings count
    const list = await listRecipes(user, {});
    expect(list.recipes).toHaveLength(1);
    expect(list.recipes[0].servings).toBe(4);
  });
});
