import crypto from 'crypto';
import mongoose, { mongo } from 'mongoose';
import type { IGuestLimit } from '@librechat/data-schemas';

const dayMs = 24 * 60 * 60 * 1000;
const guestTrialTtlMs = 30 * dayMs;
const guestTrialReservationTtlMs = 10 * 60 * 1000;
const guestConcurrencyTtlMs = 10 * 60 * 1000;

function guestLimitModel() {
  return mongoose.model<IGuestLimit>('GuestLimit');
}

function hashedKey(prefix: string, value: string): string {
  const hash = crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
  return `${prefix}:${hash}`;
}

function guestDailyLimitKey(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return hashedKey(day, ip);
}

function expiresIn(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds);
}

async function reserveCounter(key: string, limit: number, expiresAt: Date): Promise<boolean> {
  const GuestLimit = guestLimitModel();

  try {
    const doc = await GuestLimit.findOneAndUpdate(
      { _id: key, count: { $lt: limit } },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc != null;
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 11000) {
      return false;
    }
    throw error;
  }
}

async function releaseCounter(key: string): Promise<void> {
  const GuestLimit = guestLimitModel();
  await GuestLimit.updateOne({ _id: key, count: { $gt: 0 } }, { $inc: { count: -1 } });
}

/**
 * Returns a 24-character hexadecimal pseudonymous identifier representing the guest.
 * Generates a SHA-256 hash of the guest's IP address and truncates it to 24 characters.
 * This satisfies MongoDB's ObjectId validation requirements downstream.
 */
export function generateGuestUserId(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

/**
 * Atomic database-backed check for daily guest prompt consumption.
 * Increments the daily prompt counter only while it remains below the configured limit.
 */
export async function consumeGuestDailyPrompt(ip: string, limit: number): Promise<boolean> {
  return reserveCounter(guestDailyLimitKey(ip), limit, expiresIn(2 * dayMs));
}

export async function refundGuestDailyPrompt(ip: string): Promise<void> {
  await releaseCounter(guestDailyLimitKey(ip));
}

export async function reserveGuestTrial(guestId: string): Promise<boolean> {
  return reserveCounter(hashedKey('trial', guestId), 1, expiresIn(guestTrialReservationTtlMs));
}

export async function commitGuestTrial(guestId: string): Promise<void> {
  await guestLimitModel().updateOne(
    { _id: hashedKey('trial', guestId), count: { $gt: 0 } },
    { $set: { expiresAt: expiresIn(guestTrialTtlMs) } },
  );
}

export async function refundGuestTrial(guestId: string): Promise<void> {
  await releaseCounter(hashedKey('trial', guestId));
}

export async function hasConsumedGuestTrial(guestId: string): Promise<boolean> {
  const doc = await guestLimitModel().findById(hashedKey('trial', guestId)).lean();
  return (doc?.count ?? 0) > 0;
}

export async function reserveGuestConcurrency(ip: string, limit: number): Promise<boolean> {
  return reserveCounter(hashedKey('concurrent', ip), limit, expiresIn(guestConcurrencyTtlMs));
}

export async function releaseGuestConcurrency(ip: string): Promise<void> {
  await releaseCounter(hashedKey('concurrent', ip));
}
