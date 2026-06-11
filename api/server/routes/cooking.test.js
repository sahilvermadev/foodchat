const express = require('express');
const request = require('supertest');

let mockCurrentUser;
const mockWebSearchConfig = {
  searchProvider: 'tavily',
  scraperProvider: 'tavily',
  tavilyApiKey: '${TAVILY_API_KEY}',
};

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockCurrentUser) {
      return res.sendStatus(401);
    }
    req.user = mockCurrentUser;
    return next();
  },
  configMiddleware: (req, res, next) => {
    req.config = {
      interfaceConfig: { webSearch: true },
      webSearch: mockWebSearchConfig,
    };
    return next();
  },
}));

jest.mock('~/models', () => ({
  saveMessage: jest.fn().mockResolvedValue({}),
  saveConvo: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/server/services/Files/images/encode', () => ({
  encodeAndFormat: jest.fn(),
}));

jest.mock('@librechat/api', () => {
  class CookingValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CookingValidationError';
    }
  }

  return {
    CookingValidationError,
    runCookingChat: jest.fn(),
    curatePendingPreferences: jest.fn(),
    withPendingPreferenceBatch: jest.fn((message) => ({
      ...message,
      metadata: {
        ...(message.metadata || {}),
        cookingPreferenceBatch: { status: 'pending' },
      },
    })),
    getExistingPreferences: jest.fn(),
    getCookingDraftByConversation: jest.fn(),
    listCookingDocuments: jest.fn(),
    createCookingDocument: jest.fn(),
    selectCookingDocument: jest.fn(),
    deleteCookingDocument: jest.fn(),
    updateCookingDocument: jest.fn(),
    generateCookingDraft: jest.fn(),
    updateCookingDraft: jest.fn(),
    startCookingSession: jest.fn(),
    getCookingSession: jest.fn(),
    appendCookingSessionEvent: jest.fn(),
    completeCookingSession: jest.fn(),
  };
});

const cookingApi = require('@librechat/api');
const { Constants } = require('librechat-data-provider');
const cookingRoutes = require('./cooking');
const db = require('~/models');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');

const user = { id: 'auth-user' };

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cooking', cookingRoutes);
  return app;
}

function recipe() {
  return {
    title: 'Soup',
    description: '',
    servings: 2,
    timing: { prepMinutes: 5, cookMinutes: 20, totalMinutes: 25 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '1 cup lentils',
        quantity: 1,
        unit: 'cup',
        item: 'lentils',
        quantityType: 'measured',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Cook lentils.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
    ],
    notes: [],
    tags: [],
  };
}

describe('cooking routes', () => {
  let app;

  beforeEach(() => {
    mockCurrentUser = user;
    app = createApp();
    jest.clearAllMocks();
    cookingApi.generateCookingDraft.mockResolvedValue({ _id: 'draft-1' });
    cookingApi.updateCookingDraft.mockResolvedValue({ _id: 'draft-1' });
    cookingApi.getExistingPreferences.mockResolvedValue(null);
    cookingApi.getCookingDraftByConversation.mockResolvedValue(null);
    cookingApi.listCookingDocuments.mockResolvedValue({ documents: [] });
    cookingApi.createCookingDocument.mockResolvedValue({ _id: 'document-1' });
    cookingApi.updateCookingDocument.mockResolvedValue({ _id: 'document-1' });
    cookingApi.selectCookingDocument.mockResolvedValue({
      documents: [{ _id: 'document-1', selected: true }],
      selectedDocumentId: 'document-1',
    });
    cookingApi.deleteCookingDocument.mockResolvedValue({ documents: [] });
    cookingApi.curatePendingPreferences.mockResolvedValue({
      attempted: false,
      changed: false,
      processedCount: 0,
      warnings: [],
    });
    cookingApi.runCookingChat.mockResolvedValue({
      text: 'Here is the recipe.',
      draftChanged: false,
    });
    encodeAndFormat.mockResolvedValue({ files: [], image_urls: [] });
    cookingApi.startCookingSession.mockResolvedValue({ _id: 'session-1' });
    cookingApi.getCookingSession.mockResolvedValue({ _id: 'session-1' });
    cookingApi.appendCookingSessionEvent.mockResolvedValue({ _id: 'session-1' });
    cookingApi.completeCookingSession.mockResolvedValue({ _id: 'session-1' });
  });

  test('unauthenticated requests are blocked by auth middleware', async () => {
    mockCurrentUser = null;

    await request(app).patch('/api/cooking/drafts/draft-1').send({ recipe: recipe() }).expect(401);

    expect(cookingApi.updateCookingDraft).not.toHaveBeenCalled();
  });

  test('happy path endpoints return expected statuses and response shapes', async () => {
    const draftResponse = await request(app)
      .post('/api/cooking/drafts/generate')
      .send({ prompt: 'Soup' })
      .expect(201, {
        _id: 'draft-1',
      });
    await request(app)
      .patch('/api/cooking/drafts/draft-1')
      .send({ recipe: recipe() })
      .expect(200, { _id: 'draft-1' });
    await request(app)
      .post('/api/cooking/sessions')
      .send({ draftId: 'draft-1' })
      .expect(201, { _id: 'session-1' });
    await request(app).get('/api/cooking/sessions/session-1').expect(200, { _id: 'session-1' });
    await request(app)
      .post('/api/cooking/sessions/session-1/events')
      .send({ event: { type: 'note', stepIndex: 0, text: 'Less salt' } })
      .expect(200, { _id: 'session-1' });
    await request(app)
      .post('/api/cooking/sessions/session-1/complete')
      .send({ rating: 4, note: 'Good' })
      .expect(200, { _id: 'session-1' });

    expect(draftResponse.status).toBe(201);
  });

  test('document endpoints create, list, select, update, and delete cooking documents', async () => {
    await request(app)
      .post('/api/cooking/documents')
      .send({ prompt: 'Starter', conversationId: 'conversation-1', documentType: 'guide' })
      .expect(201, { _id: 'document-1' });
    await request(app)
      .get('/api/cooking/documents/by-conversation/conversation-1')
      .expect(200, { documents: [] });
    await request(app)
      .patch('/api/cooking/documents/document-1')
      .send({ documentMarkdown: '# Starter' })
      .expect(200, { _id: 'document-1' });
    await request(app).post('/api/cooking/documents/document-1/select').expect(200);
    await request(app).delete('/api/cooking/documents/document-1').expect(200, { documents: [] });

    expect(cookingApi.createCookingDocument).toHaveBeenCalledWith(
      'auth-user',
      'Starter',
      'conversation-1',
      undefined,
      'guide',
      undefined,
    );
    expect(cookingApi.listCookingDocuments).toHaveBeenCalledWith('auth-user', 'conversation-1');
  });

  test('passes authenticated user id into every service call', async () => {
    await request(app)
      .post('/api/cooking/drafts/generate')
      .send({ user: 'body-user', prompt: 'Soup' });
    await request(app)
      .patch('/api/cooking/drafts/draft-1')
      .send({ user: 'body-user', recipe: recipe() });
    await request(app)
      .post('/api/cooking/sessions')
      .send({ user: 'body-user', draftId: 'draft-1' });
    await request(app).get('/api/cooking/sessions/session-1');
    await request(app)
      .post('/api/cooking/sessions/session-1/events')
      .send({ user: 'body-user', event: { type: 'navigation', action: 'next' } });
    await request(app)
      .post('/api/cooking/sessions/session-1/complete')
      .send({ user: 'body-user', rating: 5, note: 'Great' });

    expect(cookingApi.generateCookingDraft).toHaveBeenCalledWith(
      'auth-user',
      'Soup',
      undefined,
      undefined,
      undefined,
    );
    expect(cookingApi.updateCookingDraft).toHaveBeenCalledWith(
      'auth-user',
      'draft-1',
      recipe(),
      undefined,
    );
    expect(cookingApi.startCookingSession).toHaveBeenCalledWith({
      user: 'auth-user',
      draftId: 'draft-1',
    });
    expect(cookingApi.getCookingSession).toHaveBeenCalledWith('auth-user', 'session-1');
    expect(cookingApi.appendCookingSessionEvent).toHaveBeenCalledWith({
      user: 'auth-user',
      sessionId: 'session-1',
      event: { type: 'navigation', action: 'next' },
    });
    expect(cookingApi.completeCookingSession).toHaveBeenCalledWith({
      user: 'auth-user',
      sessionId: 'session-1',
      rating: 5,
      note: 'Great',
    });
  });

  test('chat loads preferences server-side and queues preference batch curation', async () => {
    cookingApi.getExistingPreferences.mockResolvedValue({
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '## Safety\n- Avoid peanuts',
    });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'I prefer spicy weeknight dinners',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    expect(response.text).not.toContain('"preferencesUpdated":true');
    expect(cookingApi.runCookingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'auth-user',
        conversationId: 'conversation-1',
        text: 'I prefer spicy weeknight dinners',
        preferencesMarkdown: '## Safety\n- Avoid peanuts',
        documents: [],
        webSearchConfig: mockWebSearchConfig,
        loadAuthValues: expect.any(Function),
        conversationCreatedAt: expect.any(Date),
      }),
    );
    expect(cookingApi.withPendingPreferenceBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'auth-user',
        messageId: 'message-1',
        text: 'I prefer spicy weeknight dinners',
      }),
    );
    expect(cookingApi.curatePendingPreferences).toHaveBeenCalledWith({
      user: 'auth-user',
      conversationId: 'conversation-1',
    });
  });

  test('chat does not forward stale client history when starting a new cooking conversation', async () => {
    await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'I have carbonara Buldak noodles and bacon strips.',
        conversationId: Constants.NEW_CONVO,
        messages: [
          {
            messageId: 'old-1',
            conversationId: 'old-paneer-conversation',
            isCreatedByUser: true,
            text: 'I have spinach and paneer.',
          },
        ],
      })
      .expect(200);

    expect(cookingApi.runCookingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'I have carbonara Buldak noodles and bacon strips.',
        messages: [],
      }),
    );
  });

  test('chat restores the latest recipe image for a follow-up canvas request', async () => {
    const sourceFile = {
      file_id: 'recipe-image-1',
      filepath: '/uploads/recipe-image-1.png',
      filename: 'pizza-recipe.png',
      type: 'image/png',
      width: 960,
      height: 740,
    };
    const imageBlock = {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,recipe-source', detail: 'auto' },
    };
    encodeAndFormat
      .mockResolvedValueOnce({ files: [], image_urls: [] })
      .mockResolvedValueOnce({ files: [sourceFile], image_urls: [imageBlock] });

    await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'Create the pizza recipe canvas',
        conversationId: 'conversation-1',
        messageId: 'message-3',
        responseMessageId: 'message-4',
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: 'Give me this recipe',
            files: [sourceFile],
          },
          {
            messageId: 'message-2',
            conversationId: 'conversation-1',
            isCreatedByUser: false,
            text: 'I can create that recipe canvas.',
          },
        ],
      })
      .expect(200);

    expect(cookingApi.runCookingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            messageId: 'message-1',
            image_urls: [imageBlock],
          }),
        ]),
      }),
    );
  });

  test('chat does not restore an old recipe image for an unrelated follow-up', async () => {
    const sourceFile = {
      file_id: 'recipe-image-1',
      filepath: '/uploads/recipe-image-1.png',
      filename: 'pizza-recipe.png',
      type: 'image/png',
      width: 960,
      height: 740,
    };

    await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'How do I keep onions from burning?',
        conversationId: 'conversation-1',
        messageId: 'message-3',
        responseMessageId: 'message-4',
        messages: [
          {
            messageId: 'message-1',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: 'Give me this recipe',
            files: [sourceFile],
          },
          {
            messageId: 'message-2',
            conversationId: 'conversation-1',
            isCreatedByUser: false,
            text: 'Here is the recipe.',
          },
        ],
      })
      .expect(200);

    expect(encodeAndFormat).toHaveBeenCalledTimes(1);
    expect(cookingApi.runCookingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.not.arrayContaining([
          expect.objectContaining({ image_urls: expect.any(Array) }),
        ]),
      }),
    );
  });

  test('chat persists normalized image source metadata on the user message', async () => {
    const sourceFile = {
      file_id: 'recipe-image-1',
      filepath: '/uploads/recipe-image-1.png',
      filename: 'pizza-recipe.png',
      type: 'image/png',
      width: 960,
      height: 740,
    };
    const imageBlock = {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,recipe-source', detail: 'auto' },
    };
    encodeAndFormat.mockResolvedValue({ files: [sourceFile], image_urls: [imageBlock] });

    await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'Give me this recipe',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
        files: [sourceFile],
      })
      .expect(200);

    expect(db.saveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messageId: 'message-1',
        files: [sourceFile],
        metadata: expect.objectContaining({
          cookingSource: {
            type: 'image',
            fileIds: ['recipe-image-1'],
            filenames: ['pizza-recipe.png'],
          },
        }),
      }),
      expect.anything(),
    );
  });

  test('chat persists prompt suggestions on assistant message metadata', async () => {
    cookingApi.runCookingChat.mockResolvedValue({
      text: 'Here is the recipe.',
      draftChanged: false,
      promptSuggestions: [
        'How should I prep this for a weeknight dinner?',
        'What texture cues should I watch for?',
      ],
    });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'Make dal',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    expect(response.text).toContain('"cookingPromptSuggestions"');
    expect(db.saveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messageId: 'message-2',
        sender: 'Samwise',
        metadata: {
          cookingPromptSuggestions: [
            'How should I prep this for a weeknight dinner?',
            'What texture cues should I watch for?',
          ],
        },
      }),
      expect.objectContaining({ context: 'POST /api/cooking/chat - response message' }),
    );
  });

  test('chat persists cooking web sources on assistant message metadata', async () => {
    cookingApi.runCookingChat.mockResolvedValue({
      text: 'The USDA source is the one to use.',
      draftChanged: false,
      promptSuggestions: ['Can you turn this into a tested canning recipe?'],
      webSources: [
        {
          title: 'USDA Complete Guide',
          url: 'https://www.nifa.usda.gov/example',
          sourceType: 'safety',
          accessedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'Is this safe to can?',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    expect(response.text).toContain('"cookingWebSources"');
    expect(db.saveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messageId: 'message-2',
        metadata: {
          cookingPromptSuggestions: ['Can you turn this into a tested canning recipe?'],
          cookingWebSources: [
            {
              title: 'USDA Complete Guide',
              url: 'https://www.nifa.usda.gov/example',
              sourceType: 'safety',
              accessedAt: '2026-05-18T00:00:00.000Z',
            },
          ],
        },
      }),
      expect.objectContaining({ context: 'POST /api/cooking/chat - response message' }),
    );
  });

  test('chat forwards live assistant deltas from the cooking agent', async () => {
    cookingApi.runCookingChat.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta('Use a wide ');
      onTextDelta('pan.');
      return {
        text: 'Use a wide pan.',
        draftChanged: false,
      };
    });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'How do I brown onions?',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    const liveMessages = response.text
      .split('\n\n')
      .filter((event) => event.startsWith('event: message\ndata: '))
      .map((event) => JSON.parse(event.slice(event.indexOf('data: ') + 6)))
      .filter((payload) => payload.message === true);

    expect(liveMessages.map((payload) => payload.text)).toEqual(['Use a wide ', 'Use a wide pan.']);
  });

  test('chat exposes only the validated cooking reply emitted by the agent', async () => {
    cookingApi.runCookingChat.mockImplementation(async ({ onTextDelta }) => {
      onTextDelta('Make egg bhurji in about 10 minutes.');
      return {
        text: 'Make egg bhurji in about 10 minutes.',
        draftChanged: false,
      };
    });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'suggest me something fast under 15 mins',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    expect(response.text).toContain('Make egg bhurji in about 10 minutes.');
    expect(response.text).not.toContain('Would you like me to create a recipe canvas');
  });

  test.each([
    [
      'update draft',
      () => cookingApi.updateCookingDraft.mockResolvedValue(null),
      'patch',
      '/drafts/missing',
      { recipe: recipe() },
    ],
    [
      'start session',
      () => cookingApi.startCookingSession.mockResolvedValue(null),
      'post',
      '/sessions',
      { draftId: 'missing' },
    ],
    [
      'get session',
      () => cookingApi.getCookingSession.mockResolvedValue(null),
      'get',
      '/sessions/missing',
      null,
    ],
    [
      'append event',
      () => cookingApi.appendCookingSessionEvent.mockResolvedValue(null),
      'post',
      '/sessions/missing/events',
      { event: { type: 'navigation', action: 'next' } },
    ],
    [
      'complete session',
      () => cookingApi.completeCookingSession.mockResolvedValue(null),
      'post',
      '/sessions/missing/complete',
      { rating: 3, note: '' },
    ],
  ])('%s maps service null to 404', async (_name, setup, method, path, body) => {
    setup();
    const call = request(app)[method](`/api/cooking${path}`);
    if (body != null) {
      call.send(body);
    }
    const response = await call.expect(404);
    expect(response.status).toBe(404);
  });

  test('maps service validation errors to 400', async () => {
    cookingApi.generateCookingDraft.mockRejectedValue(
      new cookingApi.CookingValidationError('Service rejected.'),
    );

    const response = await request(app)
      .post('/api/cooking/drafts/generate')
      .send({ prompt: 'Soup' })
      .expect(400, { error: 'Service rejected.' });

    expect(response.status).toBe(400);
  });

  test('maps unexpected service errors to 500', async () => {
    cookingApi.getCookingSession.mockRejectedValue(new Error('Database unavailable.'));

    const response = await request(app)
      .get('/api/cooking/sessions/session-1')
      .expect(500, { error: 'Database unavailable.' });

    expect(response.status).toBe(500);
  });

  test.each([
    ['missing prompt', '/drafts/generate', { prompt: '' }],
    ['malformed recipe', '/drafts/draft-1', { recipe: { title: 'Soup' } }, 'patch'],
    ['missing session source', '/sessions', {}],
    ['missing event', '/sessions/session-1/events', {}],
    ['malformed event', '/sessions/session-1/events', { event: { type: 'timer' } }],
    ['invalid completion', '/sessions/session-1/complete', { rating: 6, note: 'Nope' }],
  ])('rejects %s with 400 before service call', async (_name, path, body, method = 'post') => {
    const response = await request(app)[method](`/api/cooking${path}`).send(body).expect(400);
    expect(response.status).toBe(400);
  });
});
