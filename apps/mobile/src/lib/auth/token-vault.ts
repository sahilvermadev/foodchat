import * as SecureStore from 'expo-secure-store';

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  username?: string;
  publicProfile?: boolean;
};

export type StoredSession = {
  refreshToken: string;
  sessionId: string;
  refreshExpiresAt: number;
  user: AuthUser;
};

const SESSION_KEY = 'rekky.mobile-session.v1';
let accessToken: string | null = null;

export const tokenVault = {
  getAccessToken: () => accessToken,
  getRefreshToken: async () => (await tokenVault.getSession())?.refreshToken ?? null,
  async getSession(): Promise<StoredSession | null> {
    const value = await SecureStore.getItemAsync(SESSION_KEY);
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredSession;
    } catch {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
  },
  async setSession(session: StoredSession, nextAccessToken: string) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    accessToken = nextAccessToken;
  },
  setAccessToken(token: string) {
    accessToken = token;
  },
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(SESSION_KEY);
  },
};
