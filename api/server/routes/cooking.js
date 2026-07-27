const express = require('express');
const rateLimit = require('express-rate-limit');
const cookies = require('cookie');
const crypto = require('crypto');
const { isValidObjectIdString, logger } = require('@librechat/data-schemas');
const {
  CookingValidationError,
  getBalanceConfig,
  getTransactionsConfig,
  recordCollectedUsage,
  runCookingChat,
  resolveCookingChatCategory,
  curatePendingPreferences,
  withPendingPreferenceBatch,
  getExistingPreferences,
  getCookingDraftByConversation,
  listCookingDocuments,
  createCookingDocument,
  selectCookingDocument,
  deleteCookingDocument,
  updateCookingDocument,
  startSavedRecipeDiscussion,
  generateCookingDraft,
  updateCookingDraft,
  consumeGuestDailyPrompt,
  refundGuestDailyPrompt,
  generateGuestUserId,
  reserveGuestTrial,
  commitGuestTrial,
  refundGuestTrial,
  hasConsumedGuestTrial,
  reserveGuestConcurrency,
  releaseGuestConcurrency,
  limiterCache,
  removePorts,
  getVoiceSessionConfiguration,
  createVoiceSessionGrant,
} = require('@librechat/api');
const { Constants, VisionModes } = require('librechat-data-provider');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { checkBan, configMiddleware, moderateText, requireJwtAuth } = require('~/server/middleware');
const { loadAuthValues } = require('~/server/services/Tools/credentials');

const router = express.Router();
const cookingAssistantName = 'Samwise';
const guestSessionCookieName = 'rekky_guest_session';
const guestSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const configuredGuestPromptLimit = Number(process.env.REKKY_GUEST_DAILY_PROMPT_LIMIT);
const guestDailyPromptLimit =
  Number.isInteger(configuredGuestPromptLimit) && configuredGuestPromptLimit > 0
    ? configuredGuestPromptLimit
    : 10;
const configuredGuestPromptMaxChars = Number(process.env.REKKY_GUEST_MAX_PROMPT_CHARS);
const guestPromptMaxChars =
  Number.isInteger(configuredGuestPromptMaxChars) && configuredGuestPromptMaxChars > 0
    ? configuredGuestPromptMaxChars
    : 4000;
const configuredGuestConcurrencyLimit = Number(process.env.REKKY_GUEST_CONCURRENCY_LIMIT);
const guestConcurrencyLimit =
  Number.isInteger(configuredGuestConcurrencyLimit) && configuredGuestConcurrencyLimit > 0
    ? configuredGuestConcurrencyLimit
    : 2;
const configuredGuestBurstLimit = Number(process.env.REKKY_GUEST_BURST_LIMIT);
const guestBurstLimit =
  Number.isInteger(configuredGuestBurstLimit) && configuredGuestBurstLimit > 0
    ? configuredGuestBurstLimit
    : 5;
const guestModel =
  process.env.REKKY_GUEST_MODEL?.trim() ||
  process.env.COOKING_AGENT_MODEL?.trim() ||
  'google/gemini-3.1-flash-lite';
const guestEndpoint = 'OpenRouter';
const guestBurstLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: guestBurstLimit,
  keyGenerator: removePorts,
  store: limiterCache('rekky_guest_chat_burst'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many guest requests. Please try again later.' }),
});
const authenticatedCookingChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.REKKY_AUTHENTICATED_CHAT_MAX_PER_MINUTE) || 20,
  keyGenerator: userId,
  store: limiterCache('rekky_authenticated_chat'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: 'Too many cooking requests. Please try again shortly.' }),
});

function parsedCookies(req) {
  return req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
}

function userId(req) {
  return req.user.id;
}

function guestIp(req) {
  return (req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function guestCookieOptions() {
  return {
    httpOnly: true,
    maxAge: guestSessionMaxAgeSeconds,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

function guestSigningSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for guest trial identity signing.');
  }
  return secret;
}

function guestIdentitySignature(guestId) {
  return crypto.createHmac('sha256', guestSigningSecret()).update(guestId).digest('base64url');
}

function serializeGuestIdentity(guestId) {
  return `${guestId}.${guestIdentitySignature(guestId)}`;
}

function parseGuestIdentity(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const separator = value.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const guestId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = guestIdentitySignature(guestId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  return guestId;
}

function getOrCreateGuestIdentity(req, res) {
  const existing = parseGuestIdentity(parsedCookies(req)[guestSessionCookieName]);
  if (existing) {
    return existing;
  }
  const guestId = crypto.randomUUID();
  res.append(
    'Set-Cookie',
    cookies.serialize(
      guestSessionCookieName,
      serializeGuestIdentity(guestId),
      guestCookieOptions(),
    ),
  );
  return guestId;
}

async function releaseGuestReservations({ guestId, ip, trial, daily, concurrency }) {
  const releases = [];
  if (trial) {
    releases.push(refundGuestTrial(guestId));
  }
  if (daily) {
    releases.push(refundGuestDailyPrompt(ip));
  }
  if (concurrency) {
    releases.push(releaseGuestConcurrency(ip));
  }
  const results = await Promise.allSettled(releases);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error('[CookingGuest] Failed to release guest reservation', result.reason);
    }
  }
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

function assertOptionalObjectId(value, message) {
  assertOptionalText(value, message);
  if (value != null && !isValidObjectIdString(value.trim())) {
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

function assertVoiceTurnBody(body) {
  const payload = isObject(body) ? body : {};
  for (const [key, maxLength] of [
    ['conversationId', 128],
    ['turnId', 256],
    ['userText', 4000],
    ['assistantText', 8000],
  ]) {
    if (
      typeof payload[key] !== 'string' ||
      !payload[key].trim() ||
      payload[key].length > maxLength
    ) {
      throw new CookingValidationError('Voice turn payload is malformed.');
    }
  }
}

function handleError(res, error) {
  if (error instanceof CookingValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

async function recordCookingChatUsage({
  req,
  db,
  conversationId,
  messageId,
  model,
  collectedUsage,
}) {
  if (!collectedUsage.length) {
    return;
  }
  try {
    await recordCollectedUsage(
      {
        spendTokens: db.spendTokens,
        spendStructuredTokens: db.spendStructuredTokens,
        pricing: { getMultiplier: db.getMultiplier, getCacheMultiplier: db.getCacheMultiplier },
        bulkWriteOps: {
          insertMany: db.bulkInsertTransactions,
          updateBalance: db.updateBalance,
        },
      },
      {
        user: userId(req),
        conversationId,
        collectedUsage,
        context: 'message',
        messageId,
        balance: getBalanceConfig(req.config),
        transactions: getTransactionsConfig(req.config),
        model,
      },
    );
  } catch (usageError) {
    logger.error('[CookingChat] failed to record provider usage', usageError);
  }
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

function splitAssistantTextBlocks(text) {
  const content = typeof text === 'string' ? text : '';
  if (!content.trim()) {
    return [];
  }

  const parts = content.split(/(\n{2,})/);
  const blocks = [];
  let pendingSeparator = '';
  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (/^\n{2,}$/.test(part)) {
      pendingSeparator += part;
      continue;
    }

    const lines = part.split('\n');
    const allSemanticLines =
      lines.length > 1 &&
      lines.every((line) => {
        const trimmed = line.trim();
        return !trimmed || /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/.test(trimmed);
      });

    if (!allSemanticLines) {
      blocks.push(`${pendingSeparator}${part}`);
      pendingSeparator = '';
      continue;
    }

    for (const line of lines) {
      if (!line.trim()) {
        pendingSeparator += '\n';
        continue;
      }
      blocks.push(`${pendingSeparator}${line}`);
      pendingSeparator = '\n';
    }
  }

  return blocks.length > 0 ? blocks : [content];
}

async function streamAssistantText(
  res,
  { text, messageId, parentMessageId, conversationId, onFirstChunk },
) {
  const content = typeof text === 'string' ? text : '';
  if (!content) {
    return;
  }

  const blocks = splitAssistantTextBlocks(content);
  let cumulative = '';
  let firstChunkSent = false;
  for (let index = 0; index < blocks.length; index += 1) {
    cumulative += blocks[index];
    sendEvent(res, {
      message: true,
      text: cumulative,
      messageId,
      parentMessageId,
      conversationId,
    });
    if (!firstChunkSent) {
      firstChunkSent = true;
      onFirstChunk?.();
    }
    if (index < blocks.length - 1) {
      await delay(90);
    }
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

router.get('/guest/status', async (req, res) => {
  const guestId = getOrCreateGuestIdentity(req, res);
  const used = await hasConsumedGuestTrial(guestId);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ used });
});

router.post('/guest/chat', guestBurstLimiter, configMiddleware, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }
  if (text.length > guestPromptMaxChars) {
    return res
      .status(413)
      .json({ error: `Guest prompts must be ${guestPromptMaxChars} characters or fewer.` });
  }
  if (Array.isArray(req.body?.files) && req.body.files.length > 0) {
    return res.status(400).json({ error: 'Sign in to use attachments with Rekky.' });
  }

  const guestId = getOrCreateGuestIdentity(req, res);
  const ip = guestIp(req);
  let trialReserved = false;
  let dailyReserved = false;
  let concurrencyReserved = false;

  trialReserved = await reserveGuestTrial(guestId);
  if (!trialReserved) {
    return res.status(403).json({ error: 'Sign in to continue cooking with Rekky.' });
  }

  try {
    dailyReserved = await consumeGuestDailyPrompt(ip, guestDailyPromptLimit);
  } catch (error) {
    await releaseGuestReservations({ guestId, ip, trial: true, daily: false, concurrency: false });
    throw error;
  }
  if (!dailyReserved) {
    await releaseGuestReservations({ guestId, ip, trial: true, daily: false, concurrency: false });
    return res.status(429).json({ error: 'Guest prompt limit reached. Please sign in.' });
  }

  try {
    concurrencyReserved = await reserveGuestConcurrency(ip, guestConcurrencyLimit);
  } catch (error) {
    await releaseGuestReservations({ guestId, ip, trial: true, daily: true, concurrency: false });
    throw error;
  }
  if (!concurrencyReserved) {
    await releaseGuestReservations({ guestId, ip, trial: true, daily: true, concurrency: false });
    return res.status(429).json({ error: 'Too many guest requests are already running.' });
  }

  const conversationId = Constants.NEW_CONVO;
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
  const endpoint = guestEndpoint;
  const model = guestModel;
  const guestUser = generateGuestUserId(ip);
  const perf = createChatPerfTrace({ conversationId, endpoint, model, isNewConvo: true });

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  perf.mark('guest_headers_flushed', { promptChars: text.length });

  const requestMessage = {
    text,
    conversationId,
    messageId: userMessageId,
    parentMessageId,
    isCreatedByUser: true,
    error: false,
    user: guestUser,
  };
  sendEvent(res, { message: requestMessage, created: true, cooking: true });

  try {
    let assistantTextStreamed = false;
    let cumulativeText = '';
    const result = await runCookingChat({
      user: guestUser,
      conversationId,
      text,
      model,
      promptPrefix:
        'This is an anonymous one-prompt trial. Answer in chat only. Do not create, revise, or refer to a saved canvas, saved recipe, saved preferences, account history, or uploaded files.',
      preferencesMarkdown: '',
      messages: [],
      activeDraft: null,
      documents: [],
      webSearchConfig: undefined,
      conversationCreatedAt: new Date(),
      allowDocumentTools: false,
      allowCulinaryTools: false,
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
          perf.mark('guest_first_text_event_sent');
        }
        if (isFinal) {
          await streamAssistantText(res, {
            text: delta,
            messageId: responseMessageId,
            parentMessageId: userMessageId,
            conversationId,
          });
          return;
        }
        cumulativeText += delta;
        sendEvent(res, {
          message: true,
          text: cumulativeText,
          messageId: responseMessageId,
          parentMessageId: userMessageId,
          conversationId,
        });
      },
    });
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
      user: guestUser,
    };
    const conversation = {
      conversationId,
      endpoint,
      model,
      title: conversationTitle(text),
    };

    if (!assistantTextStreamed) {
      await streamAssistantText(res, {
        text: result.text,
        messageId: responseMessage.messageId,
        parentMessageId: responseMessage.parentMessageId,
        conversationId,
        onFirstChunk: () => perf.mark('guest_first_text_event_sent'),
      });
    }
    await commitGuestTrial(guestId);
    sendEvent(res, {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage,
      responseMessage,
      guestLimitReached: true,
    });
    await releaseGuestReservations({
      guestId,
      ip,
      trial: false,
      daily: false,
      concurrency: true,
    });
    perf.log('info', { status: 'guest_ok' });
    res.end();
  } catch (error) {
    await releaseGuestReservations({ guestId, ip, trial: true, daily: true, concurrency: true });
    const errorResponseMessage = {
      messageId: responseMessageId,
      parentMessageId: userMessageId,
      conversationId,
      sender: cookingAssistantName,
      endpoint,
      model: model || '',
      text: 'Rekky could not complete that request. Please try again.',
      unfinished: false,
      error: true,
      isCreatedByUser: false,
      user: guestUser,
    };
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
      guestLimitReached: false,
    });
    perf.log('warn', {
      status: 'guest_error',
      error: error instanceof Error ? error.message : 'unknown error',
    });
    res.end();
  }
});

router.use(requireJwtAuth, checkBan, configMiddleware);

router.get('/voice/config', (_req, res) => {
  const configuration = getVoiceSessionConfiguration();
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(configuration);
});

router.post('/voice/session', authenticatedCookingChatLimiter, (req, res) => {
  const configuration = getVoiceSessionConfiguration();
  if (!configuration.enabled) {
    return res.status(503).json({ error: 'Voice mode is not configured.' });
  }
  try {
    const grant = createVoiceSessionGrant({
      endpoint: process.env.REKKY_VOICE_URL,
      secret: process.env.REKKY_VOICE_TOKEN_SECRET,
      ttlSeconds: Number(process.env.REKKY_VOICE_SESSION_TTL_SECONDS) || 180,
      userId: userId(req),
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(grant);
  } catch (error) {
    logger.error('[cooking/voice/session] Failed to create voice grant', error);
    return res.status(503).json({ error: 'Voice mode is temporarily unavailable.' });
  }
});

router.post('/voice/turns', authenticatedCookingChatLimiter, async (req, res) => {
  try {
    assertVoiceTurnBody(req.body);
    const db = models();
    const user = userId(req);
    const conversationId = req.body.conversationId.trim();
    const conversation = await db.getConvo(user, conversationId);
    if (!conversation) {
      return res.sendStatus(404);
    }

    const turnKey = crypto
      .createHash('sha256')
      .update(`${user}:${conversationId}:${req.body.turnId}`)
      .digest('hex')
      .slice(0, 32);
    const userMessageId = `voice-user-${turnKey}`;
    const assistantMessageId = `voice-assistant-${turnKey}`;
    const existing = await db.getMessages({
      user,
      conversationId,
      messageId: { $in: [userMessageId, assistantMessageId] },
    });
    const existingIds = new Set(existing.map((message) => message.messageId));
    if (existingIds.has(userMessageId) && existingIds.has(assistantMessageId)) {
      return res.json({ userMessageId, assistantMessageId });
    }

    const messages = await db.getMessages({ user, conversationId }, 'messageId');
    const parentMessageId = messages.at(-1)?.messageId ?? Constants.NO_PARENT;
    if (!existingIds.has(userMessageId)) {
      await db.saveMessage(
        requestContext(req),
        {
          messageId: userMessageId,
          parentMessageId,
          conversationId,
          sender: 'User',
          text: req.body.userText.trim(),
          isCreatedByUser: true,
          error: false,
          user,
          metadata: { cookingVoiceTurn: true },
        },
        { context: 'POST /api/cooking/voice/turns - user message' },
      );
    }
    if (!existingIds.has(assistantMessageId)) {
      await db.saveMessage(
        requestContext(req),
        {
          messageId: assistantMessageId,
          parentMessageId: userMessageId,
          conversationId,
          sender: cookingAssistantName,
          endpoint: 'agents',
          model: 'realtime-voice',
          text: req.body.assistantText.trim(),
          isCreatedByUser: false,
          error: false,
          user,
          metadata: { cookingVoiceTurn: true },
        },
        { context: 'POST /api/cooking/voice/turns - assistant message' },
      );
    }
    return res.status(201).json({ userMessageId, assistantMessageId });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/chat', authenticatedCookingChatLimiter, moderateText, async (req, res) => {
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
  const model = process.env.COOKING_AGENT_MODEL?.trim() || undefined;
  const reqCtx = requestContext(req);
  const perf = createChatPerfTrace({ conversationId, endpoint, model, isNewConvo });
  const collectedUsage = [];
  let usageRecorded = false;
  const abortController = new AbortController();
  const abortOnClose = () => {
    if (!res.writableEnded && !abortController.signal.aborted) {
      abortController.abort();
    }
  };
  res.on('close', abortOnClose);
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

  sendEvent(res, { message: requestMessage, created: true, cooking: true });
  perf.mark('request_message_event_sent');

  const db = models();
  const recordUsageOnce = async (usage) => {
    if (usageRecorded || !usage.length) {
      return;
    }
    usageRecorded = true;
    await recordCookingChatUsage({
      req,
      db,
      conversationId,
      messageId: responseMessageId,
      model,
      collectedUsage: usage,
    });
  };

  try {
    const contextStartedAt = Date.now();
    const [preferences, documentCollection, existingConversation] = await Promise.all([
      getExistingPreferences(userId(req)),
      listCookingDocuments(userId(req), conversationId),
      isNewConvo ? Promise.resolve(null) : db.getConvo(userId(req), conversationId),
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
      preferencesMarkdown: preferences?.markdown,
      messages: historyMessages,
      activeDraft,
      documents: documentCollection.documents,
      webSearchConfig: req.config?.webSearch,
      loadAuthValues,
      conversationCreatedAt: req.body?.createdAt || new Date(),
      image_urls: imageUrls,
      signal: abortController.signal,
      onUsage: (usage) => collectedUsage.push(usage),
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
    const cookingCategory = resolveCookingChatCategory({
      currentCategory: existingConversation?.cookingCategory,
      proposedCategory: result.activeCategory,
      text,
      intent: result.activeIntent || 'general_cooking_question',
      action: result.activeAction || 'direct_answer',
      existingDocumentTypes: documentCollection.documents.map((document) => document.documentType),
      changedDocumentType: result.draftChanged ? result.draft?.documentType : undefined,
    });
    const metadata = {
      ...(result.promptSuggestions?.length
        ? { cookingPromptSuggestions: result.promptSuggestions }
        : {}),
      ...(result.webSources?.length ? { cookingWebSources: result.webSources } : {}),
      ...(result.activeIntent ? { cookingActiveIntent: result.activeIntent } : {}),
      ...(result.activeAction ? { cookingActiveAction: result.activeAction } : {}),
      cookingCategory,
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
      cookingCategory,
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
    await recordUsageOnce(collectedUsage.length ? collectedUsage : (result.usage ?? []));
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
    await recordUsageOnce(collectedUsage);
    if (abortController.signal.aborted) {
      perf.log('info', { status: 'client_disconnected' });
      return;
    }
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
    assertOptionalObjectId(req.body?.savedRecipeId, 'Saved recipe id is malformed.');
    assertDocumentType(req.body?.documentType);
    if (req.body?.recipe != null) {
      assertRecipe(req.body.recipe);
    }
    const savedRecipeId = req.body?.savedRecipeId?.trim();
    if (savedRecipeId && !req.body.conversationId) {
      throw new CookingValidationError('Conversation id is required for a saved recipe chat.');
    }
    const db = models();
    const reqCtx = requestContext(req);
    const document = savedRecipeId
      ? await startSavedRecipeDiscussion(
          {
            user: userId(req),
            savedRecipeId,
            conversationId: req.body.conversationId,
            prompt: req.body.prompt,
            title: conversationTitle(req.body.prompt),
            documentMarkdown: req.body.documentMarkdown,
            documentType: req.body.documentType,
            recipe: req.body.recipe,
          },
          (conversation) =>
            db.saveConvo(reqCtx, conversation, {
              context: 'POST /api/cooking/documents - start saved recipe discussion',
            }),
        )
      : await createCookingDocument(
          userId(req),
          req.body.prompt,
          req.body.conversationId,
          req.body.documentMarkdown,
          req.body.documentType,
          req.body.recipe,
        );
    if (!document) {
      return res.sendStatus(404);
    }
    if (req.body.conversationId) {
      if (!savedRecipeId) {
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

module.exports = router;
