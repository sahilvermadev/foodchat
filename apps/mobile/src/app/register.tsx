import { useState } from 'react';
import { router } from 'expo-router';

import { AuthButton, AuthError, AuthField, AuthLink, AuthShell } from '@/features/auth/ui';
import { useAuth } from '@/features/auth/provider';
import { useTranslation } from '@/lib/i18n';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const submit = async () => {
    if (![name, username, email, password].every(Boolean)) return setValidation(t('auth.required'));
    if (!/^\S+@\S+\.\S+$/.test(email)) return setValidation(t('auth.invalidEmail'));
    if (password.length < 8) return setValidation(t('auth.passwordLength'));
    setValidation(null);
    setLoading(true);
    try {
      await auth.register({ name, username, email, password });
      router.replace('/check-email');
    } catch {
      // The provider owns error presentation.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle={t('auth.registerSubtitle')} title={t('auth.registerTitle')}>
      <AuthError message={validation ?? auth.error} />
      <AuthField autoComplete="name" label={t('auth.name')} onChangeText={setName} value={name} />
      <AuthField
        autoCapitalize="none"
        label={t('auth.username')}
        onChangeText={setUsername}
        value={username}
      />
      <AuthField
        autoComplete="email"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        value={email}
      />
      <AuthField
        autoComplete="new-password"
        label={t('auth.password')}
        onChangeText={setPassword}
        secureTextEntry
        value={password}
      />
      <AuthButton label={t('auth.createAccount')} loading={loading} onPress={() => void submit()} />
      <AuthLink
        label={t('auth.signIn')}
        onPress={() => router.back()}
        prefix={t('auth.haveAccount')}
      />
    </AuthShell>
  );
}
