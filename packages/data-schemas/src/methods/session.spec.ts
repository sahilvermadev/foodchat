import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import sessionSchema from '~/schema/session';
import type { ISession } from '~/types';
import { hashToken } from '~/crypto';
import { createSessionMethods } from './session';

jest.mock('~/config/winston', () => ({ error: jest.fn(), warn: jest.fn(), debug: jest.fn() }));

let mongo: MongoMemoryServer;
let Session: mongoose.Model<ISession>;

beforeAll(async () => {
  process.env.JWT_REFRESH_SECRET = 'mobile-session-test-secret';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Session = mongoose.models.Session || mongoose.model<ISession>('Session', sessionSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => mongoose.connection.dropDatabase());

test('a mobile refresh token can be rotated only once', async () => {
  const methods = createSessionMethods(mongoose);
  const userId = new mongoose.Types.ObjectId().toString();
  const { session, refreshToken } = await methods.createSession(userId, {
    clientType: 'mobile',
    installationId: 'install-1',
    deviceName: 'Pixel 10',
    platform: 'android',
    appVersion: '0.1.0',
  });

  const nextToken = await methods.rotateSessionRefreshToken({
    sessionId: session._id!.toString(),
    userId,
    presentedToken: refreshToken,
  });

  expect(nextToken).toEqual(expect.any(String));
  expect((await Session.findById(session._id))?.refreshTokenHash).toBe(await hashToken(nextToken));
  await expect(
    methods.rotateSessionRefreshToken({
      sessionId: session._id!.toString(),
      userId,
      presentedToken: refreshToken,
    }),
  ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
  expect(await Session.findById(session._id)).toBeNull();
});
