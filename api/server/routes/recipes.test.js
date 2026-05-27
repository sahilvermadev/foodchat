const express = require('express');
const request = require('supertest');

let mockCurrentUser;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockCurrentUser) {
      return res.sendStatus(401);
    }
    req.user = mockCurrentUser;
    return next();
  },
}));

jest.mock('@librechat/api', () => {
  class CookingValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CookingValidationError';
    }
  }

  return {
    CookingValidationError,
    deleteSavedRecipe: jest.fn(),
    getRecipe: jest.fn(),
    getRecipeByDraft: jest.fn(),
    getRecipeIllustration: jest.fn(),
    listRecipes: jest.fn(),
    saveRecipe: jest.fn(),
    updateSavedRecipe: jest.fn(),
  };
});

const recipesApi = require('@librechat/api');
const recipesRoutes = require('./recipes');

const user = { id: 'auth-user' };

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/recipes', recipesRoutes);
  return app;
}

function recipe() {
  return {
    title: 'Soup',
    description: '',
    servings: 2,
    timing: { prepMinutes: 5, cookMinutes: 20, totalMinutes: 25 },
    ingredients: [{ id: 'i1', originalText: '1 cup lentils', item: 'lentils' }],
    steps: [{ id: 's1', order: 1, text: 'Cook lentils.' }],
    notes: [],
    tags: [],
  };
}

describe('recipes routes', () => {
  let app;

  beforeEach(() => {
    mockCurrentUser = user;
    app = createApp();
    jest.clearAllMocks();
    recipesApi.saveRecipe.mockResolvedValue({ _id: 'recipe-1' });
    recipesApi.listRecipes.mockResolvedValue({ recipes: [] });
    recipesApi.getRecipe.mockResolvedValue({ _id: 'recipe-1' });
    recipesApi.getRecipeByDraft.mockResolvedValue({ _id: 'recipe-1' });
    recipesApi.getRecipeIllustration.mockResolvedValue({
      buffer: Buffer.from('cached-image'),
      contentType: 'image/webp',
    });
    recipesApi.updateSavedRecipe.mockResolvedValue({ _id: 'recipe-1' });
    recipesApi.deleteSavedRecipe.mockResolvedValue(true);
  });

  test('blocks unauthenticated requests', async () => {
    mockCurrentUser = null;

    await request(app).post('/api/recipes').send({ documentMarkdown: '# Soup' }).expect(401);

    expect(recipesApi.saveRecipe).not.toHaveBeenCalled();
  });

  test('passes authenticated user id into service calls', async () => {
    await request(app)
      .post('/api/recipes')
      .send({ title: 'Body title', documentMarkdown: '# Soup', recipe: recipe() })
      .expect(201, { _id: 'recipe-1' });
    await request(app).get('/api/recipes?q=soup&cuisine=indian').expect(200, { recipes: [] });
    await request(app).get('/api/recipes/recipe-1').expect(200, { _id: 'recipe-1' });
    await request(app).get('/api/recipes/by-draft/draft-1').expect(200, { _id: 'recipe-1' });
    await request(app)
      .patch('/api/recipes/recipe-1')
      .send({ documentMarkdown: '# Soup v2' })
      .expect(200, { _id: 'recipe-1' });
    await request(app).delete('/api/recipes/recipe-1').expect(204);

    expect(recipesApi.saveRecipe).toHaveBeenCalledWith('auth-user', {
      title: 'Body title',
      documentMarkdown: '# Soup',
      recipe: recipe(),
    });
    expect(recipesApi.listRecipes).toHaveBeenCalledWith(
      'auth-user',
      expect.objectContaining({ q: 'soup', cuisine: 'indian' }),
    );
    expect(recipesApi.getRecipe).toHaveBeenCalledWith('auth-user', 'recipe-1');
    expect(recipesApi.getRecipeByDraft).toHaveBeenCalledWith('auth-user', 'draft-1');
    expect(recipesApi.updateSavedRecipe).toHaveBeenCalledWith('auth-user', 'recipe-1', {
      documentMarkdown: '# Soup v2',
    });
    expect(recipesApi.deleteSavedRecipe).toHaveBeenCalledWith('auth-user', 'recipe-1');
  });

  test('serves versioned thumbnail illustrations with browser caching', async () => {
    const response = await request(app)
      .get('/api/recipes/recipe-1/illustration?variant=thumbnail&v=1')
      .expect(200)
      .expect('Content-Type', /image\/webp/)
      .expect('Cache-Control', 'private, max-age=31536000, immutable');

    expect(response.body).toEqual(Buffer.from('cached-image'));
    expect(recipesApi.getRecipeIllustration).toHaveBeenCalledWith('auth-user', 'recipe-1', true);
  });

  test.each([
    ['get recipe', () => recipesApi.getRecipe.mockResolvedValue(null), 'get', '/recipe-1', null],
    [
      'get by draft',
      () => recipesApi.getRecipeByDraft.mockResolvedValue(null),
      'get',
      '/by-draft/draft-1',
      null,
    ],
    [
      'update recipe',
      () => recipesApi.updateSavedRecipe.mockResolvedValue(null),
      'patch',
      '/recipe-1',
      { documentMarkdown: '# Soup' },
    ],
    [
      'delete recipe',
      () => recipesApi.deleteSavedRecipe.mockResolvedValue(false),
      'delete',
      '/recipe-1',
      null,
    ],
  ])('%s maps service null to 404', async (_name, setup, method, path, body) => {
    setup();
    const call = request(app)[method](`/api/recipes${path}`);
    if (body != null) {
      call.send(body);
    }
    await call.expect(404);
  });

  test.each([
    ['missing markdown', 'post', '/', {}],
    ['malformed recipe', 'post', '/', { documentMarkdown: '# Soup', recipe: { title: 'Soup' } }],
    ['empty update', 'patch', '/recipe-1', {}],
    ['bad update markdown', 'patch', '/recipe-1', { documentMarkdown: '' }],
  ])('rejects %s with 400 before service call', async (_name, method, path, body) => {
    await request(app)[method](`/api/recipes${path}`).send(body).expect(400);
  });
});
