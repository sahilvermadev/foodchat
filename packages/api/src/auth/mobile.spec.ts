import jwt from 'jsonwebtoken';

import { createMobileAuthService } from './mobile';

const secret = 'mobile-auth-test-secret';
const device = {
  installationId: 'installation-1',
  deviceName: 'Test phone',
  platform: 'android' as const,
  appVersion: '0.1.0',
};

const refreshToken = (rotationId: string) =>
  jwt.sign({ id: 'user-1', sessionId: 'session-1', rotationId }, secret, { expiresIn: '7d' });

test('issues an installation-scoped token pair', async () => {
  const remove = jest.fn().mockResolvedValue(false);
  const service = createMobileAuthService({
    refreshSecret: secret,
    accessTokenLifetimeMs: 900_000,
    deleteMobileSession: remove,
    issueAccessToken: jest.fn().mockResolvedValue('access-1'),
    createSession: jest.fn().mockResolvedValue({
      session: { _id: { toString: () => 'session-1' }, expiration: new Date(Date.now() + 60_000) },
      refreshToken: refreshToken('first'),
    }),
    rotateSessionRefreshToken: jest.fn(),
  });

  const result = await service.issue('user-1', device);

  expect(remove).toHaveBeenCalledWith({ userId: 'user-1', installationId: 'installation-1' });
  expect(result).toMatchObject({ accessToken: 'access-1', sessionId: 'session-1' });
});

test('refresh returns a rotated pair for the token owner', async () => {
  const rotate = jest.fn().mockResolvedValue(refreshToken('second'));
  const service = createMobileAuthService({
    refreshSecret: secret,
    accessTokenLifetimeMs: 900_000,
    deleteMobileSession: jest.fn(),
    issueAccessToken: jest.fn().mockResolvedValue('access-2'),
    createSession: jest.fn(),
    rotateSessionRefreshToken: rotate,
  });

  const result = await service.refresh(refreshToken('first'));

  expect(rotate).toHaveBeenCalledWith({
    sessionId: 'session-1',
    userId: 'user-1',
    presentedToken: expect.any(String),
  });
  expect(result).toMatchObject({ accessToken: 'access-2', sessionId: 'session-1' });
});
