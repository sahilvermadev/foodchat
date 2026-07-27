import { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { fonts, radius, space } from '@/constants/theme';
import { authService } from '@/features/auth/service';
import { useAuth } from '@/features/auth/provider';
import { useCurrentUser, useUpdatePublicProfile } from '@/features/today/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

function SettingsRow({
  android,
  description,
  ios,
  label,
  onPress,
  trailing,
}: {
  android: AndroidSymbol;
  description: string;
  ios: SFSymbol;
  label: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <View style={styles.rowIcon}>
        <SymbolView name={{ android, ios }} size={20} tintColor={colors.ember} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {trailing ??
        (onPress ? (
          <SymbolView
            name={{ android: 'chevron_right', ios: 'chevron.right' }}
            size={17}
            tintColor={colors.inkMuted}
          />
        ) : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const styles = useStyles();
  const auth = useAuth();
  const currentUser = useCurrentUser();
  const publicProfile = useUpdatePublicProfile();
  const [notice, setNotice] = useState('');
  const dark = mode === 'dark';
  const email = currentUser.data?.email ?? auth.user?.email ?? '';

  const requestReset = async () => {
    if (!email) return;
    try {
      await authService.requestPasswordReset(email);
      setNotice(t('settings.resetSent'));
    } catch {
      setNotice(t('settings.resetFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel={t('settings.back')}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <SymbolView
            name={{ android: 'arrow_back', ios: 'chevron.left' }}
            size={21}
            tintColor={colors.ink}
          />
        </Pressable>
        <Text style={styles.topTitle}>{t('settings.title')}</Text>
        <View style={styles.backButtonSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.accountCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(auth.user?.name ?? email ?? 'R').charAt(0)}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{auth.user?.name ?? auth.user?.username}</Text>
            <Text style={styles.accountEmail}>{email}</Text>
          </View>
        </View>
        {notice ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        <Text style={styles.groupTitle}>{t('settings.personalization')}</Text>
        <View style={styles.group}>
          <SettingsRow
            android={dark ? 'dark_mode' : 'light_mode'}
            description={t('settings.darkModeSubtitle')}
            ios={dark ? 'moon.fill' : 'sun.max.fill'}
            label={t('settings.darkMode')}
            trailing={
              <Switch
                accessibilityLabel={t('settings.darkMode')}
                onValueChange={(enabled) => {
                  void Haptics.selectionAsync();
                  setMode(enabled ? 'dark' : 'light');
                }}
                thumbColor={colors.white}
                trackColor={{ false: colors.line, true: colors.ember }}
                value={dark}
              />
            }
          />
          <SettingsRow
            android="tune"
            description={t('settings.preferencesSubtitle')}
            ios="slider.horizontal.3"
            label={t('settings.preferences')}
            onPress={() => router.push('/preferences')}
          />
          <SettingsRow
            android="public"
            description={t('settings.publicProfileSubtitle')}
            ios="person.2"
            label={t('settings.publicProfile')}
            trailing={
              <Switch
                accessibilityLabel={t('settings.publicProfile')}
                disabled={currentUser.isLoading || publicProfile.isPending}
                onValueChange={(value) => publicProfile.mutate(value)}
                thumbColor={colors.white}
                trackColor={{ false: colors.line, true: colors.ember }}
                value={Boolean(currentUser.data?.publicProfile)}
              />
            }
          />
        </View>

        <Text style={styles.groupTitle}>{t('settings.account')}</Text>
        <View style={styles.group}>
          <SettingsRow
            android="lock"
            description={t('settings.passwordSubtitle')}
            ios="lock.fill"
            label={t('settings.password')}
            onPress={() => void requestReset()}
          />
          <SettingsRow
            android="privacy_tip"
            description={t('settings.privacySubtitle')}
            ios="hand.raised.fill"
            label={t('settings.privacy')}
            onPress={() => void Linking.openURL('https://rekky.ai/privacy')}
          />
          <SettingsRow
            android="description"
            description={t('settings.termsSubtitle')}
            ios="doc.text"
            label={t('settings.terms')}
            onPress={() => void Linking.openURL('https://rekky.ai/terms')}
          />
        </View>

        <Text style={styles.groupTitle}>{t('settings.support')}</Text>
        <View style={styles.group}>
          <SettingsRow
            android="help"
            description={t('settings.helpSubtitle')}
            ios="questionmark.circle"
            label={t('settings.help')}
            onPress={() => void Linking.openURL('mailto:support@rekky.ai')}
          />
          <SettingsRow
            android="info"
            description={t('settings.versionValue', {
              version: Constants.expoConfig?.version ?? 'development',
            })}
            ios="info.circle"
            label={t('settings.version')}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void auth.logout()}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: space.lg,
  },
  topTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 20 },
  backButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  backButtonSpacer: { width: 42 },
  content: { gap: space.md, padding: space.lg, paddingBottom: space.hero },
  accountCard: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: palette.plum,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: { color: palette.white, fontFamily: fonts.sansBold, fontSize: 20 },
  accountCopy: { flex: 1, gap: 2 },
  accountName: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 16 },
  accountEmail: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  notice: {
    backgroundColor: palette.herbSoft,
    borderRadius: radius.md,
    color: palette.herb,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    padding: space.md,
  },
  groupTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: space.md,
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 76,
    padding: space.md,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  rowCopy: { flex: 1, gap: 3 },
  rowLabel: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  rowDescription: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  signOut: {
    alignItems: 'center',
    borderColor: palette.danger,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: space.lg,
    padding: space.md,
  },
  signOutText: { color: palette.danger, fontFamily: fonts.sansSemibold, fontSize: 14 },
  pressed: { opacity: 0.72 },
}));
