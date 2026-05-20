const express = require('express');
const crypto = require('crypto');
const {
  CookingValidationError,
  runCookingChat,
  extractAndSavePreferences,
  getExistingPreferences,
  getCookingDraftByConversation,
  generateCookingDraft,
  updateCookingDraft,
  startCookingSession,
  getCookingSession,
  appendCookingSessionEvent,
  completeCookingSession,
} = require('@librechat/api');
const { Constants } = require('librechat-data-provider');
const { requireJwtAuth } = require('~/server/middleware');
const { loadAuthValues } = require('~/server/services/Tools/credentials');

const router = express.Router();

router.use(requireJwtAuth);

function userId(req) {
  return req.user.id;
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertText(value, message) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CookingValidationError(message);
  }
}

function assertOptionalText(value, message) {
  if (value != null && typeof value !== 'string') {
    throw new CookingValidationError(message);
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

function assertStartSessionBody(body) {
  const payload = isObject(body) ? body : {};
  const hasDraftId = typeof payload.draftId === 'string' && payload.draftId.trim().length > 0;

  if (!hasDraftId) {
    throw new CookingValidationError('A draft is required.');
  }
}

function assertStepIndex(value) {
  if (value != null && (!Number.isInteger(value) || value < 0)) {
    throw new CookingValidationError('Event is malformed.');
  }
}

function assertEvent(value) {
  if (!isObject(value) || typeof value.type !== 'string') {
    throw new CookingValidationError('Event is required.');
  }

  assertStepIndex(value.stepIndex);

  if (value.type === 'navigation') {
    if (!['previous', 'next', 'jump', 'repeat'].includes(value.action)) {
      throw new CookingValidationError('Event is malformed.');
    }
    return;
  }

  if (value.type === 'note' || value.type === 'problem') {
    assertText(value.text, 'Event is malformed.');
    return;
  }

  if (value.type === 'substitution') {
    assertText(value.text, 'Event is malformed.');
    assertOptionalText(value.ingredientId, 'Event is malformed.');
    return;
  }

  if (value.type === 'timer') {
    assertText(value.timerId, 'Event is malformed.');
    if (!['started', 'completed'].includes(value.action)) {
      throw new CookingValidationError('Event is malformed.');
    }
    if (value.durationSeconds != null && !Number.isFinite(Number(value.durationSeconds))) {
      throw new CookingValidationError('Event is malformed.');
    }
    return;
  }

  if (value.type === 'review') {
    assertCompletionBody(value);
    return;
  }

  throw new CookingValidationError('Event is malformed.');
}

function assertCompletionBody(body) {
  const payload = isObject(body) ? body : {};
  const rating = Number(payload.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5 || typeof payload.note !== 'string') {
    throw new CookingValidationError('Completion payload is malformed.');
  }
}

function handleError(res, error) {
  if (error instanceof CookingValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

function sendEvent(res, payload) {
  res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === 'function') {
    res.flush();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamAssistantText(res, { text, messageId, parentMessageId, conversationId }) {
  const content = typeof text === 'string' ? text : '';
  if (!content) {
    return;
  }

  const chars = Array.from(content);
  let cursor = 0;
  while (cursor < chars.length) {
    const remaining = chars.length - cursor;
    const chunkSize = remaining > 240 ? 32 : remaining > 80 ? 20 : 12;
    cursor += chunkSize;
    sendEvent(res, {
      type: 'text',
      text: chars.slice(0, cursor).join(''),
      index: 0,
      messageId,
      parentMessageId,
      conversationId,
    });
    await delay(16);
  }
}

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

router.post('/chat', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const isNewConvo = !req.body?.conversationId || req.body.conversationId === Constants.NEW_CONVO;
  const conversationId = isNewConvo ? crypto.randomUUID() : req.body.conversationId;
  const userMessageId =
    typeof req.body?.messageId === 'string' && req.body.messageId
      ? req.body.messageId
      : crypto.randomUUID();
  const responseMessageId =
    typeof req.body?.responseMessageId === 'string' && req.body.responseMessageId
      ? req.body.responseMessageId
      : `${userMessageId}_`;
  const parentMessageId =
    typeof req.body?.parentMessageId === 'string' ? req.body.parentMessageId : Constants.NO_PARENT;
  const endpoint = req.body?.endpoint || 'agents';
  const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
  const reqCtx = requestContext(req);

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const requestMessage = {
    ...req.body,
    text,
    conversationId,
    messageId: userMessageId,
    parentMessageId,
    isCreatedByUser: true,
    error: false,
    user: userId(req),
  };
  delete requestMessage.responseMessageId;
  delete requestMessage.overrideParentMessageId;

  sendEvent(res, { message: requestMessage, created: true });

  try {
    const db = models();
    const preferences = await getExistingPreferences(userId(req));
    const activeDraft = await getCookingDraftByConversation(userId(req), conversationId);
    const result = await runCookingChat({
      user: userId(req),
      conversationId,
      text,
      model,
      promptPrefix: req.body?.promptPrefix,
      preferencesMarkdown: preferences?.markdown,
      messages: isNewConvo ? [] : req.body?.messages,
      activeDraft,
      webSearchConfig: req.config?.webSearch,
      loadAuthValues,
      conversationCreatedAt: req.body?.createdAt || new Date(),
    });
    const metadata = {
      ...(result.promptSuggestions?.length
        ? { cookingPromptSuggestions: result.promptSuggestions }
        : {}),
      ...(result.webSources?.length ? { cookingWebSources: result.webSources } : {}),
    };
    const responseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender: req.body?.modelDisplayLabel || 'Mise',
      endpoint,
      model: model || req.body?.modelDisplayLabel || '',
      text: result.text,
      unfinished: false,
      error: false,
      isCreatedByUser: false,
      user: userId(req),
      ...(Object.keys(metadata).length ? { metadata } : {}),
    };
    const conversation = {
      ...req.body,
      conversationId,
      endpoint,
      model,
      title: isNewConvo ? conversationTitle(text) : req.body?.title || conversationTitle(text),
    };

    delete conversation.messages;
    delete conversation.text;
    delete conversation.parentMessageId;
    delete conversation.messageId;
    delete conversation.responseMessageId;
    delete conversation.isCreatedByUser;

    await db.saveMessage(reqCtx, requestMessage, {
      context: 'POST /api/cooking/chat - user message',
    });
    await db.saveMessage(reqCtx, responseMessage, {
      context: 'POST /api/cooking/chat - response message',
    });
    await db.saveConvo(reqCtx, conversation, {
      context: 'POST /api/cooking/chat - conversation',
    });

    await streamAssistantText(res, {
      text: result.text,
      messageId: responseMessage.messageId,
      parentMessageId: responseMessage.parentMessageId,
      conversationId,
    });
    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage,
      responseMessage,
      cookingDraftUpdated: result.draftChanged,
    });
    try {
      const extraction = await extractAndSavePreferences({
        user: userId(req),
        userMessage: text,
        assistantMessage: result.text,
        model,
        currentMarkdown: preferences?.markdown,
      });
      if (extraction.changed) {
        sendEvent(res, { preferencesUpdated: true });
      }
    } catch {
      // Preference extraction must never break the completed chat response.
    }
    res.end();
  } catch (error) {
    const errorResponseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender: 'Mise',
      endpoint,
      model: model || '',
      text: error instanceof Error ? error.message : 'Cooking chat failed.',
      unfinished: false,
      error: true,
      isCreatedByUser: false,
      user: userId(req),
    };
    try {
      const db = models();
      await db.saveMessage(reqCtx, requestMessage, {
        context: 'POST /api/cooking/chat - user message before error',
      });
      await db.saveMessage(reqCtx, errorResponseMessage, {
        context: 'POST /api/cooking/chat - error response message',
      });
      await db.saveConvo(
        reqCtx,
        {
          conversationId,
          endpoint,
          model,
          title: conversationTitle(text),
        },
        { context: 'POST /api/cooking/chat - error conversation' },
      );
    } catch {
      // The SSE error below is more useful to the client than masking with a persistence failure.
    }
    await streamAssistantText(res, {
      text: errorResponseMessage.text,
      messageId: errorResponseMessage.messageId,
      parentMessageId: errorResponseMessage.parentMessageId,
      conversationId,
    });
    sendEvent(res, {
      final: true,
      conversation: { conversationId, title: conversationTitle(text), endpoint, model },
      requestMessage,
      responseMessage: errorResponseMessage,
    });
    res.end();
  }
});

router.post('/drafts/generate', async (req, res) => {
  try {
    assertText(req.body?.prompt, 'Prompt is required.');
    assertOptionalText(req.body?.conversationId, 'Conversation id is malformed.');
    assertOptionalText(req.body?.documentMarkdown, 'Recipe document is malformed.');
    const draft = await generateCookingDraft(
      userId(req),
      req.body.prompt,
      req.body.conversationId,
      req.body.documentMarkdown,
    );
    res.status(201).json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/drafts/by-conversation/:conversationId', async (req, res) => {
  try {
    const draft = await getCookingDraftByConversation(userId(req), req.params.conversationId);
    if (!draft) {
      return res.sendStatus(404);
    }
    res.json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/drafts/:id', async (req, res) => {
  try {
    if (req.body?.recipe != null) {
      assertRecipe(req.body.recipe);
    }
    assertOptionalText(req.body?.documentMarkdown, 'Recipe document is malformed.');
    const draft = await updateCookingDraft(
      userId(req),
      req.params.id,
      req.body?.recipe,
      req.body?.documentMarkdown,
    );
    if (!draft) {
      return res.sendStatus(404);
    }
    res.json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/sessions', async (req, res) => {
  try {
    assertStartSessionBody(req.body);
    const session = await startCookingSession({
      user: userId(req),
      draftId: req.body.draftId,
    });
    if (!session) {
      return res.sendStatus(404);
    }
    res.status(201).json(session);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await getCookingSession(userId(req), req.params.id);
    if (!session) {
      return res.sendStatus(404);
    }
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/sessions/:id/events', async (req, res) => {
  try {
    assertEvent(req.body?.event);
    const session = await appendCookingSessionEvent({
      user: userId(req),
      sessionId: req.params.id,
      event: req.body.event,
    });
    if (!session) {
      return res.sendStatus(404);
    }
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/sessions/:id/complete', async (req, res) => {
  try {
    assertCompletionBody(req.body);
    const session = await completeCookingSession({
      user: userId(req),
      sessionId: req.params.id,
      rating: req.body.rating,
      note: req.body.note,
    });
    if (!session) {
      return res.sendStatus(404);
    }
    res.json(session);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
