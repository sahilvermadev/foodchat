import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  generateGuestUserId,
  consumeGuestDailyPrompt,
  refundGuestDailyPrompt,
  reserveGuestTrial,
  commitGuestTrial,
  refundGuestTrial,
  hasConsumedGuestTrial,
  reserveGuestConcurrency,
  releaseGuestConcurrency,
} from './guest';

jest.setTimeout(60000);

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('cooking guest helper', () => {
  test('generateGuestUserId yields a standard 24-character hex pseudo-ObjectId', () => {
    const ip = '127.0.0.1';
    const id = generateGuestUserId(ip);

    expect(id).toHaveLength(24);
    expect(/^[a-f\d]{24}$/i.test(id)).toBe(true);

    // Assert determinism
    expect(generateGuestUserId(ip)).toBe(id);
  });

  test('consumeGuestDailyPrompt increments the counter and respects daily limits', async () => {
    const ip = '192.168.1.100';
    const limit = 3;

    // First prompt consumption
    const res1 = await consumeGuestDailyPrompt(ip, limit);
    expect(res1).toBe(true);

    // Second prompt consumption
    const res2 = await consumeGuestDailyPrompt(ip, limit);
    expect(res2).toBe(true);

    // Third prompt consumption (limit reached)
    const res3 = await consumeGuestDailyPrompt(ip, limit);
    expect(res3).toBe(true);

    // Fourth prompt consumption (exceeds limit)
    const res4 = await consumeGuestDailyPrompt(ip, limit);
    expect(res4).toBe(false);

    // The atomic reservation never increments beyond the limit.
    const day = new Date().toISOString().slice(0, 10);
    const hash = generateGuestUserId(ip);
    const key = `${day}:${hash}`;
    const doc = await mongoose.models.GuestLimit.findById(key).lean<{ count: number }>();
    expect(doc?.count).toBe(3);
  });

  test('refundGuestDailyPrompt releases a failed reservation without going negative', async () => {
    const ip = '192.168.1.101';

    await consumeGuestDailyPrompt(ip, 3);
    await refundGuestDailyPrompt(ip);
    await refundGuestDailyPrompt(ip);

    const day = new Date().toISOString().slice(0, 10);
    const key = `${day}:${generateGuestUserId(ip)}`;
    const doc = await mongoose.models.GuestLimit.findById(key).lean<{ count: number }>();
    expect(doc?.count).toBe(0);
  });

  test('reserveGuestTrial atomically permits only one active or completed trial', async () => {
    const guestId = 'guest-session-1';

    const reservations = await Promise.all([
      reserveGuestTrial(guestId),
      reserveGuestTrial(guestId),
      reserveGuestTrial(guestId),
    ]);

    expect(reservations.filter(Boolean)).toHaveLength(1);
    expect(await hasConsumedGuestTrial(guestId)).toBe(true);

    await commitGuestTrial(guestId);
    const trial = await mongoose.models.GuestLimit.findOne({}).lean<{ expiresAt: Date }>();
    expect(trial?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    await refundGuestTrial(guestId);
    expect(await hasConsumedGuestTrial(guestId)).toBe(false);
    expect(await reserveGuestTrial(guestId)).toBe(true);
  });

  test('guest concurrency reservations cap simultaneous generations and release cleanly', async () => {
    const ip = '192.168.1.102';

    expect(await reserveGuestConcurrency(ip, 2)).toBe(true);
    expect(await reserveGuestConcurrency(ip, 2)).toBe(true);
    expect(await reserveGuestConcurrency(ip, 2)).toBe(false);

    await releaseGuestConcurrency(ip);
    expect(await reserveGuestConcurrency(ip, 2)).toBe(true);
  });
});
