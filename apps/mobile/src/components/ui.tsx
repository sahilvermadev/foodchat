import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { AuthenticatedImage } from '@/features/recipes/authenticated-image';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';

export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Display({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <Text style={styles.display}>{children}</Text>;
}

export function Body({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  const styles = useStyles();
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function ScreenHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Display>{title}</Display>
      </View>
      {action}
    </View>
  );
}

export function Avatar({
  label = 'Profile',
  initials = 'R',
}: {
  label?: string;
  initials?: string;
}) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={label} style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function AmbientHero({
  title,
  subtitle,
  placeholder,
  voiceLabel,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  voiceLabel: string;
  onSubmit?: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const styles = useStyles();
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit?.(text);
    setValue('');
  };
  return (
    <LinearGradient colors={['#211710', '#372318', '#18251D']} style={styles.hero}>
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
      <View style={styles.askBar}>
        <TextInput
          accessibilityLabel={placeholder}
          onChangeText={setValue}
          onSubmitEditing={submit}
          placeholder={placeholder}
          placeholderTextColor="#A99D91"
          returnKeyType="send"
          style={styles.askInput}
          value={value}
        />
        <Pressable accessibilityLabel={voiceLabel} style={styles.voiceButton}>
          <Text style={styles.voiceGlyph}>≈</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

export function ContinueCard({
  title,
  meta,
  action,
  progress,
  onPress,
}: {
  title: string;
  meta: string;
  action: string;
  progress?: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.continueCard}>
      <View style={styles.progressRing}>
        <Text style={styles.progressText}>{progress ?? '—'}</Text>
      </View>
      <View style={styles.continueCopy}>
        <Text style={styles.continueTitle}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Pressable onPress={onPress} style={styles.resumeButton}>
        <Text style={styles.resumeText}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type RecipePreview = {
  id: string;
  title: string;
  meta: string;
  imageUrl?: string;
};

export function RecipeTile({
  recipe,
  compact = false,
  onPress,
}: {
  recipe: RecipePreview;
  compact?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityLabel={recipe.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recipeTile,
        compact && styles.recipeTileCompact,
        pressed && styles.recipeTilePressed,
      ]}
    >
      <View style={styles.recipeImage}>
        {recipe.imageUrl ? (
          <AuthenticatedImage
            cachePolicy="memory-disk"
            contentFit="contain"
            path={recipe.imageUrl}
            style={StyleSheet.absoluteFill}
            transition={200}
          />
        ) : (
          <LinearGradient colors={['#E6D6C4', '#CCDCCF']} style={styles.recipeFallback}>
            <Text style={styles.recipeFallbackText}>R</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.recipeCopy}>
        <Text numberOfLines={2} style={styles.recipeTitle}>
          {recipe.title}
        </Text>
        <Text numberOfLines={1} style={styles.recipeMeta}>
          {recipe.meta}
        </Text>
      </View>
    </Pressable>
  );
}

export function SearchField({
  placeholder,
  value,
  onChangeText,
  clearLabel,
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (value: string) => void;
  clearLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.searchField}>
      <SymbolView
        name={{ android: 'search', ios: 'magnifyingglass' }}
        size={20}
        tintColor={colors.inkMuted}
      />
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        style={styles.searchInput}
        value={value}
      />
      {value && onChangeText ? (
        <Pressable
          accessibilityLabel={clearLabel}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ android: 'close', ios: 'xmark.circle.fill' }}
            size={18}
            tintColor={colors.inkMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FloatingAction({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.floatingAction, pressed && styles.pressed]}
    >
      <SymbolView
        name={{ android: 'add', ios: 'plus' }}
        size={20}
        tintColor={colors.white}
        weight="semibold"
      />
      <Text style={styles.floatingActionText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = createThemeStyles((palette) => ({
  eyebrow: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  display: {
    color: palette.ink,
    fontFamily: fonts.serif,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  body: { color: palette.ink, fontFamily: fonts.sans, fontSize: 16, lineHeight: 23 },
  muted: { color: palette.inkMuted },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.lg,
    justifyContent: 'space-between',
  },
  headerCopy: { flex: 1, gap: space.xs },
  avatar: {
    alignItems: 'center',
    backgroundColor: palette.plum,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: { color: palette.white, fontFamily: fonts.rounded, fontSize: 12, fontWeight: '800' },
  chip: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  chipSelected: { backgroundColor: palette.black, borderColor: palette.black },
  chipText: { color: palette.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: palette.white },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  hero: {
    borderRadius: radius.xl,
    gap: space.md,
    minHeight: 310,
    overflow: 'hidden',
    padding: space.xl,
    paddingTop: 34,
    ...shadow,
  },
  orbOne: {
    backgroundColor: 'rgba(200, 90, 50, 0.30)',
    borderRadius: 120,
    height: 210,
    position: 'absolute',
    right: -50,
    top: -80,
    width: 210,
  },
  orbTwo: {
    backgroundColor: 'rgba(242, 201, 76, 0.16)',
    borderRadius: 90,
    bottom: -70,
    height: 180,
    left: -35,
    position: 'absolute',
    width: 180,
  },
  heroTitle: {
    color: '#FFF8ED',
    fontFamily: fonts.serif,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.4,
    lineHeight: 41,
    maxWidth: 290,
  },
  heroSubtitle: {
    color: '#D7CABD',
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 310,
  },
  askBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: space.xl,
    flexDirection: 'row',
    left: space.xl,
    padding: space.sm,
    position: 'absolute',
    right: space.xl,
  },
  askInput: {
    color: palette.white,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: space.md,
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  voiceGlyph: { color: palette.white, fontSize: 27, fontWeight: '800', marginTop: -4 },
  continueCard: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  progressRing: {
    alignItems: 'center',
    borderColor: palette.saffron,
    borderRadius: radius.pill,
    borderWidth: 4,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  progressText: { color: palette.ink, fontFamily: fonts.rounded, fontSize: 12, fontWeight: '800' },
  continueCopy: { flex: 1, gap: space.xs },
  continueTitle: { color: palette.ink, fontFamily: fonts.serif, fontSize: 18, fontWeight: '700' },
  meta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  resumeButton: {
    backgroundColor: palette.herb,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resumeText: { color: palette.white, fontFamily: fonts.sans, fontSize: 12, fontWeight: '800' },
  sectionTitleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: palette.ink,
    fontFamily: fonts.serif,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  sectionAction: {
    color: palette.emberDark,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  recipeTile: { gap: space.sm, width: 196 },
  recipeTileCompact: { flex: 1, width: 'auto' },
  recipeTilePressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  recipeImage: {
    aspectRatio: 4 / 3,
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  recipeFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  recipeFallbackText: {
    color: palette.herb,
    fontFamily: fonts.recipeHeading,
    fontSize: 38,
  },
  recipeCopy: { gap: 2 },
  recipeTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 16,
    lineHeight: 20,
    minHeight: 40,
  },
  recipeMeta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 11, lineHeight: 16 },
  searchField: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  searchGlyph: { color: palette.inkMuted, fontSize: 24 },
  searchInput: { color: palette.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, minHeight: 54 },
  searchClear: { alignItems: 'center', justifyContent: 'center' },
  floatingAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: 18,
    paddingVertical: 13,
    ...shadow,
  },
  floatingActionPlus: { color: palette.white, fontSize: 19, fontWeight: '500' },
  floatingActionText: {
    color: palette.white,
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '800',
  },
}));
