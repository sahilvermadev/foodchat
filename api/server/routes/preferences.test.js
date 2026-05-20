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

  return {
    PreferencesValidationError,
    getPreferences: jest.fn(),
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
});
