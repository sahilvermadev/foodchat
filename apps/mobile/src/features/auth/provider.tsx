import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { ApiError, configureAuthRefresh } from '@/lib/api/client';
import { isOnlineNow, useConnectivity } from '@/features/connectivity/provider';
import { clearOfflineUser } from '@/features/offline/database';
import { clearOfflineMedia } from '@/features/offline/media';
import { clearPersistedQueryCache, queryClient } from '@/lib/query-client';
import { userErrorMessage } from '@/lib/errors';
import { tokenVault } from '@/lib/auth/token-vault';
import type { AuthUser } from '@/lib/auth/token-vault';
import { authService } from './service';
import type { AuthStatus, TokenResponse } from './types';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  credentialVersion: number;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  verifyTwoFactor(code: string, recovery?: boolean): Promise<void>;
  register(input: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): Promise<void>;
  logout(): Promise<void>;
  clearError(): void;
  cancelTwoFactor(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
let sessionRefreshPromise: Promise<boolean> | null = null;
let sessionRefreshFailedAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 30_000;

export function AuthProvider({ children }: PropsWithChildren) {
  const { isOnline } = useConnectivity();
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [credentialVersion, setCredentialVersion] = useState(0);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    const stored = await tokenVault.getSession();
    await tokenVault.clear();
    if (stored) {
      await clearOfflineUser(stored.user.id);
      await clearOfflineMedia().catch(() => undefined);
    }
    queryClient.clear();
    await clearPersistedQueryCache();
    setUser(null);
    setCredentialVersion((version) => version + 1);
    setStatus('signedOut');
  }, []);

  const acceptTokens = useCallback(async (tokens: TokenResponse, fallbackUser?: AuthUser) => {
    const nextUser = tokens.user ?? fallbackUser;
    if (!nextUser) throw new Error('Authenticated user was not returned');
    const previous = await tokenVault.getSession();
    if (previous && previous.user.id !== nextUser.id) {
      await clearOfflineUser(previous.user.id);
      await clearOfflineMedia().catch(() => undefined);
      queryClient.clear();
      await clearPersistedQueryCache();
    }
    await tokenVault.setSession(
      {
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt,
        sessionId: tokens.sessionId,
        user: nextUser,
      },
      tokens.accessToken,
    );
    setUser(nextUser);
    setCredentialVersion((version) => version + 1);
    setStatus('signedIn');
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    if (Date.now() - sessionRefreshFailedAt < REFRESH_FAILURE_COOLDOWN_MS) {
      return Promise.resolve(false);
    }

    sessionRefreshPromise ??= (async () => {
      const stored = await tokenVault.getSession();
      if (!stored) {
        await clearSession();
        return false;
      }
      if (stored.refreshExpiresAt <= Date.now()) {
        if (isOnlineNow() !== true) {
          setUser(stored.user);
          setStatus('signedIn');
          return false;
        }
        await clearSession();
        return false;
      }
      try {
        await acceptTokens(await authService.refresh(stored.refreshToken), stored.user);
        sessionRefreshFailedAt = 0;
        return true;
      } catch (reason) {
        sessionRefreshFailedAt = Date.now();
        if (!isOnlineNow() || !(reason instanceof ApiError) || reason.status >= 500) {
          setUser(stored.user);
          setStatus('signedIn');
          return false;
        }
        await clearSession();
        return false;
      }
    })().finally(() => {
      sessionRefreshPromise = null;
    });

    return sessionRefreshPromise;
  }, [acceptTokens, clearSession]);

  useEffect(() => {
    configureAuthRefresh(refresh);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOnline || status !== 'signedIn' || tokenVault.getAccessToken()) return;
    sessionRefreshFailedAt = 0;
    void refresh();
  }, [isOnline, refresh, status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      credentialVersion,
      error,
      clearError: () => setError(null),
      cancelTwoFactor: () => {
        setTempToken(null);
        setError(null);
        setStatus('signedOut');
      },
      login: async (email, password) => {
        setError(null);
        try {
          const response = await authService.login(email.trim(), password);
          if ('tempToken' in response) {
            setTempToken(response.tempToken);
            setStatus('twoFactor');
            return;
          }
          await acceptTokens(response);
        } catch (reason) {
          setError(userErrorMessage(reason, 'Sign in could not be completed. Please try again.'));
          throw reason;
        }
      },
      verifyTwoFactor: async (code, recovery = false) => {
        if (!tempToken) throw new Error('Your sign-in attempt expired');
        setError(null);
        try {
          await acceptTokens(await authService.verifyTwoFactor(tempToken, code, recovery));
          setTempToken(null);
        } catch (reason) {
          setError(
            userErrorMessage(reason, 'Verification could not be completed. Please try again.'),
          );
          throw reason;
        }
      },
      register: async (input) => {
        setError(null);
        try {
          await authService.register(input);
        } catch (reason) {
          setError(
            userErrorMessage(reason, 'Your account could not be created. Please try again.'),
          );
          throw reason;
        }
      },
      logout: async () => {
        const stored = await tokenVault.getSession();
        const accessToken = tokenVault.getAccessToken();
        if (stored && accessToken) {
          try {
            await authService.logout(accessToken, stored.refreshToken);
          } catch {
            // Local credential removal is authoritative even when offline.
          }
        }
        await clearSession();
      },
    }),
    [acceptTokens, clearSession, credentialVersion, error, status, tempToken, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
