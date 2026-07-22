import { useState } from 'react';
import { router } from 'expo-router';

import { AuthButton, AuthError, AuthField, AuthLink, AuthShell } from '@/features/auth/ui';
import { useAuth } from '@/features/auth/provider';
import { useTranslation } from '@/lib/i18n';

export default function TwoFactorScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      await auth.verifyTwoFactor(code.trim(), recovery);
    } catch {
      // The provider owns error presentation.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle={t('auth.twoFactorSubtitle')} title={t('auth.twoFactorTitle')}>
      <AuthError message={auth.error} />
      <AuthField
        autoComplete="one-time-code"
        keyboardType={recovery ? 'default' : 'number-pad'}
        label={recovery ? t('auth.recoveryCode') : t('auth.code')}
        onChangeText={setCode}
        onSubmitEditing={() => void submit()}
        value={code}
      />
      <AuthButton label={t('auth.verify')} loading={loading} onPress={() => void submit()} />
      <AuthLink
        label={recovery ? t('auth.useAuthenticator') : t('auth.useRecovery')}
        onPress={() => {
          setRecovery((value) => !value);
          setCode('');
          auth.clearError();
        }}
      />
      <AuthLink
        label={t('auth.backToSignIn')}
        onPress={() => {
          auth.cancelTwoFactor();
          router.replace('/sign-in');
        }}
      />
    </AuthShell>
  );
}
