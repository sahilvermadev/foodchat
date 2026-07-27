import { useRef, useState } from 'react';
import { Linking } from 'react-native';
import type { TextInput } from 'react-native';
import { router } from 'expo-router';

import {
  AuthButton,
  AuthError,
  AuthField,
  AuthLegal,
  AuthLink,
  AuthShell,
} from '@/features/auth/ui';
import { useAuth } from '@/features/auth/provider';
import { useTranslation } from '@/lib/i18n';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
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
      <AuthField
        autoComplete="name"
        label={t('auth.name')}
        onChangeText={setName}
        onSubmitEditing={() => usernameRef.current?.focus()}
        returnKeyType="next"
        value={name}
      />
      <AuthField
        autoCapitalize="none"
        label={t('auth.username')}
        onChangeText={setUsername}
        onSubmitEditing={() => emailRef.current?.focus()}
        ref={usernameRef}
        returnKeyType="next"
        value={username}
      />
      <AuthField
        autoComplete="email"
        keyboardType="email-address"
        label={t('auth.email')}
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
        ref={emailRef}
        returnKeyType="next"
        value={email}
      />
      <AuthField
        autoComplete="new-password"
        label={t('auth.password')}
        hint={t('auth.passwordHint')}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
        ref={passwordRef}
        returnKeyType="done"
        secureTextEntry
        value={password}
      />
      <AuthButton label={t('auth.createAccount')} loading={loading} onPress={() => void submit()} />
      <AuthLegal
        onPrivacy={() => void Linking.openURL('https://rekky.ai/privacy')}
        onTerms={() => void Linking.openURL('https://rekky.ai/terms')}
      />
      <AuthLink
        label={t('auth.signIn')}
        onPress={() => router.back()}
        prefix={t('auth.haveAccount')}
      />
    </AuthShell>
  );
}
