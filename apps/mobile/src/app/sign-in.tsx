import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
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
  const passwordRef = useRef<TextInput>(null);
  const [validation, setValidation] = useState<{ field: 'email' | 'password'; message: string }>();

  const submit = async () => {
    if (!email) return setValidation({ field: 'email', message: t('auth.emailRequired') });
    if (!/^\S+@\S+\.\S+$/.test(email))
      return setValidation({ field: 'email', message: t('auth.invalidEmail') });
    if (!password) return setValidation({ field: 'password', message: t('auth.passwordRequired') });
    setValidation(undefined);
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
      <AuthError message={auth.error} />
      <AuthField
        autoComplete="email"
        error={validation?.field === 'email' ? validation.message : undefined}
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
        returnKeyType="next"
        value={email}
      />
      <AuthField
        autoComplete="current-password"
        error={validation?.field === 'password' ? validation.message : undefined}
        label={t('auth.password')}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
        ref={passwordRef}
        returnKeyType="done"
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
