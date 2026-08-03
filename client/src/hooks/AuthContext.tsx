import {
  useRef,
  useMemo,
  useState,
  useEffect,
  useContext,
  useCallback,
  createContext,
} from 'react';
import { debounce } from 'lodash';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import {
  apiBaseUrl,
  SystemRoles,
  setTokenHeader,
  isSystemRoleName,
  buildLoginRedirectUrl,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useGetRole,
  useGetUserQuery,
  useLoginUserMutation,
  useLogoutUserMutation,
  useRefreshTokenMutation,
  startupConfigKey,
} from '~/data-provider';
import { TAuthConfig, TUserContext, TAuthContext, TResError } from '~/common';
import {
  EXPLICIT_LOGOUT_KEY,
  SESSION_KEY,
  clearExplicitLogout,
  hasExplicitlyLoggedOut,
  markExplicitLogout,
  isSafeRedirect,
  buildLoginRetryRedirect,
  buildTwoFactorRedirect,
  resolvePostLoginRedirect,
} from '~/utils';
import useTimeout from './useTimeout';
import useClearStates from './Config/useClearStates';
import store from '~/store';

function getCurrentClientPath() {
  const baseUrl = apiBaseUrl();
  const rawPath = window.location.pathname;
  return baseUrl && (rawPath === baseUrl || rawPath.startsWith(baseUrl + '/'))
    ? rawPath.slice(baseUrl.length) || '/'
    : rawPath;
}

function allowsGuestAuthPath(path: string) {
  return (
    path === '/' ||
    path === '/cook' ||
    path === '/chat' ||
    path.startsWith('/r/') ||
    path.startsWith('/cooks/')
  );
}

const AuthContext = (import.meta.hot?.data?.__AuthContext ??
  createContext<TAuthContext | undefined>(undefined)) as React.Context<TAuthContext | undefined>;
if (import.meta.hot) {
  import.meta.hot.data.__AuthContext = AuthContext;
}

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const isExternalRedirectRef = useRef(false);
  const logoutInFlightRef = useRef(false);
  const [user, setUser] = useRecoilState(store.user);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthResolved, setIsAuthResolved] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  const resetDefaultPreset = useResetRecoilState(store.defaultPreset);
  const queryClient = useQueryClient();
  const clearStates = useClearStates();

  const userRoleName = user?.role ?? '';
  const isCustomRole = isAuthenticated && !!user?.role && !isSystemRoleName(user.role);

  const { data: userRole = null } = useGetRole(SystemRoles.USER, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: adminRole = null } = useGetRole(SystemRoles.ADMIN, {
    enabled: !!(isAuthenticated && user?.role === SystemRoles.ADMIN),
  });
  const { data: customRole = null } = useGetRole(isCustomRole ? userRoleName : '_', {
    enabled: isCustomRole,
  });

  const navigate = useNavigate();

  const setUserContext = useMemo(
    () =>
      debounce((userContext: TUserContext) => {
        const { token, isAuthenticated, user, redirect } = userContext;
        setUser(user);
        setToken(token);
        setTokenHeader(token);
        setIsAuthenticated(isAuthenticated);
        setIsAuthResolved(true);
        if (isAuthenticated) {
          setQueriesEnabled(true);
        }

        const searchParams = new URLSearchParams(window.location.search);
        const finalRedirect = resolvePostLoginRedirect(searchParams, redirect);

        if (finalRedirect == null) {
          return;
        }

        navigate(finalRedirect, { replace: true });
      }, 50),
    [navigate, setUser, setQueriesEnabled],
  );
  const doSetError = useTimeout({ callback: (error) => setError(error as string | undefined) });

  const loginUser = useLoginUserMutation({
    onSuccess: (data: t.TLoginResponse) => {
      const { user, token, twoFAPending, tempToken } = data;
      if (twoFAPending) {
        navigate(buildTwoFactorRedirect(tempToken), { replace: true });
        return;
      }
      clearExplicitLogout();
      setIsLoggingOut(false);
      setError(undefined);
      setUserContext({ token, isAuthenticated: true, user, redirect: '/cook' });
    },
    onError: (error: TResError | unknown) => {
      const resError = error as TResError;
      doSetError(resError.message);
      navigate(buildLoginRetryRedirect(new URLSearchParams(window.location.search)), {
        replace: true,
      });
    },
  });
  const logoutUser = useLogoutUserMutation({
    onSuccess: (data) => {
      if (data.redirect) {
        /** The absolute URL comes from trusted server-side IdP metadata. */
        isExternalRedirectRef.current = true;
        setTokenHeader(undefined);
        window.location.replace(data.redirect);
        return;
      }
      logoutInFlightRef.current = false;
      setIsLoggingOut(false);
    },
    onError: () => {
      logoutInFlightRef.current = false;
      setIsLoggingOut(false);
    },
  });
  const refreshToken = useRefreshTokenMutation();

  const clearLocalSession = useCallback(
    (broadcast = true) => {
      /** Startup configuration is public and is needed immediately by the landing auth modal. */
      const startupConfig = queryClient.getQueryData<t.TStartupConfig>(startupConfigKey(false));

      if (broadcast) {
        markExplicitLogout();
      }
      setUserContext.cancel();
      sessionStorage.removeItem(SESSION_KEY);
      setQueriesEnabled(false);
      resetDefaultPreset();
      void queryClient.cancelQueries();
      queryClient.clear();
      void clearStates();
      setTokenHeader(undefined);
      setUser(undefined);
      if (startupConfig) {
        queryClient.setQueryData(startupConfigKey(false), startupConfig);
      }
      /** Authenticated queries are purged; public landing-page queries can run again now. */
      setQueriesEnabled(true);
      setToken(undefined);
      setError(undefined);
      setIsAuthenticated(false);
      setIsAuthResolved(true);
      setIsLoggingOut(broadcast);
      navigate('/', { replace: true });
    },
    [
      clearStates,
      navigate,
      queryClient,
      resetDefaultPreset,
      setQueriesEnabled,
      setUser,
      setUserContext,
    ],
  );

  const logout = useCallback(() => {
    if (logoutInFlightRef.current) {
      return;
    }
    logoutInFlightRef.current = true;
    clearLocalSession();
    logoutUser.mutate(undefined);
  }, [clearLocalSession, logoutUser]);

  useEffect(() => {
    const handleExplicitLogout = (event: StorageEvent) => {
      if (event.key !== EXPLICIT_LOGOUT_KEY || event.newValue == null) {
        return;
      }
      logoutInFlightRef.current = false;
      clearLocalSession(false);
    };

    window.addEventListener('storage', handleExplicitLogout);
    return () => window.removeEventListener('storage', handleExplicitLogout);
  }, [clearLocalSession]);

  const userQuery = useGetUserQuery({ enabled: !!(token ?? '') });

  const login = useCallback(
    (data: t.TLoginUser) => {
      loginUser.mutate(data);
    },
    [loginUser],
  );

  const silentRefresh = useCallback(() => {
    if (authConfig?.test === true) {
      console.log('Test mode. Skipping silent refresh.');
      setIsAuthResolved(true);
      return;
    }
    if (hasExplicitlyLoggedOut()) {
      setTokenHeader(undefined);
      setUser(undefined);
      setToken(undefined);
      setIsAuthenticated(false);
      setIsAuthResolved(true);
      return;
    }
    if (isExternalRedirectRef.current) {
      return;
    }
    refreshToken.mutate(undefined, {
      onSuccess: (data: t.TRefreshTokenResponse | undefined) => {
        if (isExternalRedirectRef.current) {
          return;
        }
        if (hasExplicitlyLoggedOut()) {
          setTokenHeader(undefined);
          setUser(undefined);
          setToken(undefined);
          setIsAuthenticated(false);
          setIsAuthResolved(true);
          return;
        }
        const { user, token = '' } = data ?? {};
        if (token) {
          const storedRedirect = sessionStorage.getItem(SESSION_KEY);
          sessionStorage.removeItem(SESSION_KEY);
          const strippedPath = getCurrentClientPath();
          const currentUrl = `${strippedPath}${window.location.search}${window.location.hash}`;
          const fallbackRedirect = isSafeRedirect(currentUrl) ? currentUrl : '/cook';
          const redirect =
            storedRedirect && isSafeRedirect(storedRedirect) ? storedRedirect : fallbackRedirect;
          setUserContext({ user, token, isAuthenticated: true, redirect });
          return;
        }
        console.log('Token is not present. User is not authenticated.');
        setIsAuthResolved(true);
        if (authConfig?.test === true) {
          return;
        }
        if (allowsGuestAuthPath(getCurrentClientPath())) {
          return;
        }
        navigate(buildLoginRedirectUrl());
      },
      onError: (error) => {
        if (isExternalRedirectRef.current) {
          return;
        }
        console.log('refreshToken mutation error:', error);
        setIsAuthResolved(true);
        if (authConfig?.test === true) {
          return;
        }
        if (allowsGuestAuthPath(getCurrentClientPath())) {
          return;
        }
        navigate(buildLoginRedirectUrl());
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are stable at mount; adding refreshToken causes infinite re-fire
  }, []);

  useEffect(() => {
    if (isExternalRedirectRef.current) {
      return;
    }
    if (userQuery.data) {
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      doSetError((userQuery.error as Error).message);
      if (!token && allowsGuestAuthPath(getCurrentClientPath())) {
        return;
      }
      navigate(buildLoginRedirectUrl(), { replace: true });
    }
    if (error != null && error && isAuthenticated) {
      doSetError(undefined);
    }
    if (!isAuthResolved && (token == null || !token || !isAuthenticated)) {
      silentRefresh();
    }
  }, [
    token,
    isAuthenticated,
    isAuthResolved,
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    error,
    setUser,
    navigate,
    doSetError,
    silentRefresh,
    setUserContext,
  ]);

  useEffect(() => {
    const handleTokenUpdate = (event: CustomEvent<string | { token: string; user: t.TUser }>) => {
      if (hasExplicitlyLoggedOut()) {
        return;
      }
      console.log('tokenUpdated event received event');
      const detail = event.detail;
      setUserContext({
        token: typeof detail === 'string' ? detail : detail.token,
        isAuthenticated: true,
        user: typeof detail === 'string' ? user : detail.user,
      });
    };

    window.addEventListener('tokenUpdated', handleTokenUpdate as EventListener);

    return () => {
      window.removeEventListener('tokenUpdated', handleTokenUpdate as EventListener);
    };
  }, [setUserContext, user]);

  const memoedValue = useMemo(
    () => ({
      user,
      token,
      error,
      login,
      logout,
      setError,
      roles: {
        [SystemRoles.USER]: userRole,
        [SystemRoles.ADMIN]: adminRole,
        ...(isCustomRole && customRole ? { [userRoleName]: customRole } : {}),
      },
      isAuthenticated,
      isAuthResolved,
      isLoggingOut,
    }),

    [
      user,
      error,
      isAuthenticated,
      isAuthResolved,
      isLoggingOut,
      token,
      userRole,
      adminRole,
      isCustomRole,
      userRoleName,
      customRole,
      login,
      logout,
    ],
  );

  return <AuthContext.Provider value={memoedValue}>{children}</AuthContext.Provider>;
};

const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext should be used inside AuthProvider');
  }

  return context;
};

export { AuthContextProvider, useAuthContext, AuthContext };
