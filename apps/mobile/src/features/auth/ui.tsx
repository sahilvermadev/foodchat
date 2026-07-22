import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

export function AuthShell({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <LinearGradient
        colors={[colors.canvas, colors.softClay, colors.herbSoft]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.brandRow}>
            <LinearGradient colors={[colors.ember, colors.saffron]} style={styles.mark}>
              <Text style={styles.markText}>R</Text>
            </LinearGradient>
            <Text style={styles.brand}>{t('auth.brand')}</Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.card}>{children}</View>
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        placeholderTextColor={colors.inkMuted}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

export function AuthButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading?: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthLink({
  prefix,
  label,
  onPress,
}: {
  prefix?: string;
  label: string;
  onPress(): void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.linkRow}>
      {prefix ? <Text style={styles.linkPrefix}>{prefix}</Text> : null}
      <Pressable accessibilityRole="link" onPress={onPress}>
        <Text style={styles.link}>{label}</Text>
      </Pressable>
    </View>
  );
}

export function AuthError({ message }: { message: string | null }) {
  const styles = useStyles();
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  scroll: { flexGrow: 1 },
  safeArea: { flex: 1, gap: space.xl, justifyContent: 'center', padding: space.xl },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  mark: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  markText: { color: palette.white, fontFamily: fonts.serif, fontSize: 20, fontWeight: '800' },
  brand: {
    color: palette.ink,
    fontFamily: fonts.brand,
    fontSize: 13,
    letterSpacing: -0.4,
    textTransform: 'lowercase',
  },
  copy: { gap: space.sm, maxWidth: 520 },
  title: {
    color: palette.ink,
    fontFamily: fonts.serif,
    fontSize: 39,
    fontWeight: '700',
    letterSpacing: -1.4,
    lineHeight: 43,
  },
  subtitle: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  card: {
    backgroundColor: palette.canvasRaised,
    borderRadius: radius.xl,
    gap: space.lg,
    padding: space.xl,
    ...shadow,
  },
  field: { gap: space.sm },
  label: { color: palette.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: space.lg,
  },
  button: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: space.lg,
  },
  buttonText: { color: palette.white, fontFamily: fonts.sans, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'center',
  },
  linkPrefix: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 14 },
  link: { color: palette.ember, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
  error: {
    backgroundColor: palette.dangerSoft,
    borderRadius: radius.sm,
    color: palette.danger,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    padding: space.md,
  },
}));
