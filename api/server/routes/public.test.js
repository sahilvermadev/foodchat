const express = require('express');
const request = require('supertest');

let mockCurrentUser;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockCurrentUser) return res.sendStatus(401);
    req.user = mockCurrentUser;
    return next();
  },
}));

jest.mock('@librechat/api', () => ({
  copyPublicRecipe: jest.fn(),
  getPublicProfile: jest.fn(),
  getPublicRecipe: jest.fn(),
  getPublicRecipeIllustration: jest.fn(),
}));

const publicApi = require('@librechat/api');
const publicRoutes = require('./public');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/public', publicRoutes);
  return instance;
}

describe('public recipe routes', () => {
  beforeEach(() => {
    mockCurrentUser = null;
    jest.clearAllMocks();
    publicApi.getPublicRecipe.mockResolvedValue({ _id: 'recipe-1' });
    publicApi.getPublicProfile.mockResolvedValue({ author: { id: 'user-1' }, recipes: [] });
    publicApi.copyPublicRecipe.mockResolvedValue({ _id: 'copy-1' });
  });

  test('allows anonymous recipe and profile reads', async () => {
    await request(app()).get('/api/public/recipes/recipe-1').expect(200, { _id: 'recipe-1' });
    await request(app())
      .get('/api/public/profiles/user-1')
      .expect(200, {
        author: { id: 'user-1' },
        recipes: [],
      });
    expect(publicApi.getPublicRecipe).toHaveBeenCalledWith('recipe-1');
    expect(publicApi.getPublicProfile).toHaveBeenCalledWith('user-1', undefined, undefined);
  });

  test('requires ownership identity before creating a copy', async () => {
    await request(app()).post('/api/public/recipes/recipe-1/copy').expect(401);
    expect(publicApi.copyPublicRecipe).not.toHaveBeenCalled();

    mockCurrentUser = { id: 'recipient-1' };
    await request(app()).post('/api/public/recipes/recipe-1/copy').expect(201, { _id: 'copy-1' });
    expect(publicApi.copyPublicRecipe).toHaveBeenCalledWith('recipient-1', 'recipe-1');
  });
});
