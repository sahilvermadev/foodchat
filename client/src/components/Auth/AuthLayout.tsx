import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
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
    <div className="rekky-ui relative flex min-h-screen flex-col overflow-hidden bg-[var(--rekky-alabaster)] text-text-primary dark:bg-[var(--rekky-plum-950)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(200,90,50,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(117,196,107,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(200,90,50,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(242,201,76,0.08),transparent_28%)]" />
      <Banner />
      <DisplayError />
      <div className="absolute bottom-0 left-0 z-10 md:m-4">
        <ThemeSelector />
      </div>

      <main className="relative flex flex-grow items-center justify-center px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--rekky-linen)] bg-[var(--rekky-cream-raised)] px-6 py-6 shadow-xl shadow-black/5 dark:border-white/10 dark:bg-[var(--rekky-plum-900)] dark:shadow-black/30 sm:px-8">
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-2 text-center font-serif text-4xl font-semibold leading-tight text-[var(--rekky-charcoal)] dark:text-[var(--rekky-cream-text)]"
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
