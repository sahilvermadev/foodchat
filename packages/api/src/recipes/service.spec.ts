import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '@librechat/data-schemas';

import type { StructuredRecipe } from 'librechat-data-provider';

import {
  copyPublicRecipe,
  deleteSavedRecipe,
  getPublicProfile,
  getPublicRecipe,
  getRecipe,
  getRecipeFacets,
  listOfflineRecipes,
  listPublicRecipes,
  listRecipes,
  ownsRecipe,
  saveRecipe,
  updateSavedRecipe,
  parseServingsFromMarkdown,
} from './service';
import { categorizeRecipe } from './categorize';
import { illustrateRecipe } from './illustrate';
import { fetchRemoteImage } from '../illustrations/media';

type StoredRecipe = {
  title: string;
  recipe: StructuredRecipe;
  saveList: string;
  illustrationStatus: string;
  illustrationData?: Buffer;
};

async function findStoredRecipe(id: unknown): Promise<StoredRecipe | null> {
  return mongoose.models.SavedRecipe.findById(id).lean<StoredRecipe>();
}

jest.mock('./categorize', () => ({
  categorizeRecipe: jest.fn(),
}));

jest.mock('./illustrate', () => ({
  illustrateRecipe: jest.fn(),
}));

jest.mock('../illustrations/media', () => ({
  fetchRemoteImage: jest.fn(),
  decodeIllustrationDataUrl: jest.fn((url) => {
    if (url === 'data:image/png;base64,mockimagedata') {
      return { buffer: Buffer.from('mockimagedata'), contentType: 'image/png' };
    }
    return null;
  }),
  createIllustrationThumbnail: jest.fn(async (_media) => ({
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

const groupedMarkdown = `# Scallion Meatballs With Soy-Ginger Glaze

## Recipe Data
| Field | Value |
| --- | --- |
| Servings | 4 |
| Prep time | 15 minutes |
| Cook time | 20 minutes |

## Ingredients
### For the Soy-Ginger Glaze
| Ingredient | Metric | Imperial | State/Form | Notes |
| --- | --- | --- | --- | --- |
| Soy sauce | 30 ml | 2 tbsp | liquid | |
### For the Meatballs
| Ingredient | Metric | Imperial | State/Form | Notes |
| --- | --- | --- | --- | --- |
| Ground chicken | 450 g | 1 lb | chilled | |

## Instructions
1. Mix the chicken.
2. Bake the meatballs for 20 minutes.
`;

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
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('saved recipe title integrity', () => {
  test('canonicalizes a new Markdown-only recipe before saving', async () => {
    const saved = await saveRecipe('markdown-import-user', {
      documentMarkdown: groupedMarkdown,
    });

    expect(saved.recipe).toMatchObject({
      servings: 4,
      timing: { prepMinutes: 15, cookMinutes: 20, totalMinutes: 35 },
      ingredients: [
        { group: 'Soy-Ginger Glaze', item: 'Soy sauce' },
        { group: 'Meatballs', item: 'Ground chicken' },
      ],
    });
  });

  test('rejects incomplete recipe documents instead of persisting placeholders', async () => {
    await expect(
      saveRecipe('incomplete-import-user', {
        documentMarkdown: '# Incomplete\n\n## Ingredients\n\n- Salt',
      }),
    ).rejects.toThrow('structured ingredients and instructions');
  });

  test('repairs a legacy placeholder from grouped Markdown without another LLM call', async () => {
    const placeholder = recipe('Scallion Meatballs With Soy-Ginger Glaze');
    placeholder.timing = { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 };
    placeholder.ingredients = [
      { id: 'ingredient-1', item: 'item', originalText: '1 item', quantityType: 'estimated' },
    ];
    placeholder.steps = [
      {
        id: 'step-1',
        ingredientIds: ['ingredient-1'],
        order: 1,
        text: 'Prepare the recipe.',
        timers: [],
        tips: [],
        warnings: [],
      },
    ];
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'legacy-structure-user',
      title: placeholder.title,
      documentType: 'recipe',
      documentMarkdown: groupedMarkdown,
      recipe: placeholder,
      categorizationStatus: 'complete',
      categorizationVersion: 1,
      illustrationStatus: 'complete',
    });

    const repaired = await getRecipe('legacy-structure-user', String(stored._id));

    expect(repaired?.recipe?.ingredients).toEqual([
      expect.objectContaining({ group: 'Soy-Ginger Glaze', item: 'Soy sauce' }),
      expect.objectContaining({ group: 'Meatballs', item: 'Ground chicken' }),
    ]);
    expect(repaired?.categorizationVersion).toBe(2);
  });

  test('returns complete recipes for a durable offline snapshot', async () => {
    const saved = await saveRecipe('offline-recipe-user', {
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
    });

    const snapshot = await listOfflineRecipes('offline-recipe-user');

    expect(snapshot.syncedAt).toEqual(expect.any(String));
    expect(snapshot.recipes).toHaveLength(1);
    expect(snapshot.recipes[0]).toMatchObject({
      _id: saved._id,
      documentMarkdown: markdown,
      recipe: expect.objectContaining({ title: 'Thai Iced Tea' }),
    });
  });

  test('returns incremental recipe changes and deletion tombstones', async () => {
    const saved = await saveRecipe('offline-delta-user', {
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
    });
    const checkpoint = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await updateSavedRecipe('offline-delta-user', saved._id, { favorite: true });

    const changed = await listOfflineRecipes('offline-delta-user', { since: checkpoint });
    expect(changed.recipes).toEqual([expect.objectContaining({ _id: saved._id, favorite: true })]);

    const deletionCheckpoint = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await deleteSavedRecipe('offline-delta-user', saved._id);
    const deleted = await listOfflineRecipes('offline-delta-user', {
      since: deletionCheckpoint,
    });
    expect(deleted.deletedIds).toContain(saved._id);
    expect(deleted.recipes).toEqual([]);
  });

  test('finishes a pending recipe deletion before returning an offline delta', async () => {
    const user = 'offline-pending-delete-user';
    const saved = await saveRecipe(user, {
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
    });
    const checkpoint = new Date(Date.now() - 1000).toISOString();
    await mongoose.models.RecipeTombstone.create({
      deletedAt: new Date(),
      recipeId: saved._id,
      state: 'pending',
      user,
    });

    const delta = await listOfflineRecipes(user, { since: checkpoint });

    expect(delta.deletedIds).toContain(saved._id);
    expect(delta.recipes).toEqual([]);
    expect(await mongoose.models.SavedRecipe.exists({ _id: saved._id })).toBeNull();
  });

  test('paginates every recipe when multiple changes share a timestamp', async () => {
    const user = 'offline-recipe-pagination-user';
    const updatedAt = new Date('2026-07-29T10:00:00.000Z');
    const saved = await mongoose.models.SavedRecipe.insertMany(
      ['Tea one', 'Tea two', 'Tea three'].map((title) => ({
        categorizationStatus: 'complete',
        categorizationVersion: 1,
        createdAt: updatedAt,
        documentMarkdown: markdown.replaceAll('Thai Iced Tea', title),
        illustrationStatus: 'complete',
        recipe: recipe(title),
        saveList: 'want_to_cook',
        title,
        updatedAt,
        user,
      })),
    );

    const first = await listOfflineRecipes(user, {
      limit: 2,
      until: '2026-07-29T10:01:00.000Z',
    });
    const second = await listOfflineRecipes(user, {
      cursor: first.nextCursor,
      limit: 2,
      until: first.syncedAt,
    });

    expect(first.nextCursor).toBeDefined();
    expect([...first.recipes, ...second.recipes].map((item) => item._id).sort()).toEqual(
      saved.map((item) => String(item._id)).sort(),
    );
  });

  test('canonicalizes a malformed supplied title and structured title from markdown', async () => {
    const saved = await saveRecipe('new-recipe-user', {
      title: '{',
      documentMarkdown: markdown,
      recipe: recipe('{'),
    });

    expect(saved.title).toBe('Thai Iced Tea');
    expect(saved.recipe?.title).toBe('Thai Iced Tea');

    const persisted = await findStoredRecipe(saved._id);
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

  test('marks a matching social import as saved when saving from its draft', async () => {
    const thumbnailUrl = 'https://example.com/thumb.jpg';
    jest.mocked(fetchRemoteImage).mockResolvedValue({
      buffer: Buffer.from('source-image'),
      contentType: 'image/jpeg',
    });
    await mongoose.models.SocialImport.create({
      user: 'social-save-user',
      sourceUrl: 'https://example.com/recipe',
      canonicalUrl: 'https://example.com/recipe',
      provider: 'web',
      thumbnailUrl,
      embedHtmlAllowed: false,
      status: 'draft_ready',
      provenance: 'source_exact',
      draftId: 'draft-social-recipe',
      draftConversationId: 'conversation-social-recipe',
    });

    const saved = await saveRecipe('social-save-user', {
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      sourceDraftId: 'draft-social-recipe',
    });

    expect(saved.illustrationUrl).toMatch(/^\/api\/recipes\/[^/]+\/illustration\?v=/);
    expect(saved.illustrationStatus).toBe('complete');
    expect(fetchRemoteImage).toHaveBeenCalledWith(thumbnailUrl, {
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 5000,
    });

    const socialImport = await mongoose.models.SocialImport.findOne({
      user: 'social-save-user',
      draftId: 'draft-social-recipe',
    }).lean();

    expect(socialImport).toMatchObject({
      status: 'saved_recipe',
      savedRecipeId: saved._id,
      draftSummary: 'Saved to recipe library.',
    });

    const library = await listRecipes('social-save-user', {});
    expect(library.recipes[0]?.illustrationUrl).toMatch(
      /^\/api\/recipes\/[^/]+\/illustration\?v=.*&variant=thumbnail$/,
    );
    expect(illustrateRecipe).not.toHaveBeenCalled();
  });

  test('reuses a persisted social thumbnail without another remote request', async () => {
    await mongoose.models.SocialImport.create({
      user: 'persisted-social-image-user',
      sourceUrl: 'https://recipes.example/cake',
      canonicalUrl: 'https://recipes.example/cake',
      provider: 'web',
      thumbnailUrl: 'https://cdn.recipes.example/cake.jpg',
      thumbnailData: Buffer.from('persisted-source-image'),
      thumbnailContentType: 'image/jpeg',
      thumbnailThumbnail: Buffer.from('persisted-thumbnail'),
      embedHtmlAllowed: false,
      status: 'draft_ready',
      provenance: 'source_exact',
      draftId: 'persisted-social-image-draft',
    });

    const saved = await saveRecipe('persisted-social-image-user', {
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      sourceDraftId: 'persisted-social-image-draft',
    });
    const persisted = await mongoose.models.SavedRecipe.findById(saved._id);

    expect(fetchRemoteImage).not.toHaveBeenCalled();
    expect(Buffer.from(persisted?.illustrationData ?? []).toString()).toBe(
      'persisted-source-image',
    );
    expect(illustrateRecipe).not.toHaveBeenCalled();
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
    const repaired = await findStoredRecipe(created._id);
    expect(repaired?.title).toBe('Thai Iced Tea');
    expect(repaired?.recipe.title).toBe('Thai Iced Tea');
  });
});

describe('public recipe discovery', () => {
  test('exposes safe public recipes and profiles without a profile visibility gate', async () => {
    const User = mongoose.models.User;
    const [publicCook, privateCook] = await User.create([
      {
        email: 'public@example.com',
        provider: 'local',
        name: 'Mina',
        username: 'mina-cooks',
      },
      {
        email: 'private@example.com',
        provider: 'local',
        name: 'Private cook',
      },
    ]);

    const publicRecipe = await saveRecipe(String(publicCook._id), {
      title: 'Mina tea',
      documentMarkdown: markdown,
      recipe: recipe('Mina tea'),
    });
    const privateRecipe = await saveRecipe(String(privateCook._id), {
      title: 'Private tea',
      documentMarkdown: '# Private tea\n\n## Ingredients\n- Tea\n\n## Instructions\n1. Brew.',
      recipe: recipe('Private tea'),
    });

    const result = await listPublicRecipes(8);

    expect(result.recipes.map((item) => item._id)).toEqual(
      expect.arrayContaining([privateRecipe._id, publicRecipe._id]),
    );
    expect(result.recipes).toHaveLength(2);
    await expect(getPublicRecipe(publicRecipe._id)).resolves.toMatchObject({
      _id: publicRecipe._id,
      author: { name: 'Mina' },
    });
    await expect(getPublicRecipe(privateRecipe._id)).resolves.toMatchObject({
      _id: privateRecipe._id,
      author: { name: 'Private cook' },
    });
    await expect(getPublicProfile(String(publicCook._id))).resolves.toMatchObject({
      author: { name: 'Mina' },
      total: 1,
      recipes: [{ _id: publicRecipe._id, servings: 2, totalMinutes: 15 }],
    });
  });

  test('copies public content into an independently owned recipe and resets personal state', async () => {
    const User = mongoose.models.User;
    const [owner, recipient, nextRecipient] = await User.create([
      { email: 'copy-owner@example.com', provider: 'local', name: 'Owner' },
      { email: 'copy-recipient@example.com', provider: 'local', name: 'Recipient' },
      { email: 'copy-next@example.com', provider: 'local', name: 'Next recipient' },
    ]);
    const original = await saveRecipe(String(owner._id), {
      title: 'Shared tea',
      documentMarkdown: markdown,
      recipe: recipe('Shared tea'),
    });
    await updateSavedRecipe(String(owner._id), original._id, {
      favorite: true,
      pinned: true,
      personalNotes: 'Private note',
      collections: ['Private collection'],
      workspaceState: {
        servings: 4,
        unitMode: 'metric',
        checkedIngredientIds: ['ingredient-1'],
        timers: [],
      },
    });

    const copied = await copyPublicRecipe(String(recipient._id), original._id);
    const repeated = await copyPublicRecipe(String(recipient._id), original._id);

    expect(copied).toMatchObject({
      user: String(recipient._id),
      favorite: false,
      pinned: false,
      collections: [],
      lineage: {
        parentRecipeId: original._id,
        rootRecipeId: original._id,
        parentAuthor: { id: String(owner._id), name: 'Owner' },
      },
    });
    expect(copied?.personalNotes).toBeUndefined();
    expect(copied?.workspaceState).toBeUndefined();
    expect(repeated?._id).toBe(copied?._id);

    await expect(
      updateSavedRecipe(String(recipient._id), original._id, { title: 'Unauthorized edit' }),
    ).resolves.toBeNull();
    await updateSavedRecipe(String(recipient._id), copied?._id ?? '', { title: 'My tea' });
    await expect(getRecipe(String(owner._id), original._id)).resolves.toMatchObject({
      title: 'Thai Iced Tea',
    });

    const nextCopy = await copyPublicRecipe(String(nextRecipient._id), copied?._id ?? '');
    expect(nextCopy?.lineage).toMatchObject({
      parentRecipeId: copied?._id,
      rootRecipeId: original._id,
      parentAuthor: { id: String(recipient._id), name: 'Recipient' },
    });
  });
});

describe('saved recipe ownership', () => {
  test('checks ownership without loading or repairing the recipe', async () => {
    const saved = await saveRecipe('owner-user', {
      title: 'Owned recipe',
      documentMarkdown: markdown,
      recipe: recipe('Owned recipe'),
    });

    await expect(ownsRecipe('owner-user', saved._id)).resolves.toBe(true);
    await expect(ownsRecipe('different-user', saved._id)).resolves.toBe(false);
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

describe('saved recipe lists', () => {
  test('stores and filters want-to-cook and cooked-already recipes', async () => {
    const user = 'recipe-list-user';
    await saveRecipe(user, {
      title: 'Cooked Soup',
      documentType: 'guide',
      documentMarkdown: markdown.replace('Thai Iced Tea', 'Cooked Soup'),
      recipe: recipe('Cooked Soup'),
      saveList: 'cooked_already',
    });
    await saveRecipe(user, {
      title: 'Future Soup',
      documentType: 'guide',
      documentMarkdown: markdown.replace('Thai Iced Tea', 'Future Soup'),
      recipe: recipe('Future Soup'),
    });

    const cooked = await listRecipes(user, { saveList: 'cooked_already' });
    const wanted = await listRecipes(user, { saveList: 'want_to_cook' });

    expect(cooked.recipes).toHaveLength(1);
    expect(cooked.recipes[0]?.title).toBe('Cooked Soup');
    expect(cooked.recipes[0]?.saveList).toBe('cooked_already');
    expect(wanted.recipes).toHaveLength(1);
    expect(wanted.recipes[0]?.title).toBe('Future Soup');
    expect(wanted.recipes[0]?.saveList).toBe('want_to_cook');
  });

  test('repairs legacy recipes without a saved list into want-to-cook', async () => {
    const created = await mongoose.models.SavedRecipe.create({
      user: 'legacy-recipe-list-user',
      title: 'Legacy Soup',
      documentMarkdown: '# Legacy Soup',
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      categorizationVersion: 1,
    });
    await mongoose.models.SavedRecipe.updateOne(
      { _id: created._id },
      { $unset: { saveList: 1 } },
      { timestamps: false },
    );

    const cooked = await listRecipes('legacy-recipe-list-user', { saveList: 'cooked_already' });
    const wanted = await listRecipes('legacy-recipe-list-user', { saveList: 'want_to_cook' });
    const repaired = await findStoredRecipe(created._id);

    expect(cooked.recipes).toHaveLength(0);
    expect(wanted.recipes).toHaveLength(1);
    expect(wanted.recipes[0]?.saveList).toBe('want_to_cook');
    expect(repaired?.saveList).toBe('want_to_cook');
  });
});

describe('cookbook organization', () => {
  test('updates organization metadata without regenerating recipe assets', async () => {
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'organize-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      recipe: recipe('Thai Iced Tea'),
      categorizationStatus: 'complete',
      categorizationVersion: 4,
      illustrationStatus: 'complete',
      illustrationData: Buffer.from('illustration'),
    });

    const updated = await updateSavedRecipe('organize-user', String(stored._id), {
      collections: ['Drinks', 'Weekend'],
      favorite: true,
      personalNotes: 'Use less sugar next time.',
      pinned: true,
      saveList: 'cooked_already',
      workspaceState: {
        checkedIngredientIds: ['ingredient-1'],
        servings: 6,
        timers: [
          {
            endsAt: 2_000_000_000_000,
            id: 'timer-1',
            label: 'Bake',
            remaining: 300,
            running: true,
          },
        ],
        unitMode: 'metric',
      },
    });

    expect(updated).toMatchObject({
      collections: ['Drinks', 'Weekend'],
      favorite: true,
      personalNotes: 'Use less sugar next time.',
      pinned: true,
      saveList: 'cooked_already',
      workspaceState: {
        checkedIngredientIds: ['ingredient-1'],
        servings: 6,
        timers: [expect.objectContaining({ id: 'timer-1', running: true })],
        unitMode: 'metric',
        updatedAt: expect.any(String),
      },
      categorizationVersion: 4,
      illustrationStatus: 'complete',
    });
    expect(updated?.lastCookedAt).toEqual(expect.any(String));
    expect(categorizeRecipe).not.toHaveBeenCalled();
    expect(illustrateRecipe).not.toHaveBeenCalled();
  });

  test('returns normalized facets with whole-library counts and supports multi-select filters', async () => {
    await mongoose.models.SavedRecipe.create([
      {
        user: 'facets-user',
        title: 'Dal',
        documentMarkdown: '# Dal',
        collections: ['Weeknight'],
        categorization: {
          cuisine: ['Indian', 'Artisan'],
          mealType: ['Dinner'],
          diet: ['Vegan (Optional)'],
          difficulty: 'beginner',
          mainIngredients: ['Lentils'],
          source: 'llm',
          updatedAt: new Date(),
        },
        categorizationStatus: 'complete',
      },
      {
        user: 'facets-user',
        title: 'Pasta',
        documentMarkdown: '# Pasta',
        collections: ['Weeknight'],
        categorization: {
          cuisine: ['Italian'],
          mealType: ['Dinner'],
          difficulty: 'intermediate',
          mainIngredients: ['Tomato'],
          source: 'llm',
          updatedAt: new Date(),
        },
        categorizationStatus: 'complete',
      },
    ]);

    const facets = await getRecipeFacets('facets-user');
    const filtered = await listRecipes('facets-user', { cuisine: 'indian,italian' });

    expect(facets.total).toBe(2);
    expect(facets.collection).toContainEqual({ value: 'weeknight', count: 2 });
    expect(facets.cuisine).toEqual([
      { value: 'indian', count: 1 },
      { value: 'italian', count: 1 },
    ]);
    expect(facets.diet).toContainEqual({ value: 'vegan', count: 1 });
    expect(filtered.total).toBe(2);
  });
});

describe('saved recipe pagination', () => {
  test('returns a stable total while progressing through cursor pages', async () => {
    const user = 'pagination-user';
    const recipes = Array.from({ length: 35 }, (_, index) => ({
      user,
      title: `Recipe ${String(index).padStart(2, '0')}`,
      documentMarkdown: `# Recipe ${index}`,
      categorizationStatus: 'complete',
      illustrationStatus: 'complete',
      categorizationVersion: 1,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    }));
    await mongoose.models.SavedRecipe.insertMany(recipes);

    const first = await listRecipes(user, { limit: 30 });
    const second = await listRecipes(user, { limit: 30, cursor: first.nextCursor });

    expect(first.recipes).toHaveLength(30);
    expect(first.total).toBe(35);
    expect(first.nextCursor).toBeDefined();
    expect(second.recipes).toHaveLength(5);
    expect(second.total).toBe(35);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.recipes, ...second.recipes].map((item) => item._id)).size).toBe(35);
  });

  test('counts only recipes matching search and filters', async () => {
    const user = 'filtered-pagination-user';
    await mongoose.models.SavedRecipe.insertMany([
      {
        user,
        title: 'Fast Dal',
        documentMarkdown: '# Fast Dal',
        documentType: 'recipe',
        categorization: { cuisine: ['indian'], source: 'llm', updatedAt: new Date() },
        categorizationStatus: 'complete',
        illustrationStatus: 'complete',
        categorizationVersion: 1,
      },
      {
        user,
        title: 'Slow Dal',
        documentMarkdown: '# Slow Dal',
        documentType: 'recipe',
        categorization: { cuisine: ['indian'], source: 'llm', updatedAt: new Date() },
        categorizationStatus: 'complete',
        illustrationStatus: 'complete',
        categorizationVersion: 1,
      },
      {
        user,
        title: 'Fast Pasta',
        documentMarkdown: '# Fast Pasta',
        documentType: 'recipe',
        categorization: { cuisine: ['italian'], source: 'llm', updatedAt: new Date() },
        categorizationStatus: 'complete',
        illustrationStatus: 'complete',
        categorizationVersion: 1,
      },
    ]);

    const result = await listRecipes(user, { q: 'dal', cuisine: 'indian', limit: 1 });

    expect(result.recipes).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.nextCursor).toBeDefined();
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
  test('repairs generated artwork on legacy imported recipes from the persisted source image', async () => {
    await mongoose.models.SocialImport.create({
      user: 'legacy-import-image-user',
      sourceUrl: 'https://example.com/recipe',
      canonicalUrl: 'https://example.com/recipe',
      provider: 'web',
      thumbnailUrl: 'https://example.com/source.jpg',
      thumbnailData: Buffer.from('source-image'),
      thumbnailContentType: 'image/jpeg',
      thumbnailThumbnail: Buffer.from('source-thumbnail'),
      draftId: 'legacy-image-draft',
      embedHtmlAllowed: false,
      status: 'saved_recipe',
      provenance: 'source_exact',
    });
    const stored = await mongoose.models.SavedRecipe.create({
      user: 'legacy-import-image-user',
      title: 'Thai Iced Tea',
      documentMarkdown: markdown,
      sourceDraftId: 'legacy-image-draft',
      illustrationStatus: 'complete',
      illustrationModel: 'legacy-ai-model',
      illustrationData: Buffer.from('generated-image'),
      categorizationStatus: 'complete',
    });

    expect(
      await mongoose.models.SavedRecipe.countDocuments({
        user: 'legacy-import-image-user',
        sourceDraftId: { $exists: true, $ne: '' },
        illustrationModel: { $exists: true, $ne: '' },
      }),
    ).toBe(1);
    const sourceImport = await mongoose.models.SocialImport.findOne({
      draftId: 'legacy-image-draft',
    }).select('thumbnailData');
    expect(sourceImport?.thumbnailData?.length).toBeGreaterThan(0);

    await listRecipes('legacy-import-image-user', {});

    const repaired = await mongoose.models.SavedRecipe.findById(stored._id)
      .select('illustrationData illustrationModel illustrationUrl sourceUrl')
      .lean<{
        illustrationData?: Buffer;
        illustrationModel?: string;
        illustrationUrl?: string;
        sourceUrl?: string;
      }>();
    expect(repaired?.illustrationModel).toBeUndefined();
    expect(repaired?.sourceUrl).toBe('https://example.com/recipe');
    expect(repaired?.illustrationUrl).toBeUndefined();
    const repairedWithImage = await mongoose.models.SavedRecipe.findById(stored._id);
    expect(Buffer.from(repairedWithImage?.illustrationData ?? '').toString()).toBe('source-image');
  });

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
    let generating = await findStoredRecipe(stored._id);
    for (
      let attempt = 0;
      attempt < 10 && generating?.illustrationStatus !== 'generating';
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      generating = await findStoredRecipe(stored._id);
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

    const persisted = await findStoredRecipe(stored._id);
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

    let persisted = await findStoredRecipe(stored._id);
    for (
      let attempt = 0;
      attempt < 30 && persisted?.illustrationStatus !== 'complete';
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      persisted = await findStoredRecipe(stored._id);
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
    const testMarkdown =
      '# Test Recipe\n\n- **Servings:** 4\n\n## Ingredients\n- 1 cup oats\n\n## Instructions\n1. Cook oats';

    // Save recipe with servings count in markdown
    const saved = await saveRecipe(user, {
      title: 'Test Recipe',
      documentMarkdown: testMarkdown,
      recipe: {
        title: 'Test Recipe',
        description: '',
        servings: 2, // structured payload has 2
        timing: { prepMinutes: 5, cookMinutes: 10, totalMinutes: 15 },
        ingredients: [
          { id: 'i1', originalText: '1 cup oats', item: 'oats', quantityType: 'measured' },
        ],
        steps: [
          {
            id: 's1',
            order: 1,
            text: 'Cook oats',
            ingredientIds: ['i1'],
            timers: [],
            warnings: [],
            tips: [],
          },
        ],
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

  test('preserves a descriptive yield on recipe details', async () => {
    const user = 'yield-detail-user';
    const documentMarkdown =
      '# Scallion Meatballs\n\n- **Yield:** 24 meatballs\n\n## Ingredients\n- 1 lb turkey\n\n## Instructions\n1. Shape and cook the meatballs.';
    const saved = await saveRecipe(user, {
      title: 'Scallion Meatballs',
      documentMarkdown,
      recipe: {
        title: 'Scallion Meatballs',
        description: '',
        servings: 24,
        timing: { prepMinutes: 20, cookMinutes: 40, totalMinutes: 60 },
        ingredients: [
          {
            id: 'turkey',
            originalText: '1 lb turkey',
            item: 'turkey',
            quantity: 1,
            quantityType: 'measured',
            unit: 'lb',
          },
        ],
        steps: [
          {
            id: 'shape',
            order: 1,
            text: 'Shape and cook the meatballs.',
            ingredientIds: ['turkey'],
            timers: [],
            warnings: [],
            tips: [],
          },
        ],
        notes: [],
        tags: [],
      },
    });

    expect(saved.yield).toBe('24 meatballs');
    await expect(getRecipe(user, saved._id)).resolves.toMatchObject({ yield: '24 meatballs' });
  });
});
