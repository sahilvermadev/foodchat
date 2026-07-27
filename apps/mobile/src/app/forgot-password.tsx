import { useState } from 'react';
import { router } from 'expo-router';

import { authService } from '@/features/auth/service';
import { AuthButton, AuthError, AuthField, AuthLink, AuthShell } from '@/features/auth/ui';
import { useTranslation } from '@/lib/i18n';
import { userErrorMessage } from '@/lib/errors';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('auth.invalidEmail'));
    setError(null);
    setLoading(true);
    try {
      await authService.requestPasswordReset(email.trim());
      setSent(true);
    } catch (reason) {
      setError(userErrorMessage(reason, t('auth.resetFailed')));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell subtitle={t('auth.resetSentSubtitle')} title={t('auth.resetSentTitle')}>
        <AuthButton label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle={t('auth.resetSubtitle')} title={t('auth.resetTitle')}>
      <AuthError message={error} />
      <AuthField
        autoComplete="email"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        value={email}
      />
      <AuthButton label={t('auth.sendReset')} loading={loading} onPress={() => void submit()} />
      <AuthLink label={t('auth.backToSignIn')} onPress={() => router.back()} />
    </AuthShell>
  );
}
