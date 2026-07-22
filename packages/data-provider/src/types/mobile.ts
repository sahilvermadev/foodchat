import type { TUser } from '../types';

export type MobilePlatform = 'ios' | 'android';

export type MobileDevice = {
  installationId: string;
  deviceName: string;
  platform: MobilePlatform;
  appVersion: string;
};

export type MobileLoginRequest = MobileDevice & { email: string; password: string };
export type MobileTwoFactorRequest = MobileDevice & {
  tempToken: string;
  token?: string;
  backupCode?: string;
};
export type MobileTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  sessionId: string;
};
export type MobileAuthResponse =
  | { twoFAPending: true; tempToken: string }
  | ({ twoFAPending?: false; user: TUser } & MobileTokenPair);
export type MobileRefreshRequest = { refreshToken: string };
export type MobileLogoutRequest = { refreshToken: string };
export type MobileSession = {
  id: string;
  installationId: string;
  deviceName: string;
  platform: MobilePlatform;
  appVersion: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};
