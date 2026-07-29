import type { AuthUser } from '@/lib/auth/token-vault';

export type MobileDevice = {
  installationId: string;
  deviceName: string;
  platform: 'ios' | 'android';
  appVersion: string;
};
export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  sessionId: string;
  user?: AuthUser;
};
export type LoginResponse = TokenResponse | { twoFAPending: true; tempToken: string };
export type AuthStatus = 'restoring' | 'signedOut' | 'twoFactor' | 'signedIn' | 'signingOut';
