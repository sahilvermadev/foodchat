import { useEffect, useState } from 'react';
import { OGDialog, OGDialogClose, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { X } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { AuthMode } from '~/utils';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import {
  clearAuthParams,
  getAuthMode,
  persistRedirectToSession,
  SESSION_KEY,
  setAuthMode,
} from '~/utils';
import { AuthCard } from './AuthLayout';
import { AuthFlowProvider } from './flow';
import Login from './Login';
import Registration from './Registration';
import RequestPasswordReset from './RequestPasswordReset';
import TwoFactorScreen from './TwoFactorScreen';
import './PublicAuthHost.css';

const headerKeys: Record<AuthMode, TranslationKeys> = {
  login: 'com_auth_welcome_back',
  register: 'com_auth_create_account',
  forgot: 'com_auth_reset_password',
  '2fa': 'com_auth_verify_your_identity',
};

function AuthForm({ mode }: { mode: AuthMode }) {
  if (mode === 'register') {
    return <Registration />;
  }
  if (mode === 'forgot') {
    return <RequestPasswordReset />;
  }
  if (mode === '2fa') {
    return <TwoFactorScreen />;
  }
  return <Login />;
}

interface AuthLocationState {
  contextualAuth?: boolean;
}

export default function PublicAuthHost() {
  const localize = useLocalize();
  const location = useLocation();
  const navigate = useNavigate();
  const mode = getAuthMode(new URLSearchParams(location.search));
  const [error, setError] = useState<TranslationKeys | null>(null);
  const [headerText, setHeaderText] = useState<TranslationKeys | null>(null);
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const startup = useGetStartupConfig({ enabled: mode != null });

  useEffect(() => {
    if (startup.data) {
      setStartupConfig(startup.data);
    }
  }, [startup.data]);

  useEffect(() => {
    if (!mode) {
      return;
    }
    persistRedirectToSession('/cook');
  }, [mode]);

  useEffect(() => {
    setError(null);
    setHeaderText(null);
  }, [mode]);

  const close = () => {
    sessionStorage.removeItem(SESSION_KEY);
    const state = location.state as AuthLocationState | null;
    if (state?.contextualAuth) {
      navigate(-1);
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: clearAuthParams(location.search),
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const changeMode = (nextMode: AuthMode) => {
    navigate(
      {
        pathname: location.pathname,
        search: setAuthMode(location.search, nextMode),
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  };

  const activeMode = mode ?? 'login';
  const contextValue = {
    mode: activeMode,
    setMode: changeMode,
    startupConfig,
    startupConfigError: startup.error,
    isFetching: startup.isFetching,
    error,
    setError,
    headerText,
    setHeaderText,
    presentation: 'modal' as const,
  };

  return (
    <>
      <Outlet />
      <AuthFlowProvider value={contextValue}>
        <OGDialog open={mode != null} onOpenChange={(open) => !open && close()}>
          <OGDialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            overlayClassName="rekky-public-auth-overlay motion-reduce:animate-none"
            className={`rekky-ui rekky-public-auth fixed inset-0 left-0 top-0 h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 shadow-none duration-200 motion-reduce:animate-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%_-_2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-dialog data-[state=closed]:sm:slide-out-to-left-1/2 data-[state=closed]:sm:slide-out-to-top-[48%] data-[state=open]:sm:slide-in-from-left-1/2 data-[state=open]:sm:slide-in-from-top-[48%] ${activeMode === 'register' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
          >
            <OGDialogTitle asChild>
              <span className="sr-only">{localize(headerText ?? headerKeys[activeMode])}</span>
            </OGDialogTitle>
            <div className="w-full overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] sm:max-h-[calc(100dvh-2rem)] sm:py-0">
              <AuthCard
                header={localize(headerText ?? headerKeys[activeMode])}
                isFetching={startup.isFetching}
                startupConfig={startupConfig}
                startupConfigError={startup.error}
                mode={activeMode}
                error={error}
                className={
                  activeMode === 'register'
                    ? 'rekky-public-auth-card mx-auto max-w-2xl border-0 shadow-none sm:border'
                    : 'rekky-public-auth-card mx-auto max-w-md border-0 shadow-none sm:border'
                }
              >
                <AuthForm mode={activeMode} />
              </AuthCard>
            </div>
            <OGDialogClose
              aria-label={localize('com_ui_close')}
              className="rekky-public-auth-close absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-sticky inline-flex size-11 items-center justify-center rounded-control border transition-[background-color,border-color,transform]"
            >
              <X className="size-5" aria-hidden="true" />
            </OGDialogClose>
          </OGDialogContent>
        </OGDialog>
      </AuthFlowProvider>
    </>
  );
}
