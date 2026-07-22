import { router } from 'expo-router';

import { AuthButton, AuthShell } from '@/features/auth/ui';
import { useTranslation } from '@/lib/i18n';

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  return (
    <AuthShell subtitle={t('auth.checkEmailSubtitle')} title={t('auth.checkEmailTitle')}>
      <AuthButton label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
    </AuthShell>
  );
}
