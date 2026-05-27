const express = require('express');
const {
  getPreferences,
  getSpecialtyIngredientImage,
  listSpecialtyIngredients,
  resolveSpecialtyIngredient,
  SpecialtyIngredientValidationError,
  updatePreferences,
  runPreferencesChat,
  PreferencesValidationError,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

function userId(req) {
  return req.user.id;
}

function handleError(res, error) {
  if (
    error instanceof PreferencesValidationError ||
    error instanceof SpecialtyIngredientValidationError
  ) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

function sendIngredientImage(res, image) {
  if (!image) {
    return res.sendStatus(404);
  }

  res.set({
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Type': image.contentType,
  });
  return res.send(image.buffer);
}

router.get('/', async (req, res) => {
  try {
    const preferences = await getPreferences(userId(req));
    res.json(preferences);
  } catch (error) {
    handleError(res, error);
  }
});

router.put('/', async (req, res) => {
  try {
    if (typeof req.body?.markdown !== 'string') {
      return res.status(400).json({ error: 'Preferences markdown is required.' });
    }
    const preferences = await updatePreferences(userId(req), req.body.markdown);
    res.json(preferences);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/ingredients', async (req, res) => {
  try {
    const query = typeof req.query?.query === 'string' ? req.query.query : '';
    const result = await listSpecialtyIngredients(query);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/ingredients/:id/image', async (req, res) => {
  try {
    const image = await getSpecialtyIngredientImage(req.params.id, req.query.variant !== 'full');
    return sendIngredientImage(res, image);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/ingredients/resolve', async (req, res) => {
  try {
    if (typeof req.body?.name !== 'string') {
      return res.status(400).json({ error: 'Ingredient name is required.' });
    }
    const ingredient = await resolveSpecialtyIngredient({
      name: req.body.name,
      ...(typeof req.body.category === 'string' ? { category: req.body.category } : {}),
    });
    res.json(ingredient);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/chat', async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const deviceContext =
      req.body?.deviceContext && typeof req.body.deviceContext === 'object'
        ? req.body.deviceContext
        : undefined;
    const result = await runPreferencesChat({
      user: userId(req),
      message,
      model,
      history,
      deviceContext,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
