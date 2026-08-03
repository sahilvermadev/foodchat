const express = require('express');
const {
  copyPublicRecipe,
  getPublicProfile,
  getPublicRecipe,
  getPublicRecipeIllustration,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

function sendIllustration(res, illustration) {
  if (!illustration) return res.sendStatus(404);
  res.set({
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'Content-Type': illustration.contentType,
  });
  return res.send(illustration.buffer);
}

function handleError(res, error) {
  return res.status(500).json({ error: error.message });
}

router.get('/recipes/:id/illustration', async (req, res) => {
  try {
    return sendIllustration(
      res,
      await getPublicRecipeIllustration(req.params.id, req.query.variant === 'thumbnail'),
    );
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/recipes/:id', async (req, res) => {
  try {
    const recipe = await getPublicRecipe(req.params.id);
    if (!recipe) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json(recipe);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/recipes/:id/copy', requireJwtAuth, async (req, res) => {
  try {
    const recipe = await copyPublicRecipe(req.user.id, req.params.id);
    if (!recipe) return res.sendStatus(404);
    return res.status(201).json(recipe);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/profiles/:userId', async (req, res) => {
  try {
    const profile = await getPublicProfile(req.params.userId, req.query.limit, req.query.cursor);
    if (!profile) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json(profile);
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
