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

jest.mock('@librechat/api', () => {
  class PreferencesValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'PreferencesValidationError';
    }
  }

  class SpecialtyIngredientValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'SpecialtyIngredientValidationError';
    }
  }

  return {
    PreferencesValidationError,
    SpecialtyIngredientValidationError,
    getPreferences: jest.fn(),
    getSpecialtyIngredientImage: jest.fn(),
    listSpecialtyIngredients: jest.fn(),
    resolveSpecialtyIngredient: jest.fn(),
    streamGenerativePrompts: jest.fn(),
    updatePreferences: jest.fn(),
    runPreferencesChat: jest.fn(),
  };
});

const preferencesApi = require('@librechat/api');
const preferencesRoutes = require('./preferences');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/preferences', preferencesRoutes);
  return app;
}

describe('preferences routes', () => {
  let app;

  beforeEach(() => {
    mockCurrentUser = { id: 'auth-user' };
    app = createApp();
    jest.clearAllMocks();
    preferencesApi.getPreferences.mockResolvedValue({
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '',
    });
    preferencesApi.updatePreferences.mockResolvedValue({
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '## Taste\n- Spicy',
    });
    preferencesApi.runPreferencesChat.mockResolvedValue({
      text: 'Any allergies I should know about?',
      preferences: {
        _id: 'preferences-1',
        user: 'auth-user',
        markdown: '',
      },
      preferencesChanged: false,
    });
    preferencesApi.getSpecialtyIngredientImage.mockResolvedValue({
      buffer: Buffer.from('cached-ingredient'),
      contentType: 'image/webp',
    });
    preferencesApi.streamGenerativePrompts.mockImplementation(async (_input, writer) => {
      await writer.write('{"op":"add","path":"/root","value":"suggestions"}\n');
    });
  });

  test('unauthenticated requests are blocked by auth middleware', async () => {
    mockCurrentUser = null;

    await request(app).get('/api/preferences').expect(401);

    expect(preferencesApi.getPreferences).not.toHaveBeenCalled();
  });

  test('fetches and updates preferences for the authenticated user', async () => {
    await request(app).get('/api/preferences').expect(200, {
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '',
    });
    await request(app).put('/api/preferences').send({ markdown: '## Taste\n- Spicy' }).expect(200, {
      _id: 'preferences-1',
      user: 'auth-user',
      markdown: '## Taste\n- Spicy',
    });

    expect(preferencesApi.getPreferences).toHaveBeenCalledWith('auth-user');
    expect(preferencesApi.updatePreferences).toHaveBeenCalledWith('auth-user', '## Taste\n- Spicy');
  });

  test('rejects malformed markdown payloads before service call', async () => {
    await request(app).put('/api/preferences').send({ markdown: null }).expect(400, {
      error: 'Preferences markdown is required.',
    });

    expect(preferencesApi.updatePreferences).not.toHaveBeenCalled();
  });

  test('maps service validation errors to 400', async () => {
    preferencesApi.updatePreferences.mockRejectedValue(
      new preferencesApi.PreferencesValidationError('Preferences markdown is malformed.'),
    );

    await request(app)
      .put('/api/preferences')
      .send({ markdown: 'bad' })
      .expect(400, { error: 'Preferences markdown is malformed.' });
  });

  test('runs preferences chat for the authenticated user', async () => {
    await request(app)
      .post('/api/preferences/chat')
      .send({
        message: 'I avoid peanuts',
        model: 'test-model',
        history: [{ role: 'assistant', content: 'Any allergies?' }],
        deviceContext: {
          locale: 'en-IN',
          timeZone: 'Asia/Calcutta',
          measurementSystem: 'metric',
        },
      })
      .expect(200, {
        text: 'Any allergies I should know about?',
        preferences: {
          _id: 'preferences-1',
          user: 'auth-user',
          markdown: '',
        },
        preferencesChanged: false,
      });

    expect(preferencesApi.runPreferencesChat).toHaveBeenCalledWith({
      user: 'auth-user',
      message: 'I avoid peanuts',
      model: 'test-model',
      history: [{ role: 'assistant', content: 'Any allergies?' }],
      deviceContext: {
        locale: 'en-IN',
        timeZone: 'Asia/Calcutta',
        measurementSystem: 'metric',
      },
    });
  });

  test('streams generative prompts with a server-controlled model', async () => {
    await request(app)
      .post('/api/preferences/generative-prompts')
      .send({
        model: 'untrusted/expensive-model',
        environmental_context: { current_month: 'June' },
      })
      .expect(200)
      .expect('Content-Type', /application\/x-ndjson/);

    expect(preferencesApi.streamGenerativePrompts).toHaveBeenCalledTimes(1);
    const [input] = preferencesApi.streamGenerativePrompts.mock.calls[0];
    expect(input).toMatchObject({
      user: 'auth-user',
      environmentalContext: { current_month: 'June' },
    });
    expect(input).not.toHaveProperty('model');
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  test('serves ingredient thumbnails with browser caching', async () => {
    const response = await request(app)
      .get('/api/preferences/ingredients/ingredient-1/image?variant=thumbnail&v=1')
      .expect(200)
      .expect('Content-Type', /image\/webp/)
      .expect('Cache-Control', 'private, max-age=31536000, immutable');

    expect(response.body).toEqual(Buffer.from('cached-ingredient'));
    expect(preferencesApi.getSpecialtyIngredientImage).toHaveBeenCalledWith('ingredient-1', true);
  });
});
