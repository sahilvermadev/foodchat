import jwt from 'jsonwebtoken';

import type { MobileDevice, MobileTokenPair } from 'librechat-data-provider';

type SessionRecord = {
  _id: { toString(): string };
  expiration: Date;
};

type MobileAuthDependencies = {
  createSession(
    userId: string,
    options: MobileDevice & { clientType: 'mobile' },
  ): Promise<{
    session: SessionRecord;
    refreshToken: string;
  }>;
  rotateSessionRefreshToken(params: {
    sessionId: string;
    userId: string;
    presentedToken: string;
  }): Promise<string>;
  deleteMobileSession(params: {
    userId: string;
    installationId?: string;
    sessionId?: string;
  }): Promise<boolean>;
  issueAccessToken(userId: string): Promise<string>;
  refreshSecret: string;
  accessTokenLifetimeMs: number;
};

type RefreshClaims = jwt.JwtPayload & { id: string; sessionId: string };

const readClaims = (refreshToken: string, secret: string): RefreshClaims => {
  const payload = jwt.verify(refreshToken, secret);
  if (
    typeof payload === 'string' ||
    typeof payload.id !== 'string' ||
    typeof payload.sessionId !== 'string'
  ) {
    throw new jwt.JsonWebTokenError('Invalid mobile refresh token');
  }
  return payload as RefreshClaims;
};

export const createMobileAuthService = (dependencies: MobileAuthDependencies) => {
  const issue = async (userId: string, device: MobileDevice): Promise<MobileTokenPair> => {
    await dependencies.deleteMobileSession({ userId, installationId: device.installationId });
    const { session, refreshToken } = await dependencies.createSession(userId, {
      ...device,
      clientType: 'mobile',
    });
    const accessToken = await dependencies.issueAccessToken(userId);
    return {
      accessToken,
      refreshToken,
      sessionId: session._id.toString(),
      accessExpiresAt: Date.now() + dependencies.accessTokenLifetimeMs,
      refreshExpiresAt: session.expiration.getTime(),
    };
  };

  const refresh = async (refreshToken: string): Promise<MobileTokenPair> => {
    const claims = readClaims(refreshToken, dependencies.refreshSecret);
    const nextRefreshToken = await dependencies.rotateSessionRefreshToken({
      sessionId: claims.sessionId,
      userId: claims.id,
      presentedToken: refreshToken,
    });
    const accessToken = await dependencies.issueAccessToken(claims.id);
    const nextClaims = readClaims(nextRefreshToken, dependencies.refreshSecret);
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      sessionId: claims.sessionId,
      accessExpiresAt: Date.now() + dependencies.accessTokenLifetimeMs,
      refreshExpiresAt: (nextClaims.exp ?? 0) * 1000,
    };
  };

  const logout = async (userId: string, refreshToken: string): Promise<boolean> => {
    const claims = readClaims(refreshToken, dependencies.refreshSecret);
    if (claims.id !== userId) {
      return false;
    }
    return dependencies.deleteMobileSession({ userId, sessionId: claims.sessionId });
  };

  return { issue, refresh, logout };
};

export type MobileAuthService = ReturnType<typeof createMobileAuthService>;
