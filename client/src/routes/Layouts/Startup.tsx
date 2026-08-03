import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import type { TStartupConfig } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { AuthMode } from '~/utils';
import { useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import AuthLayout from '~/components/Auth/AuthLayout';
import { AuthFlowProvider } from '~/components/Auth/flow';
import { REDIRECT_PARAM, SESSION_KEY } from '~/utils';
import store from '~/store';

const headerMap: Record<string, TranslationKeys> = {
  '/login': 'com_auth_welcome_back',
  '/register': 'com_auth_create_account',
  '/forgot-password': 'com_auth_reset_password',
  '/reset-password': 'com_auth_reset_password',
  '/login/2fa': 'com_auth_verify_your_identity',
};

const pathModes: Record<string, AuthMode | 'reset'> = {
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgot',
  '/reset-password': 'reset',
  '/login/2fa': '2fa',
};

const modePaths: Record<AuthMode, string> = {
  login: '/login',
  register: '/register',
  forgot: '/forgot-password',
  '2fa': '/login/2fa',
};

export default function StartupLayout({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const [error, setError] = useState<TranslationKeys | null>(null);
  const [headerText, setHeaderText] = useState<TranslationKeys | null>(null);
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  const {
    data,
    isFetching,
    error: startupConfigError,
  } = useGetStartupConfig({
    enabled: isAuthenticated ? startupConfig === null : true,
  });
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = pathModes[location.pathname] ?? 'login';

  useEffect(() => {
    setQueriesEnabled(true);
  }, [setQueriesEnabled]);

  useEffect(() => {
    if (isAuthenticated) {
      const hasPendingRedirect =
        new URLSearchParams(window.location.search).has(REDIRECT_PARAM) ||
        sessionStorage.getItem(SESSION_KEY) != null;
      if (!hasPendingRedirect) {
        navigate('/cook', { replace: true });
      }
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data]);

  useEffect(() => {
    document.title = startupConfig?.appTitle || 'Rekky';
  }, [startupConfig?.appTitle]);

  useEffect(() => {
    setError(null);
    setHeaderText(null);
  }, [location.pathname]);

  const contextValue = {
    mode: mode === 'reset' ? 'forgot' : mode,
    setMode: (nextMode: AuthMode) =>
      navigate(
        { pathname: modePaths[nextMode], search: location.search, hash: location.hash },
        { replace: true },
      ),
    error,
    setError,
    headerText,
    setHeaderText,
    startupConfigError,
    startupConfig,
    isFetching,
    presentation: 'standalone' as const,
  };

  return (
    <AuthFlowProvider value={contextValue}>
      <AuthLayout
        header={headerText ? localize(headerText) : localize(headerMap[location.pathname])}
        isFetching={isFetching}
        startupConfig={startupConfig}
        startupConfigError={startupConfigError}
        mode={mode}
        error={error}
      >
        <Outlet />
      </AuthLayout>
    </AuthFlowProvider>
  );
}
