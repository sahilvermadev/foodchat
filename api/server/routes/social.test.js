const express = require('express');
const request = require('supertest');

let mockAuthenticated = false;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockAuthenticated) {
      return res.sendStatus(401);
    }
    req.user = { id: 'user-1' };
    return next();
  },
  configMiddleware: (req, _res, next) => {
    req.config = {};
    next();
  },
}));

jest.mock('@librechat/api', () => {
  class ValidationError extends Error {}
  return {
    CookingValidationError: ValidationError,
    SocialImportValidationError: ValidationError,
    fetchRemoteImage: jest.fn(),
    limiterCache: jest.fn(() => undefined),
    createSocialImport: jest.fn(),
    createDraftFromSocialImport: jest.fn(),
    createSocialPlaylistSubscription: jest.fn(),
    deleteSocialPlaylistSubscription: jest.fn(),
    deleteSocialImport: jest.fn(),
    getExistingPreferences: jest.fn(),
    getSocialImportThumbnail: jest.fn(),
    listSocialImportJobs: jest.fn(),
    listSocialImports: jest.fn(),
    listSocialPlaylistSubscriptions: jest.fn(),
    retrySocialImportProcessing: jest.fn(),
    runCookingChat: jest.fn(),
    syncSocialPlaylistSubscription: jest.fn(),
    updateSocialPlaylistSubscription: jest.fn(),
    updateSocialImport: jest.fn(),
  };
});

const { fetchRemoteImage, getSocialImportThumbnail } = require('@librechat/api');
const socialRoutes = require('./social');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/social-imports', socialRoutes);
  return instance;
}

describe('social image proxy', () => {
  beforeEach(() => {
    mockAuthenticated = false;
    jest.clearAllMocks();
  });

  test('serves a safely fetched thumbnail to an image request without bearer authentication', async () => {
    fetchRemoteImage.mockResolvedValue({
      buffer: Buffer.from('image'),
      contentType: 'image/png',
    });

    const response = await request(app())
      .get('/api/social-imports/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png')
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(fetchRemoteImage).toHaveBeenCalledWith('https://example.com/image.png');
  });

  test('serves persisted import media only to its authenticated owner', async () => {
    getSocialImportThumbnail.mockResolvedValue({
      buffer: Buffer.from('persisted-image'),
      contentType: 'image/webp',
    });

    await request(app()).get('/api/social-imports/import-1/thumbnail').expect(401);
    mockAuthenticated = true;
    const response = await request(app()).get('/api/social-imports/import-1/thumbnail').expect(200);

    expect(response.headers['content-type']).toContain('image/webp');
    expect(response.headers['cache-control']).toBe('private, max-age=3600');
    expect(getSocialImportThumbnail).toHaveBeenCalledWith('user-1', 'import-1');
  });
});
