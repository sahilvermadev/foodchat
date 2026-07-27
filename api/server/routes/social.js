const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  CookingValidationError,
  SocialImportValidationError,
  createSocialImport,
  createDraftFromSocialImport,
  createSocialPlaylistSubscription,
  deleteSocialPlaylistSubscription,
  deleteSocialImport,
  getExistingPreferences,
  fetchRemoteImage,
  getSocialImportThumbnail,
  limiterCache,
  listSocialImportJobs,
  listSocialImports,
  listSocialPlaylistSubscriptions,
  retrySocialImportProcessing,
  runCookingChat,
  syncSocialPlaylistSubscription,
  updateSocialPlaylistSubscription,
  updateSocialImport,
} = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();

const socialImageProxyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SOCIAL_IMAGE_PROXY_RATE_LIMIT_MAX) || 240,
  store: limiterCache('social_image_proxy'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many image requests. Please try again later.' }),
});

router.get('/image-proxy', socialImageProxyLimiter, async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const image = await fetchRemoteImage(imageUrl);

    res.set({
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    return res.send(image.buffer);
  } catch (_error) {
    return res.status(400).json({ error: 'Unable to fetch that image.' });
  }
});

router.use(requireJwtAuth, configMiddleware);

const socialImportStatuses = [
  'saved',
  'processing',
  'draft_ready',
  'needs_review',
  'saved_recipe',
  'inspiration',
  'failed',
];
const socialImportProviders = ['youtube', 'instagram', 'tiktok', 'web', 'unknown'];
const socialImportViews = ['all', 'ready', 'needs_help', 'processing', 'saved'];
const playlistStatuses = ['active', 'paused', 'failed'];
const socialImportRecipePrompt = [
  'Internal social recipe import.',
  'The user does not want to see scraped descriptions, transcripts, captions, links, or extraction notes.',
  'Use the supplied source evidence privately to reconstruct the final cookable recipe as closely as possible.',
  'Apply saved preferences, dietary rules, location, equipment, and taste profile where available.',
  'You MUST revise the selected cooking document in place with revise_cooking_document.',
  'Do not call create_cooking_document. Do not expose raw source evidence in the visible recipe.',
  'If source facts are incomplete, make a practical cookable version and label inferred quantities or steps as estimated.',
].join('\n');

function userId(req) {
  return req.user.id;
}

const socialImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SOCIAL_IMPORT_RATE_LIMIT_MAX) || 120,
  keyGenerator: userId,
  store: limiterCache('social_imports'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many import requests. Please try again later.' }),
});

const socialImportDraftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SOCIAL_IMPORT_DRAFT_RATE_LIMIT_MAX) || 30,
  keyGenerator: userId,
  store: limiterCache('social_import_drafts'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many draft requests. Please try again later.' }),
});

router.use(socialImportLimiter);

function conversationTitle(text) {
  const clean = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  return clean.slice(0, 60) || 'New Chat';
}

function requestContext(req) {
  return {
    userId: userId(req),
    isTemporary: req.body?.isTemporary,
    interfaceConfig: req.config?.interfaceConfig,
  };
}

function models() {
  return require('~/models');
}

async function reconstructRecipeFromImport(req, result) {
  try {
    const preferences = await getExistingPreferences(userId(req));
    const agentResult = await runCookingChat({
      user: userId(req),
      conversationId: result.draft.conversationId,
      text: result.draft.prompt,
      promptPrefix: socialImportRecipePrompt,
      preferencesMarkdown: preferences?.markdown,
      messages: [],
      activeDraft: result.draft,
      documents: [result.draft],
      webSearchConfig: req.config?.webSearch,
      loadAuthValues: undefined,
      allowDocumentTools: true,
      allowCulinaryTools: true,
      conversationCreatedAt: new Date(),
    });

    return {
      ...result,
      draft: agentResult.draft ?? result.draft,
      assistantText: agentResult.text,
    };
  } catch (_error) {
    return result;
  }
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertOptionalText(value, message) {
  if (value != null && typeof value !== 'string') {
    throw new SocialImportValidationError(message);
  }
}

function assertStatus(value) {
  if (value != null && !socialImportStatuses.includes(value)) {
    throw new SocialImportValidationError('Social import status is malformed.');
  }
}

function assertProvider(value) {
  if (value != null && !socialImportProviders.includes(value)) {
    throw new SocialImportValidationError('Social import provider is malformed.');
  }
}

function assertView(value) {
  if (value != null && !socialImportViews.includes(value)) {
    throw new SocialImportValidationError('Social import view is malformed.');
  }
}

function assertCreateBody(body) {
  const payload = isObject(body) ? body : {};
  if (typeof payload.sourceUrl !== 'string' || payload.sourceUrl.trim().length === 0) {
    throw new SocialImportValidationError('Social import URL is required.');
  }
  assertOptionalText(payload.title, 'Social import title is malformed.');
  assertOptionalText(payload.userSuppliedText, 'Social import details are malformed.');
}

function assertPatchBody(body) {
  const payload = isObject(body) ? body : {};
  assertStatus(payload.status);
  assertOptionalText(payload.title, 'Social import title is malformed.');
  assertOptionalText(payload.creatorName, 'Social import creator is malformed.');
  assertOptionalText(payload.userSuppliedText, 'Social import details are malformed.');
  assertOptionalText(payload.draftSummary, 'Social import summary is malformed.');
  assertOptionalText(payload.savedRecipeId, 'Saved recipe id is malformed.');
  if (
    payload.status == null &&
    payload.title == null &&
    payload.creatorName == null &&
    payload.userSuppliedText == null &&
    payload.draftSummary == null &&
    payload.savedRecipeId == null
  ) {
    throw new SocialImportValidationError('Social import update is empty.');
  }
}

function assertDraftBody(body) {
  const payload = isObject(body) ? body : {};
  assertOptionalText(payload.userSuppliedText, 'Social import details are malformed.');
}

function assertPlaylistCreateBody(body) {
  const payload = isObject(body) ? body : {};
  if (typeof payload.sourceUrl !== 'string' || payload.sourceUrl.trim().length === 0) {
    throw new SocialImportValidationError('YouTube playlist URL is required.');
  }
}

function assertPlaylistPatchBody(body) {
  const payload = isObject(body) ? body : {};
  if (payload.status != null && !playlistStatuses.includes(payload.status)) {
    throw new SocialImportValidationError('Playlist subscription status is malformed.');
  }
  if (payload.status == null) {
    throw new SocialImportValidationError('Playlist subscription update is empty.');
  }
}

function handleError(res, error) {
  if (error instanceof SocialImportValidationError || error instanceof CookingValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

router.post('/', async (req, res) => {
  try {
    assertCreateBody(req.body);
    const socialImport = await createSocialImport(userId(req), req.body);
    res.status(201).json(socialImport);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/', async (req, res) => {
  try {
    assertStatus(req.query.status);
    assertProvider(req.query.provider);
    assertView(req.query.view);
    const imports = await listSocialImports(userId(req), req.query);
    res.json(imports);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id/thumbnail', async (req, res) => {
  try {
    const image = await getSocialImportThumbnail(userId(req), req.params.id);
    if (!image) {
      return res.sendStatus(404);
    }
    res.set({
      'Content-Type': image.contentType,
      'Cache-Control': 'private, max-age=3600',
    });
    return res.send(image.buffer);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/playlists', async (req, res) => {
  try {
    assertPlaylistCreateBody(req.body);
    const result = await createSocialPlaylistSubscription(userId(req), req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/playlists', async (req, res) => {
  try {
    const result = await listSocialPlaylistSubscriptions(userId(req));
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/playlists/:id', async (req, res) => {
  try {
    assertPlaylistPatchBody(req.body);
    const subscription = await updateSocialPlaylistSubscription(
      userId(req),
      req.params.id,
      req.body,
    );
    if (!subscription) {
      return res.sendStatus(404);
    }
    res.json(subscription);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/playlists/:id/sync', async (req, res) => {
  try {
    const result = await syncSocialPlaylistSubscription(userId(req), req.params.id, true);
    if (!result) {
      return res.sendStatus(404);
    }
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/playlists/:id', async (req, res) => {
  try {
    const deleted = await deleteSocialPlaylistSubscription(userId(req), req.params.id);
    if (!deleted) {
      return res.sendStatus(404);
    }
    return res.sendStatus(204);
  } catch (error) {
    return handleError(res, error);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    assertPatchBody(req.body);
    const socialImport = await updateSocialImport(userId(req), req.params.id, req.body);
    if (!socialImport) {
      return res.sendStatus(404);
    }
    res.json(socialImport);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id/jobs', async (req, res) => {
  try {
    const result = await listSocialImportJobs(userId(req), req.params.id);
    if (!result) {
      return res.sendStatus(404);
    }
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const socialImport = await retrySocialImportProcessing(userId(req), req.params.id);
    if (!socialImport) {
      return res.sendStatus(404);
    }
    return res.json(socialImport);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/:id/draft', socialImportDraftLimiter, async (req, res) => {
  try {
    assertDraftBody(req.body);
    const conversationId = crypto.randomUUID();
    const result = await createDraftFromSocialImport(userId(req), req.params.id, {
      conversationId,
      userSuppliedText: req.body?.userSuppliedText,
    });
    if (!result) {
      return res.sendStatus(404);
    }
    const reconstructed = await reconstructRecipeFromImport(req, result);
    const requestMessageId = crypto.randomUUID();
    const responseMessageId = `${requestMessageId}_`;
    const requestMessage = {
      text: 'Create a recipe from this saved source.',
      conversationId,
      messageId: requestMessageId,
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      isCreatedByUser: true,
      error: false,
      user: userId(req),
    };
    const responseMessage = {
      messageId: responseMessageId,
      parentMessageId: requestMessageId,
      conversationId,
      sender: 'Samwise',
      endpoint: 'agents',
      model: '',
      text:
        reconstructed.assistantText ||
        'I started a recipe draft from the saved source. I kept the extracted source details out of the visible recipe.',
      unfinished: false,
      error: false,
      isCreatedByUser: false,
      user: userId(req),
      metadata: {
        cookingCategory: 'recipes',
        cookingActiveIntent: 'source_driven_request',
        cookingActiveAction: 'revise_document',
      },
    };
    await models().saveConvo(
      requestContext(req),
      {
        conversationId,
        endpoint: 'agents',
        title: conversationTitle(reconstructed.draft.recipe?.title || reconstructed.draft.prompt),
        cookingCategory: 'recipes',
      },
      { context: 'POST /api/social-imports/:id/draft - precreate conversation' },
    );
    await models().saveMessage(requestContext(req), requestMessage, {
      context: 'POST /api/social-imports/:id/draft - request message',
    });
    await models().saveMessage(requestContext(req), responseMessage, {
      context: 'POST /api/social-imports/:id/draft - response message',
    });
    res.status(201).json(reconstructed);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteSocialImport(userId(req), req.params.id);
    if (!deleted) {
      return res.sendStatus(404);
    }
    return res.sendStatus(204);
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
