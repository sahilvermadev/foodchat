const express = require('express');
const {
  CookingValidationError,
  getRecipe,
  getRecipeByDraft,
  listRecipes,
  saveRecipe,
  updateSavedRecipe,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

function userId(req) {
  return req.user.id;
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertOptionalText(value, message) {
  if (value != null && typeof value !== 'string') {
    throw new CookingValidationError(message);
  }
}

function assertDocumentMarkdown(value) {
  if (typeof value !== 'string' || value.trim().length < 3) {
    throw new CookingValidationError('Recipe document is required.');
  }
}

function assertRecipe(value) {
  if (
    !isObject(value) ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.ingredients) ||
    !Array.isArray(value.steps) ||
    !isObject(value.timing)
  ) {
    throw new CookingValidationError('Recipe is malformed.');
  }
}

function assertSaveBody(body) {
  const payload = isObject(body) ? body : {};
  assertDocumentMarkdown(payload.documentMarkdown);
  assertOptionalText(payload.title, 'Recipe title is malformed.');
  assertOptionalText(payload.sourceConversationId, 'Conversation id is malformed.');
  assertOptionalText(payload.sourceDraftId, 'Draft id is malformed.');
  if (payload.recipe != null) {
    assertRecipe(payload.recipe);
  }
}

function assertPatchBody(body) {
  const payload = isObject(body) ? body : {};
  assertOptionalText(payload.title, 'Recipe title is malformed.');
  if (payload.documentMarkdown != null) {
    assertDocumentMarkdown(payload.documentMarkdown);
  }
  if (payload.recipe != null) {
    assertRecipe(payload.recipe);
  }
  if (payload.title == null && payload.documentMarkdown == null && payload.recipe == null) {
    throw new CookingValidationError('Recipe update is empty.');
  }
}

function handleError(res, error) {
  if (error instanceof CookingValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

router.post('/', async (req, res) => {
  try {
    assertSaveBody(req.body);
    const recipe = await saveRecipe(userId(req), req.body);
    res.status(201).json(recipe);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/', async (req, res) => {
  try {
    const recipes = await listRecipes(userId(req), req.query);
    res.json(recipes);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/by-draft/:draftId', async (req, res) => {
  try {
    const recipe = await getRecipeByDraft(userId(req), req.params.draftId);
    if (!recipe) {
      return res.sendStatus(404);
    }
    res.json(recipe);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const recipe = await getRecipe(userId(req), req.params.id);
    if (!recipe) {
      return res.sendStatus(404);
    }
    res.json(recipe);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    assertPatchBody(req.body);
    const recipe = await updateSavedRecipe(userId(req), req.params.id, req.body);
    if (!recipe) {
      return res.sendStatus(404);
    }
    res.json(recipe);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
