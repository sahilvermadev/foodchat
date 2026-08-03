import { useForm } from 'react-hook-form';
import React, { useContext, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { resolveAuthSuccessRedirect } from '~/utils';
import usePublicLogin from '~/hooks/usePublicLogin';
import { ErrorMessage } from './ErrorMessage';
import {
  authInlineLinkClass,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from './styles';
import PasswordField from './PasswordField';
import { AuthModeLink, useAuthFlow } from './flow';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { login } = usePublicLogin();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useAuthFlow();

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: (data, variables) => {
      setIsSubmitting(false);
      if (startupConfig?.emailEnabled) {
        setCountdown(3);
        const timer = setInterval(() => {
          setCountdown((prevCountdown) => {
            if (prevCountdown <= 1) {
              clearInterval(timer);
              navigate(resolveAuthSuccessRedirect(new URLSearchParams(window.location.search)), {
                replace: true,
              });
              return 0;
            } else {
              return prevCountdown - 1;
            }
          });
        }, 1000);
      } else {
        login({ email: variables.email, password: variables.password });
      }
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
    },
  });

  const renderInput = (id: string, label: TranslationKeys, type: string, validation: object) => (
    <div className="mb-4">
      {type === 'password' ? (
        <PasswordField
          id={id}
          autoComplete="new-password"
          aria-label={localize(label)}
          label={localize(label)}
          {...register(id as 'password' | 'confirm_password', validation)}
          aria-invalid={!!errors[id]}
          data-testid={id}
        />
      ) : (
        <div className="relative">
          <input
            id={id}
            type={type}
            autoComplete={id}
            aria-label={localize(label)}
            {...register(id as 'name' | 'email' | 'username', validation)}
            aria-invalid={!!errors[id]}
            className={authInputClass}
            placeholder=" "
            data-testid={id}
          />
          <label htmlFor={id} className={authLabelClass}>
            {localize(label)}
          </label>
        </div>
      )}
      {errors[id] && (
        <span role="alert" className="mt-1 font-mono text-sm text-red-500">
          {String(errors[id]?.message) ?? ''}
        </span>
      )}
    </div>
  );

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {!startupConfigError && !isFetching && (
        <>
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) =>
              registerUser.mutate({ ...data, token: token ?? undefined }),
            )}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 3,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 2,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_username_max_length'),
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className={authPrimaryButtonClass}
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-[var(--rekky-umber)] dark:text-[var(--rekky-cream-muted)]">
            {localize('com_auth_already_have_account')}{' '}
            <AuthModeLink
              mode="login"
              ariaLabel={localize('com_auth_login')}
              className={authInlineLinkClass}
            >
              {localize('com_auth_login')}
            </AuthModeLink>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;
