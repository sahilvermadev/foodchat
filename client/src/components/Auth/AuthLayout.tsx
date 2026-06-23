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
            <a className="font-semibold text-green-600 hover:underline" href="/forgot-password">
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
      className="rekky-ui relative flex min-h-dvh flex-col overflow-x-hidden bg-presentation text-text-primary"
    >
      <Banner />
      <DisplayError />
      <Link
        to="/cook"
        aria-label={localize('com_ui_app_name')}
        className="absolute left-5 top-5 z-20 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary md:left-8 md:top-8"
      >
        <span className="rekky-sidebar-wordmark text-[#c1121f]">{localize('com_ui_app_name')}</span>
      </Link>
      <div className="fixed bottom-4 left-4 z-20">
        <ThemeSelector />
      </div>

      <main className="relative flex flex-grow items-center justify-center px-5 py-20">
        <div
          data-testid="auth-card"
          className="w-full max-w-md rounded-3xl border border-border-light bg-surface-primary px-6 py-7 shadow-lg shadow-black/5 dark:shadow-black/20 sm:px-8 sm:py-8"
        >
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-2 text-center text-3xl font-medium leading-tight tracking-[-0.025em] text-text-primary"
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
