import { useState } from 'react';
import { ThemeSelector } from '@librechat/client';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { AuthMode } from '~/utils';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { AuthFlowProvider, AuthModeLink, useOptionalAuthFlow } from './flow';
import { Banner } from '../Banners';
import Footer from './Footer';

function getLayoutMode(mode?: AuthMode | 'reset', pathname?: string): AuthMode | 'reset' {
  if (mode) {
    return mode;
  }
  if (pathname?.includes('register')) {
    return 'register';
  }
  if (pathname?.includes('2fa')) {
    return '2fa';
  }
  if (pathname?.includes('forgot')) {
    return 'forgot';
  }
  return 'login';
}

export function AuthFormSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="mt-6 animate-pulse motion-reduce:animate-none"
      data-testid="auth-form-skeleton"
    >
      <div className="mb-6 h-12 rounded-control bg-surface-secondary" />
      <div className="mb-6 h-12 rounded-control bg-surface-secondary" />
      <div className="bg-surface-submit/15 h-11 rounded-control" />
    </div>
  );
}

export function AuthCard({
  children,
  header,
  startupConfig,
  startupConfigError,
  mode,
  pathname,
  error,
  className,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  mode?: AuthMode | 'reset';
  pathname?: string;
  error: TranslationKeys | null;
  className?: string;
}) {
  const localize = useLocalize();
  const effectiveMode = getLayoutMode(mode, pathname);

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  /**
   * Query observers can briefly report `isFetching: false` when an enabled query has not
   * produced data yet (for example, when the contextual modal is opened after mounting with
   * the query disabled). The auth forms need startup configuration to determine which login
   * methods to render, so absence of both data and an error is itself the loading state.
   */
  const isLoadingStartupConfig = startupConfig == null && !hasStartupConfigError;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <AuthModeLink
              mode="forgot"
              className="font-semibold text-surface-submit hover:underline"
            >
              {localize('com_auth_click_here')}
            </AuthModeLink>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      data-testid="auth-card"
      aria-busy={isLoadingStartupConfig}
      className={`w-full rounded-dialog border border-border-light bg-surface-primary px-6 py-7 shadow-dialog sm:px-8 sm:py-8 ${className ?? 'max-w-md'}`}
    >
      <DisplayError />
      {!hasStartupConfigError && header && (
        <h1
          className="auth-card-heading mb-2 min-w-0 break-words text-center text-3xl font-medium leading-tight tracking-[-0.025em] text-text-primary [overflow-wrap:anywhere]"
          style={{ userSelect: 'none' }}
        >
          {header}
        </h1>
      )}
      {isLoadingStartupConfig ? <AuthFormSkeleton label={localize('com_ui_loading')} /> : children}
      {effectiveMode !== '2fa' &&
        !isLoadingStartupConfig &&
        (effectiveMode === 'login' || effectiveMode === 'register') && (
          <SocialLoginRender startupConfig={startupConfig} />
        )}
    </div>
  );
}

function AuthLayout(props: Omit<React.ComponentProps<typeof AuthCard>, 'className'>) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const flow = useOptionalAuthFlow();
  const [fallbackError, setFallbackError] = useState<TranslationKeys | null>(null);
  const [fallbackHeader, setFallbackHeader] = useState<TranslationKeys | null>(null);
  const fallbackMode = getLayoutMode(props.mode, props.pathname);
  const modePaths: Record<AuthMode, string> = {
    login: '/login',
    register: '/register',
    forgot: '/forgot-password',
    '2fa': '/login/2fa',
  };

  const shell = (
    <div
      data-testid="auth-shell"
      className="rekky-ui relative flex min-h-dvh flex-col overflow-x-clip bg-presentation text-text-primary"
    >
      <Banner />
      <Link
        to="/cook"
        aria-label={localize('com_ui_app_name')}
        className="absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[calc(1.25rem+env(safe-area-inset-top))] z-sticky rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary md:left-[max(2rem,env(safe-area-inset-left))] md:top-[calc(2rem+env(safe-area-inset-top))]"
      >
        <span className="rekky-sidebar-wordmark text-surface-submit">
          {localize('com_ui_app_name')}
        </span>
      </Link>
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-sticky">
        <ThemeSelector />
      </div>
      <main className="relative flex flex-grow items-center justify-center pb-[max(5rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[calc(5rem+env(safe-area-inset-top))]">
        <AuthCard {...props} />
      </main>
      <Footer startupConfig={props.startupConfig} />
    </div>
  );

  if (flow) {
    return shell;
  }

  return (
    <AuthFlowProvider
      value={{
        mode: fallbackMode === 'reset' ? 'forgot' : fallbackMode,
        setMode: (mode) =>
          navigate(
            { pathname: modePaths[mode], search: location.search, hash: location.hash },
            { replace: true },
          ),
        startupConfig: props.startupConfig ?? null,
        startupConfigError: props.startupConfigError,
        isFetching: props.isFetching,
        error: fallbackError,
        setError: setFallbackError,
        headerText: fallbackHeader,
        setHeaderText: setFallbackHeader,
        presentation: 'standalone',
      }}
    >
      {shell}
    </AuthFlowProvider>
  );
}

export default AuthLayout;
