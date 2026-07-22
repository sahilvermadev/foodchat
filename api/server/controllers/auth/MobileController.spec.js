const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = 'mobile-controller-access-secret';
process.env.JWT_REFRESH_SECRET = 'mobile-controller-refresh-secret';

const user = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  id: '507f1f77bcf86cd799439011',
  email: 'cook@example.com',
  name: 'Cook',
  password: 'never-return-this',
  twoFactorEnabled: false,
};

const signedRefresh = (rotationId) =>
  jwt.sign(
    { id: user.id, sessionId: '507f1f77bcf86cd799439012', rotationId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' },
  );

const mockCreateSession = jest.fn();
const mockRotateSessionRefreshToken = jest.fn();
const mockDeleteMobileSession = jest.fn();
const mockGetUserById = jest.fn();
const mockGenerateToken = jest.fn();
const mockGenerate2FATempToken = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  DEFAULT_SESSION_EXPIRY: 900000,
  logger: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock('~/models', () => ({
  createSession: (...args) => mockCreateSession(...args),
  rotateSessionRefreshToken: (...args) => mockRotateSessionRefreshToken(...args),
  deleteMobileSession: (...args) => mockDeleteMobileSession(...args),
  getUserById: (...args) => mockGetUserById(...args),
  generateToken: (...args) => mockGenerateToken(...args),
  listMobileSessions: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  generate2FATempToken: (...args) => mockGenerate2FATempToken(...args),
  getTOTPSecret: jest.fn(),
  verifyTOTP: jest.fn(),
  verifyBackupCode: jest.fn(),
}));

const controllers = require('./MobileController');

const device = {
  installationId: 'install-1',
  deviceName: 'Pixel',
  platform: 'android',
  appVersion: '0.1.0',
};

describe('mobile authentication HTTP contract', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteMobileSession.mockResolvedValue(false);
    mockGetUserById.mockResolvedValue(user);
    mockGenerateToken.mockResolvedValue('access-token');
    mockGenerate2FATempToken.mockReturnValue('temporary-2fa-token');
    user.twoFactorEnabled = false;
    mockCreateSession.mockResolvedValue({
      session: {
        _id: { toString: () => '507f1f77bcf86cd799439012' },
        expiration: new Date(Date.now() + 604800000),
      },
      refreshToken: signedRefresh('first'),
    });
    app = express();
    app.use(express.json());
    app.post(
      '/login',
      (req, _res, next) => {
        req.user = user;
        next();
      },
      controllers.mobileLoginController,
    );
    app.post('/refresh', controllers.mobileRefreshController);
  });

  it('issues tokens without exposing password fields', async () => {
    const response = await request(app)
      .post('/login')
      .send({ ...device, email: user.email })
      .expect(200);

    expect(response.body).toMatchObject({
      accessToken: 'access-token',
      sessionId: '507f1f77bcf86cd799439012',
      user: { email: user.email },
    });
    expect(response.body.user).not.toHaveProperty('password');
  });

  it('returns a rotated token pair from a body refresh grant', async () => {
    mockRotateSessionRefreshToken.mockResolvedValue(signedRefresh('second'));

    const response = await request(app)
      .post('/refresh')
      .send({ refreshToken: signedRefresh('first') })
      .expect(200);

    expect(response.body).toMatchObject({ accessToken: 'access-token' });
    expect(response.body.refreshToken).not.toBe(signedRefresh('first'));
  });

  it('returns only a temporary challenge when 2FA is enabled', async () => {
    user.twoFactorEnabled = true;

    const response = await request(app)
      .post('/login')
      .send({ ...device, email: user.email })
      .expect(200);

    expect(response.body).toEqual({ twoFAPending: true, tempToken: 'temporary-2fa-token' });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
