import { ThemeSelector } from '@librechat/client';
import { Link } from 'react-router-dom';
import type { TStartupConfig } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
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
            <a
              className="font-semibold text-surface-submit hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
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
      data-testid="auth-shell"
      className="rekky-ui relative flex min-h-dvh flex-col overflow-x-clip bg-presentation text-text-primary"
    >
      <Banner />
      <DisplayError />
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
        <div
          data-testid="auth-card"
          className="w-full max-w-md rounded-dialog border border-border-light bg-surface-primary px-6 py-7 shadow-dialog sm:px-8 sm:py-8"
        >
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-2 min-w-0 break-words text-center text-3xl font-medium leading-tight tracking-[-0.025em] text-text-primary [overflow-wrap:anywhere]"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
