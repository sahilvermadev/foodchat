const express = require('express');
const {
  getPreferences,
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
  if (error instanceof PreferencesValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
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
