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

jest.mock('@librechat/api', () => {
  class CookingValidationError extends Error {}
  return {
    CookingValidationError,
    addShoppingItems: jest.fn(),
    assertShoppingInputs: jest.fn(),
    assertShoppingMutationId: jest.fn(),
    assertShoppingPatch: jest.fn(),
    clearPurchasedShoppingItems: jest.fn(),
    deleteShoppingItem: jest.fn(),
    deleteShoppingContribution: jest.fn(),
    getShoppingList: jest.fn(),
    mergeShoppingListItems: jest.fn(),
    updateShoppingItem: jest.fn(),
  };
});

const shoppingApi = require('@librechat/api');
const shoppingRoutes = require('./shopping');

const response = { _id: 'list-1', name: 'Shopping list', items: [] };

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/shopping-list', shoppingRoutes);
  return instance;
}

describe('shopping list routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { id: 'user-1' };
    shoppingApi.getShoppingList.mockResolvedValue(response);
    shoppingApi.addShoppingItems.mockResolvedValue(response);
    shoppingApi.updateShoppingItem.mockResolvedValue(response);
    shoppingApi.deleteShoppingItem.mockResolvedValue(response);
    shoppingApi.deleteShoppingContribution.mockResolvedValue(response);
    shoppingApi.mergeShoppingListItems.mockResolvedValue(response);
    shoppingApi.clearPurchasedShoppingItems.mockResolvedValue(response);
  });

  test('requires authentication', async () => {
    mockCurrentUser = null;
    await request(app()).get('/api/shopping-list').expect(401);
    expect(shoppingApi.getShoppingList).not.toHaveBeenCalled();
  });

  test('passes authenticated operations to the shopping service', async () => {
    const items = [{ displayName: 'tomatoes' }];
    const patch = { purchased: true };
    const mutationId = 'mutation-1';
    await request(app()).get('/api/shopping-list').expect(200, response);
    await request(app())
      .post('/api/shopping-list/items')
      .send({ items, mutationId })
      .expect(201, response);
    await request(app())
      .patch('/api/shopping-list/items/item-1')
      .set('Idempotency-Key', mutationId)
      .send(patch)
      .expect(200, response);
    await request(app())
      .delete('/api/shopping-list/items/item-1')
      .set('Idempotency-Key', mutationId)
      .expect(200, response);
    await request(app())
      .post('/api/shopping-list/clear-purchased')
      .set('Idempotency-Key', mutationId)
      .expect(200, response);

    expect(shoppingApi.addShoppingItems).toHaveBeenCalledWith('user-1', items, mutationId);
    expect(shoppingApi.updateShoppingItem).toHaveBeenCalledWith(
      'user-1',
      'item-1',
      patch,
      mutationId,
    );
    expect(shoppingApi.deleteShoppingItem).toHaveBeenCalledWith('user-1', 'item-1', mutationId);
    expect(shoppingApi.clearPurchasedShoppingItems).toHaveBeenCalledWith('user-1', mutationId);
  });

  test.each([
    ['patch', '/api/shopping-list/items/missing'],
    ['delete', '/api/shopping-list/items/missing'],
  ])('returns 404 when an item does not exist', async (method, path) => {
    shoppingApi.updateShoppingItem.mockResolvedValue(null);
    shoppingApi.deleteShoppingItem.mockResolvedValue(null);
    await request(app())[method](path).send({ purchased: true }).expect(404);
  });

  test('supports contribution removal and explicit duplicate merging', async () => {
    const mutationId = 'mutation-2';
    await request(app())
      .delete('/api/shopping-list/items/item-1/contributions/source-1')
      .set('Idempotency-Key', mutationId)
      .expect(200, response);
    await request(app())
      .post('/api/shopping-list/items/item-1/merge/item-2')
      .set('Idempotency-Key', mutationId)
      .expect(200, response);
    expect(shoppingApi.deleteShoppingContribution).toHaveBeenCalledWith(
      'user-1',
      'item-1',
      'source-1',
      mutationId,
    );
    expect(shoppingApi.mergeShoppingListItems).toHaveBeenCalledWith(
      'user-1',
      'item-1',
      'item-2',
      mutationId,
    );
  });
});
