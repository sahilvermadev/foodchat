const express = require('express');
const request = require('supertest');

let mockCurrentUser;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockCurrentUser) {
      return res.sendStatus(401);
    }
    req.user = mockCurrentUser;
    return next();
  },
}));

jest.mock('~/models', () => ({
  saveMessage: jest.fn().mockResolvedValue({}),
  saveConvo: jest.fn().mockResolvedValue({}),
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
    extractAndSavePreferences: jest.fn(),
    getExistingPreferences: jest.fn(),
    getCookingDraftByConversation: jest.fn(),
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
    cookingApi.extractAndSavePreferences.mockResolvedValue({ changed: false, warnings: [] });
    cookingApi.runCookingChat.mockResolvedValue({
      text: 'Here is the recipe.',
      draftChanged: false,
    });
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

  test('chat loads preferences server-side and extracts preference updates', async () => {
    cookingApi.getExistingPreferences.mockResolvedValue({
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '## Safety\n- Avoid peanuts',
    });
    cookingApi.extractAndSavePreferences.mockResolvedValue({ changed: true, warnings: [] });

    const response = await request(app)
      .post('/api/cooking/chat')
      .send({
        text: 'I prefer spicy weeknight dinners',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        responseMessageId: 'message-2',
      })
      .expect(200);

    expect(response.text).toContain('"preferencesUpdated":true');
    expect(cookingApi.runCookingChat).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'auth-user',
        conversationId: 'conversation-1',
        text: 'I prefer spicy weeknight dinners',
        preferencesMarkdown: '## Safety\n- Avoid peanuts',
        webSearchConfig: undefined,
        loadAuthValues: expect.any(Function),
        conversationCreatedAt: expect.any(Date),
      }),
    );
    expect(cookingApi.extractAndSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'auth-user',
        userMessage: 'I prefer spicy weeknight dinners',
        assistantMessage: 'Here is the recipe.',
        currentMarkdown: '## Safety\n- Avoid peanuts',
      }),
    );
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
