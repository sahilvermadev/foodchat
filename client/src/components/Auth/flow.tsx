import React, { createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { AuthMode } from '~/utils';
import { cn, getPublicReturnTarget, persistRedirectToSession, setAuthMode } from '~/utils';

export type AuthFlowContextValue = {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  startupConfig: TStartupConfig | null;
  startupConfigError: unknown;
  isFetching: boolean;
  error: TranslationKeys | null;
  setError: React.Dispatch<React.SetStateAction<TranslationKeys | null>>;
  headerText: TranslationKeys | null;
  setHeaderText: React.Dispatch<React.SetStateAction<TranslationKeys | null>>;
  presentation: 'modal' | 'standalone';
};

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

export function AuthFlowProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AuthFlowContextValue;
}) {
  return <AuthFlowContext.Provider value={value}>{children}</AuthFlowContext.Provider>;
}

export function useAuthFlow(): AuthFlowContextValue {
  const context = useContext(AuthFlowContext);
  if (!context) {
    throw new Error('useAuthFlow must be used within an AuthFlowProvider');
  }
  return context;
}

export function useOptionalAuthFlow(): AuthFlowContextValue | null {
  return useContext(AuthFlowContext);
}

const standalonePaths: Record<AuthMode, string> = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  '2fa': '/login/2fa',
};

export function AuthModeLink({
  mode,
  children,
  className,
  ariaLabel,
}: {
  mode: AuthMode;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const flow = useAuthFlow();

  return (
    <Link
      to={flow.presentation === 'modal' ? '#' : standalonePaths[mode]}
      aria-label={ariaLabel}
      className={className}
      onClick={(event) => {
        if (flow.presentation === 'modal') {
          event.preventDefault();
        }
        flow.setMode(mode);
      }}
    >
      {children}
    </Link>
  );
}

export function ContextualAuthLink({
  mode,
  children,
  className,
  onClick,
}: {
  mode: 'login' | 'register';
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const location = useLocation();
  const returnTarget = getPublicReturnTarget(location.pathname, location.search, location.hash);
  const isPublicSurface =
    location.pathname === '/' ||
    location.pathname.startsWith('/r/') ||
    location.pathname.startsWith('/cooks/');
  const standalonePath = mode === 'login' ? '/login' : '/register';
  const destination = isPublicSurface
    ? {
        pathname: location.pathname,
        search: setAuthMode(location.search, mode),
        hash: location.hash,
      }
    : `${standalonePath}?redirect_to=${encodeURIComponent(returnTarget)}`;

  return (
    <Link
      to={destination}
      state={isPublicSurface ? { contextualAuth: true } : undefined}
      className={cn(className)}
      onClick={(event) => {
        persistRedirectToSession(returnTarget);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
