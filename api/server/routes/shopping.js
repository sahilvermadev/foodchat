const express = require('express');
const {
  addShoppingItems,
  assertShoppingInputs,
  assertShoppingMutationId,
  assertShoppingPatch,
  clearPurchasedShoppingItems,
  CookingValidationError,
  deleteShoppingItem,
  deleteShoppingContribution,
  getShoppingList,
  mergeShoppingListItems,
  updateShoppingItem,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

const userId = (req) => req.user.id;
const mutationId = (req) => req.get('Idempotency-Key') || req.body?.mutationId;

function handleError(res, error) {
  if (error instanceof CookingValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

router.get('/', async (req, res) => {
  try {
    res.json(await getShoppingList(userId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/items', async (req, res) => {
  try {
    assertShoppingInputs(req.body?.items);
    assertShoppingMutationId(mutationId(req));
    res.status(201).json(await addShoppingItems(userId(req), req.body.items, mutationId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/items/:itemId', async (req, res) => {
  try {
    assertShoppingPatch(req.body);
    assertShoppingMutationId(mutationId(req));
    const list = await updateShoppingItem(
      userId(req),
      req.params.itemId,
      req.body,
      mutationId(req),
    );
    if (!list) return res.sendStatus(404);
    res.json(list);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/items/:itemId', async (req, res) => {
  try {
    assertShoppingMutationId(mutationId(req));
    const list = await deleteShoppingItem(userId(req), req.params.itemId, mutationId(req));
    if (!list) return res.sendStatus(404);
    res.json(list);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/items/:itemId/contributions/:contributionId', async (req, res) => {
  try {
    assertShoppingMutationId(mutationId(req));
    const list = await deleteShoppingContribution(
      userId(req),
      req.params.itemId,
      req.params.contributionId,
      mutationId(req),
    );
    if (!list) return res.sendStatus(404);
    res.json(list);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/items/:targetId/merge/:sourceId', async (req, res) => {
  try {
    assertShoppingMutationId(mutationId(req));
    const list = await mergeShoppingListItems(
      userId(req),
      req.params.targetId,
      req.params.sourceId,
      mutationId(req),
    );
    if (!list) return res.sendStatus(404);
    res.json(list);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/clear-purchased', async (req, res) => {
  try {
    assertShoppingMutationId(mutationId(req));
    res.json(await clearPurchasedShoppingItems(userId(req), mutationId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
