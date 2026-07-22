import { useState } from 'react';
import { router } from 'expo-router';

import { AuthButton, AuthError, AuthField, AuthLink, AuthShell } from '@/features/auth/ui';
import { useAuth } from '@/features/auth/provider';
import { useTranslation } from '@/lib/i18n';

export default function SignInScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) return setValidation(t('auth.required'));
    if (!/^\S+@\S+\.\S+$/.test(email)) return setValidation(t('auth.invalidEmail'));
    setValidation(null);
    setLoading(true);
    try {
      await auth.login(email, password);
    } catch {
      // The provider exposes a localized-safe server error.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle={t('auth.signInSubtitle')} title={t('auth.signInTitle')}>
      <AuthError message={validation ?? auth.error} />
      <AuthField
        autoComplete="email"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        returnKeyType="next"
        value={email}
      />
      <AuthField
        autoComplete="current-password"
        label={t('auth.password')}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
        secureTextEntry
        value={password}
      />
      <AuthButton label={t('auth.signIn')} loading={loading} onPress={() => void submit()} />
      <AuthLink label={t('auth.forgotPassword')} onPress={() => router.push('/forgot-password')} />
      <AuthLink
        label={t('auth.createAccount')}
        onPress={() => router.push('/register')}
        prefix={t('auth.noAccount')}
      />
    </AuthShell>
  );
}
