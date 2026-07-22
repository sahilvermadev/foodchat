import type { Document, Types } from 'mongoose';

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
  tenantId?: string;
  clientType?: 'web' | 'mobile';
  installationId?: string;
  deviceName?: string;
  platform?: 'ios' | 'android';
  appVersion?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionOptions {
  expiration?: Date;
  /** Duration in milliseconds for session expiry. Default: 7 days */
  expiresIn?: number;
  clientType?: 'web' | 'mobile';
  installationId?: string;
  deviceName?: string;
  platform?: 'ios' | 'android';
  appVersion?: string;
}

export interface RotateSessionRefreshTokenParams {
  sessionId: string;
  userId: string;
  presentedToken: string;
}

export interface UpdateExpirationOptions {
  /** Duration in milliseconds for session expiry. Default: 7 days */
  expiresIn?: number;
}

export interface SessionSearchParams {
  refreshToken?: string;
  userId?: string;
  sessionId?: string | { sessionId: string };
}

export interface SessionQueryOptions {
  lean?: boolean;
}

export interface DeleteSessionParams {
  refreshToken?: string;
  sessionId?: string;
}

export interface DeleteAllSessionsOptions {
  excludeCurrentSession?: boolean;
  currentSessionId?: string;
}

export interface SessionResult {
  session: Partial<ISession>;
  refreshToken: string;
}

export interface MobileSessionSearch {
  userId: string;
  installationId?: string;
  sessionId?: string;
}

export interface SignPayloadParams {
  payload: Record<string, unknown>;
  secret?: string;
  expirationTime: number;
}
