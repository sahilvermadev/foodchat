const express = require('express');
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const {
  CookingValidationError,
  runCookingChat,
  curatePendingPreferences,
  withPendingPreferenceBatch,
  getExistingPreferences,
  getCookingDraftByConversation,
  listCookingDocuments,
  createCookingDocument,
  selectCookingDocument,
  deleteCookingDocument,
  updateCookingDocument,
  generateCookingDraft,
  updateCookingDraft,
  startCookingSession,
  getCookingSession,
  appendCookingSessionEvent,
  completeCookingSession,
} = require('@librechat/api');
const { Constants, VisionModes } = require('librechat-data-provider');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { loadAuthValues } = require('~/server/services/Tools/credentials');

const router = express.Router();
const cookingAssistantName = 'Samwise';

router.use(requireJwtAuth, configMiddleware);

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

function assertDocumentType(value) {
  if (value != null && !['recipe', 'guide', 'prep_plan'].includes(value)) {
    throw new CookingValidationError('Cooking document type is malformed.');
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

function createChatPerfTrace({ conversationId, endpoint, model, isNewConvo }) {
  const startedAt = Date.now();
  const marks = [];

  return {
    mark(stage, data = {}) {
      marks.push({
        stage,
        atMs: Date.now() - startedAt,
        ...data,
      });
    },
    log(level = 'info', data = {}) {
      if (process.env.NODE_ENV === 'test') {
        return;
      }
      const payload = {
        conversationId,
        endpoint,
        model,
        isNewConvo,
        totalMs: Date.now() - startedAt,
        marks,
        ...data,
      };
      logger[level]('[CookingPerf] /api/cooking/chat', payload);
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamAssistantText(
  res,
  { text, messageId, parentMessageId, conversationId, onFirstChunk },
) {
  const content = typeof text === 'string' ? text : '';
  if (!content) {
    return;
  }

  const chars = Array.from(content);
  let cursor = 0;
  let firstChunkSent = false;
  while (cursor < chars.length) {
    const remaining = chars.length - cursor;
    let chunkSize = 6;
    let delayMs = 25;
    if (remaining > 600) {
      chunkSize = 16;
      delayMs = 20;
    } else if (remaining > 200) {
      chunkSize = 10;
      delayMs = 25;
    }

    cursor += chunkSize;
    sendEvent(res, {
      message: true,
      text: chars.slice(0, cursor).join(''),
      messageId,
      parentMessageId,
      conversationId,
    });
    if (!firstChunkSent) {
      firstChunkSent = true;
      onFirstChunk?.();
    }
    await delay(delayMs);
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

function isImageFile(file) {
  return (
    file &&
    (typeof file.type === 'string'
      ? file.type.startsWith('image/')
      : Boolean(file.width && file.height))
  );
}

function refersToRecentImageSource(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  return (
    /\b(this|that|it|attached|attachment|image|photo|screenshot|shown|above|recipe|canvas|transcribe|replicate|recreate)\b/i.test(
      normalized,
    ) || /^(yes|yeah|yep|sure|okay|ok|do it|go ahead|please do)[.!\s]*$/i.test(normalized)
  );
}

async function restoreLatestCookingImage(req, messages, currentImageUrls, text) {
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    currentImageUrls.length > 0 ||
    !refersToRecentImageSource(text)
  ) {
    return messages;
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message?.isCreatedByUser) {
      continue;
    }
    if (Array.isArray(message.image_urls) && message.image_urls.length > 0) {
      return messages;
    }

    const imageFiles = Array.isArray(message.files) ? message.files.filter(isImageFile) : [];
    if (imageFiles.length === 0) {
      return messages;
    }

    let imageUrls;
    try {
      ({ image_urls: imageUrls } = await encodeAndFormat(
        req,
        imageFiles,
        { provider: 'openAI', endpoint: 'openAI' },
        VisionModes.agents,
      ));
    } catch (error) {
      logger.warn('[CookingChat] failed to restore historical image source', {
        messageId: message.messageId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      continue;
    }
    if (imageUrls.length === 0) {
      continue;
    }

    return messages.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...candidate, image_urls: imageUrls } : candidate,
    );
  }

  return messages;
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
  const perf = createChatPerfTrace({ conversationId, endpoint, model, isNewConvo });
  perf.mark('request_validated', {
    promptChars: text.length,
    clientMessageCount: Array.isArray(req.body?.messages) ? req.body.messages.length : 0,
  });

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  perf.mark('headers_flushed');

  const requestMessage = withPendingPreferenceBatch({
    ...req.body,
    text,
    conversationId,
    messageId: userMessageId,
    parentMessageId,
    isCreatedByUser: true,
    error: false,
    user: userId(req),
  });
  delete requestMessage.responseMessageId;
  delete requestMessage.overrideParentMessageId;

  sendEvent(res, { message: requestMessage, created: true });
  perf.mark('request_message_event_sent');

  try {
    const db = models();
    const contextStartedAt = Date.now();
    const [preferences, documentCollection] = await Promise.all([
      getExistingPreferences(userId(req)),
      listCookingDocuments(userId(req), conversationId),
    ]);
    const activeDraft = documentCollection.documents.find(
      (document) => document._id === documentCollection.selectedDocumentId,
    );
    perf.mark('context_loaded', {
      durationMs: Date.now() - contextStartedAt,
      hasPreferences: Boolean(preferences?.markdown),
      hasActiveDraft: Boolean(activeDraft),
    });
    const agentTiming = [];
    const agentStartedAt = Date.now();
    let assistantTextStreamed = false;
    let cumulativeText = '';

    const requestFiles = req.body?.files ?? [];
    logger.info('[CookingChat] files received in request body', {
      filesCount: requestFiles.length,
      files: requestFiles.map((f) => ({
        file_id: f.file_id,
        filepath: f.filepath,
        filename: f.filename,
        type: f.type,
      })),
    });

    const { image_urls: imageUrls, files: processedFiles } = await encodeAndFormat(
      req,
      requestFiles,
      {
        provider: 'openAI',
        endpoint: 'openAI',
      },
      VisionModes.agents,
    );

    logger.info('[CookingChat] encodeAndFormat result', {
      imageUrlsCount: imageUrls?.length ?? 0,
      imageUrls: imageUrls?.map((img) => ({ type: img.type, hasUrl: !!img.image_url?.url })),
      processedFilesCount: processedFiles?.length ?? 0,
    });

    if (processedFiles.length > 0) {
      requestMessage.files = processedFiles;
    }
    if (imageUrls.length > 0) {
      requestMessage.metadata = {
        ...(requestMessage.metadata || {}),
        cookingSource: {
          type: 'image',
          fileIds: processedFiles.map((file) => file.file_id).filter(Boolean),
          filenames: processedFiles.map((file) => file.filename).filter(Boolean),
        },
      };
    }

    const historyMessages = await restoreLatestCookingImage(
      req,
      isNewConvo ? [] : req.body?.messages,
      imageUrls,
      text,
    );

    const result = await runCookingChat({
      user: userId(req),
      conversationId,
      text,
      model,
      promptPrefix: req.body?.promptPrefix,
      preferencesMarkdown: preferences?.markdown,
      messages: historyMessages,
      activeDraft,
      documents: documentCollection.documents,
      webSearchConfig: req.config?.webSearch,
      loadAuthValues,
      conversationCreatedAt: req.body?.createdAt || new Date(),
      image_urls: imageUrls,
      onTiming: (event) => agentTiming.push(event),
      onStep: (step) => {
        sendEvent(res, {
          type: 'step',
          step,
          messageId: responseMessageId,
          parentMessageId: userMessageId,
          conversationId,
        });
      },
      onTextDelta: async (delta, isFinal) => {
        if (!assistantTextStreamed) {
          assistantTextStreamed = true;
          perf.mark('assistant_first_text_event_sent');
        }
        if (isFinal) {
          await streamAssistantText(res, {
            text: delta,
            messageId: responseMessageId,
            parentMessageId: userMessageId,
            conversationId,
          });
        } else {
          cumulativeText += delta;
          sendEvent(res, {
            message: true,
            text: cumulativeText,
            messageId: responseMessageId,
            parentMessageId: userMessageId,
            conversationId,
          });
        }
      },
    });
    perf.mark('cooking_agent_completed', {
      durationMs: Date.now() - agentStartedAt,
      outputChars: result.text?.length ?? 0,
      draftChanged: Boolean(result.draftChanged),
      promptSuggestionCount: result.promptSuggestions?.length ?? 0,
      webSourceCount: result.webSources?.length ?? 0,
      agentTiming,
    });
    const metadata = {
      ...(result.promptSuggestions?.length
        ? { cookingPromptSuggestions: result.promptSuggestions }
        : {}),
      ...(result.webSources?.length ? { cookingWebSources: result.webSources } : {}),
      ...(result.activeIntent ? { cookingActiveIntent: result.activeIntent } : {}),
      ...(result.activeAction ? { cookingActiveAction: result.activeAction } : {}),
    };
    const responseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender: cookingAssistantName,
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

    if (!assistantTextStreamed) {
      await streamAssistantText(res, {
        text: result.text,
        messageId: responseMessage.messageId,
        parentMessageId: responseMessage.parentMessageId,
        conversationId,
        onFirstChunk: () => perf.mark('assistant_first_text_event_sent'),
      });
    }
    perf.mark('assistant_text_stream_completed');
    const persistenceStartedAt = Date.now();
    await db.saveMessage(reqCtx, requestMessage, {
      context: 'POST /api/cooking/chat - user message',
    });
    await db.saveMessage(reqCtx, responseMessage, {
      context: 'POST /api/cooking/chat - response message',
    });
    await db.saveConvo(reqCtx, conversation, {
      context: 'POST /api/cooking/chat - conversation',
    });
    perf.mark('persistence_completed', { durationMs: Date.now() - persistenceStartedAt });
    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage,
      responseMessage,
      cookingDraftUpdated: result.draftChanged,
      cookingDocumentsUpdated: result.draftChanged,
    });
    perf.mark('final_event_sent');
    curatePendingPreferences({ user: userId(req), conversationId }).catch((preferenceError) => {
      logger.warn('[CookingPreferences] Batch curator failed', {
        conversationId,
        error: preferenceError instanceof Error ? preferenceError.message : 'unknown error',
      });
    });
    perf.mark('preference_batch_queued');
    perf.log('info', { status: 'ok' });
    res.end();
  } catch (error) {
    perf.mark('chat_failed', {
      error: error instanceof Error ? error.message : 'unknown error',
    });
    const errorResponseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender: cookingAssistantName,
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
      const errorPersistenceStartedAt = Date.now();
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
      perf.mark('error_persistence_completed', {
        durationMs: Date.now() - errorPersistenceStartedAt,
      });
    } catch (persistenceError) {
      perf.mark('error_persistence_failed', {
        error: persistenceError instanceof Error ? persistenceError.message : 'unknown error',
      });
      // The SSE error below is more useful to the client than masking with a persistence failure.
    }
    await streamAssistantText(res, {
      text: errorResponseMessage.text,
      messageId: errorResponseMessage.messageId,
      parentMessageId: errorResponseMessage.parentMessageId,
      conversationId,
      onFirstChunk: () => perf.mark('error_first_text_event_sent'),
    });
    perf.mark('error_text_stream_completed');
    sendEvent(res, {
      final: true,
      conversation: { conversationId, title: conversationTitle(text), endpoint, model },
      requestMessage,
      responseMessage: errorResponseMessage,
    });
    perf.mark('error_final_event_sent');
    perf.log('warn', { status: 'error' });
    res.end();
  }
});

router.post('/drafts/generate', async (req, res) => {
  try {
    assertText(req.body?.prompt, 'Prompt is required.');
    assertOptionalText(req.body?.conversationId, 'Conversation id is malformed.');
    assertOptionalText(req.body?.documentMarkdown, 'Recipe document is malformed.');
    assertDocumentType(req.body?.documentType);
    const draft = await generateCookingDraft(
      userId(req),
      req.body.prompt,
      req.body.conversationId,
      req.body.documentMarkdown,
      req.body.documentType,
    );
    res.status(201).json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/documents', async (req, res) => {
  try {
    assertText(req.body?.prompt, 'Prompt is required.');
    assertOptionalText(req.body?.conversationId, 'Conversation id is malformed.');
    assertOptionalText(req.body?.documentMarkdown, 'Cooking document is malformed.');
    assertDocumentType(req.body?.documentType);
    if (req.body?.recipe != null) {
      assertRecipe(req.body.recipe);
    }
    const document = await createCookingDocument(
      userId(req),
      req.body.prompt,
      req.body.conversationId,
      req.body.documentMarkdown,
      req.body.documentType,
      req.body.recipe,
    );
    if (req.body.conversationId) {
      const db = models();
      const reqCtx = requestContext(req);
      await db.saveConvo(
        reqCtx,
        {
          conversationId: req.body.conversationId,
          endpoint: 'agents',
          title: conversationTitle(req.body.prompt),
        },
        { context: 'POST /api/cooking/documents - precreate conversation' },
      );
    }
    res.status(201).json(document);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/documents/by-conversation/:conversationId', async (req, res) => {
  try {
    const documents = await listCookingDocuments(userId(req), req.params.conversationId);
    res.json(documents);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/documents/:id', async (req, res) => {
  try {
    if (req.body?.recipe != null) {
      assertRecipe(req.body.recipe);
    }
    assertOptionalText(req.body?.documentMarkdown, 'Cooking document is malformed.');
    const document = await updateCookingDocument(
      userId(req),
      req.params.id,
      req.body?.recipe,
      req.body?.documentMarkdown,
    );
    if (!document) {
      return res.sendStatus(404);
    }
    res.json(document);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/documents/:id/select', async (req, res) => {
  try {
    const documents = await selectCookingDocument(userId(req), req.params.id);
    if (!documents) {
      return res.sendStatus(404);
    }
    res.json(documents);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const documents = await deleteCookingDocument(userId(req), req.params.id);
    if (!documents) {
      return res.sendStatus(404);
    }
    res.json(documents);
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
