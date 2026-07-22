import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

import type { TranslationKey } from '@/lib/i18n';
import type { PreferenceHeading, PreferenceSection } from '@/features/preferences/artifact';
import { fonts, radius, shadow, space } from '@/constants/theme';
import {
  cleanPreferenceLine,
  preferenceSections,
  replacePreferenceSection,
} from '@/features/preferences/artifact';
import { usePreferences, useUpdatePreferences } from '@/features/preferences/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

type SectionMeta = {
  android: AndroidSymbol;
  ios: SFSymbol;
  label: TranslationKey;
  prompt: TranslationKey;
  suggestions: string[];
};

const sectionMeta: Record<PreferenceHeading, SectionMeta> = {
  Safety: {
    android: 'health_and_safety',
    ios: 'cross.case.fill',
    label: 'preferences.safety',
    prompt: 'preferences.safetyPrompt',
    suggestions: ['Peanut allergy', 'Tree nut allergy', 'Shellfish allergy', 'Gluten intolerance'],
  },
  Diet: {
    android: 'eco',
    ios: 'leaf.fill',
    label: 'preferences.diet',
    prompt: 'preferences.dietPrompt',
    suggestions: ['Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free'],
  },
  'Religious & Cultural Rules': {
    android: 'public',
    ios: 'globe',
    label: 'preferences.cultural',
    prompt: 'preferences.culturalPrompt',
    suggestions: ['Halal ingredients', 'Kosher food', 'No alcohol in cooking', 'No beef'],
  },
  'Cooking Level': {
    android: 'school',
    ios: 'graduationcap.fill',
    label: 'preferences.level',
    prompt: 'preferences.levelPrompt',
    suggestions: ['Beginner', 'Home cook', 'Advanced', 'Professional'],
  },
  Household: {
    android: 'group',
    ios: 'person.2.fill',
    label: 'preferences.household',
    prompt: 'preferences.householdPrompt',
    suggestions: ['Cooking for one', 'Cooking for two', 'Family with children', 'Shared household'],
  },
  Kitchen: {
    android: 'kitchen',
    ios: 'oven.fill',
    label: 'preferences.kitchen',
    prompt: 'preferences.kitchenPrompt',
    suggestions: ['Oven', 'Air fryer', 'Instant Pot', 'Blender', 'Induction cooktop'],
  },
  'Specialty Ingredients': {
    android: 'inventory_2',
    ios: 'shippingbox.fill',
    label: 'preferences.ingredients',
    prompt: 'preferences.ingredientsPrompt',
    suggestions: ['Miso', 'Gochujang', 'Tahini', 'Fish sauce', 'Paneer'],
  },
  Taste: {
    android: 'local_fire_department',
    ios: 'flame.fill',
    label: 'preferences.taste',
    prompt: 'preferences.tastePrompt',
    suggestions: ['Loves spicy food', 'Garlic lover', 'Sweet tooth', 'Low sodium', 'No mushrooms'],
  },
  Goals: {
    android: 'flag',
    ios: 'flag.fill',
    label: 'preferences.goals',
    prompt: 'preferences.goalsPrompt',
    suggestions: [
      'Quick dinners',
      'Healthy eating',
      'Meal prep',
      'Budget friendly',
      'High protein',
    ],
  },
  Location: {
    android: 'location_on',
    ios: 'location.fill',
    label: 'preferences.location',
    prompt: 'preferences.locationPrompt',
    suggestions: ['Metric measurements', 'Imperial measurements'],
  },
  'Personal Context': {
    android: 'person',
    ios: 'person.crop.circle.fill',
    label: 'preferences.context',
    prompt: 'preferences.contextPrompt',
    suggestions: [
      'Busy weeknights',
      'Student budget',
      'Low-energy cooking',
      'Prefers fresh produce',
    ],
  },
};

const groups: Array<{ key: TranslationKey; headings: PreferenceHeading[] }> = [
  { key: 'preferences.essentials', headings: ['Safety', 'Diet', 'Religious & Cultural Rules'] },
  { key: 'preferences.cookingStyle', headings: ['Taste', 'Goals', 'Cooking Level'] },
  {
    key: 'preferences.yourKitchen',
    headings: ['Household', 'Kitchen', 'Specialty Ingredients', 'Location', 'Personal Context'],
  },
];

function PreferenceEditor({
  markdown,
  onClose,
  onSave,
  section,
}: {
  markdown: string;
  onClose: () => void;
  onSave: (markdown: string) => Promise<void>;
  section: PreferenceSection | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();
  const mutation = useUpdatePreferences();
  const { reset } = mutation;
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(section?.lines.join('\n') ?? '');
    reset();
  }, [reset, section]);

  if (!section) return null;
  const meta = sectionMeta[section.heading];
  const values = value.split('\n').map(cleanPreferenceLine).filter(Boolean);
  const toggleSuggestion = (suggestion: string) => {
    void Haptics.selectionAsync();
    const selected = values.some((item) => item.toLowerCase() === suggestion.toLowerCase());
    setValue(
      (selected
        ? values.filter((item) => item.toLowerCase() !== suggestion.toLowerCase())
        : [...values, suggestion]
      ).join('\n'),
    );
  };
  const save = async () => {
    const nextMarkdown = replacePreferenceSection(markdown, section.heading, value.split('\n'));
    try {
      const preferences = await mutation.mutateAsync({ markdown: nextMarkdown });
      await onSave(preferences.markdown);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editorBackdrop}
      >
        <Pressable
          accessibilityLabel={t('preferences.cancel')}
          onPress={onClose}
          style={styles.editorDismiss}
        />
        <SafeAreaView
          edges={[]}
          style={[
            styles.editorSheet,
            {
              maxHeight: height - insets.top - space.xl,
              paddingBottom: insets.bottom + space.lg,
            },
          ]}
        >
          <View style={styles.editorHandle} />
          <View style={styles.editorHeader}>
            <View style={styles.editorHeadingRow}>
              <View style={styles.editorIcon}>
                <SymbolView
                  name={{ android: meta.android, ios: meta.ios }}
                  size={20}
                  tintColor={colors.ember}
                />
              </View>
              <Text style={styles.editorTitle}>{t(meta.label)}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('preferences.cancel')}
              onPress={onClose}
              style={styles.closeButton}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
          </View>
          <Text style={styles.editorPrompt}>{t(meta.prompt)}</Text>
          <View style={styles.suggestions}>
            {meta.suggestions.map((suggestion) => {
              const selected = values.some(
                (item) => item.toLowerCase() === suggestion.toLowerCase(),
              );
              return (
                <Pressable
                  key={suggestion}
                  onPress={() => toggleSuggestion(suggestion)}
                  style={[styles.suggestion, selected && styles.suggestionSelected]}
                >
                  <Text style={[styles.suggestionText, selected && styles.suggestionTextSelected]}>
                    {suggestion}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.inputLabel}>{t('preferences.details')}</Text>
          <TextInput
            autoCapitalize="sentences"
            multiline
            onChangeText={setValue}
            placeholder={t('preferences.placeholder')}
            placeholderTextColor={colors.inkMuted}
            style={styles.editorInput}
            textAlignVertical="top"
            value={value}
          />
          {mutation.isError ? (
            <Text style={styles.errorText}>{t('preferences.saveError')}</Text>
          ) : null}
          <Pressable
            disabled={mutation.isPending}
            onPress={() => void save()}
            style={styles.saveButton}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('preferences.save')}</Text>
            )}
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const query = usePreferences();
  const [localMarkdown, setLocalMarkdown] = useState<string>();
  const [selectedHeading, setSelectedHeading] = useState<PreferenceHeading | null>(null);
  const markdown = localMarkdown ?? query.data?.markdown ?? '';
  const sections = useMemo(() => preferenceSections(markdown), [markdown]);
  const completeCount = sections.filter((section) => section.lines.length).length;
  const selectedSection = sections.find((section) => section.heading === selectedHeading) ?? null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel={t('preferences.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <SymbolView
            name={{ android: 'arrow_back', ios: 'chevron.left' }}
            size={20}
            tintColor={colors.ink}
          />
        </Pressable>
        <Text style={styles.topTitle}>{t('preferences.title')}</Text>
        <View style={styles.topSpacer} />
      </View>

      {query.isPending && (
        <View style={styles.state}>
          <ActivityIndicator color={colors.ember} size="large" />
          <Text style={styles.stateBody}>{t('preferences.loading')}</Text>
        </View>
      )}
      {query.isError && (
        <View style={styles.state}>
          <View style={styles.stateIcon}>
            <SymbolView
              name={{ android: 'cloud_off', ios: 'icloud.slash' }}
              size={24}
              tintColor={colors.ember}
            />
          </View>
          <Text style={styles.stateTitle}>{t('preferences.errorTitle')}</Text>
          <Text style={styles.stateBody}>{t('preferences.error')}</Text>
          <Pressable onPress={() => void query.refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('preferences.retry')}</Text>
          </Pressable>
        </View>
      )}
      {query.isSuccess && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{t('preferences.eyebrow')}</Text>
            <Text style={styles.heroTitle}>{t('preferences.heroTitle')}</Text>
            <Text style={styles.heroBody}>{t('preferences.heroBody')}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(completeCount / sections.length) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {t('preferences.progress', { complete: completeCount, total: sections.length })}
              </Text>
            </View>
          </View>

          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupTitle}>{t(group.key)}</Text>
              <View style={styles.cardGroup}>
                {group.headings.map((heading, index) => {
                  const section = sections.find((item) => item.heading === heading);
                  if (!section) return null;
                  const meta = sectionMeta[heading];
                  const summary = section.lines.slice(0, 2).join(' · ');
                  return (
                    <Pressable
                      accessibilityHint={t('preferences.openHint')}
                      key={heading}
                      onPress={() => setSelectedHeading(heading)}
                      style={({ pressed }) => [
                        styles.sectionRow,
                        index < group.headings.length - 1 && styles.sectionDivider,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.sectionIcon}>
                        <SymbolView
                          name={{ android: meta.android, ios: meta.ios }}
                          size={20}
                          tintColor={colors.ember}
                        />
                      </View>
                      <View style={styles.sectionCopy}>
                        <Text style={styles.sectionTitle}>{t(meta.label)}</Text>
                        <Text
                          numberOfLines={2}
                          style={[styles.sectionSummary, !summary && styles.sectionEmpty]}
                        >
                          {summary || t('preferences.notSet')}
                        </Text>
                      </View>
                      {section.lines.length ? <View style={styles.completeDot} /> : null}
                      <SymbolView
                        name={{ android: 'chevron_right', ios: 'chevron.right' }}
                        size={17}
                        tintColor={colors.inkMuted}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <View style={styles.privacyNote}>
            <SymbolView
              name={{ android: 'lock', ios: 'lock.fill' }}
              size={15}
              tintColor={colors.herb}
            />
            <Text style={styles.privacyText}>{t('preferences.privacy')}</Text>
          </View>
        </ScrollView>
      )}

      <PreferenceEditor
        markdown={markdown}
        onClose={() => setSelectedHeading(null)}
        onSave={async (nextMarkdown) => setLocalMarkdown(nextMarkdown)}
        section={selectedSection}
      />
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: space.lg,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  topTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 16 },
  topSpacer: { width: 40 },
  content: { gap: space.xl, padding: space.lg, paddingBottom: space.hero },
  intro: {
    backgroundColor: palette.ink,
    borderRadius: radius.xl,
    gap: space.sm,
    overflow: 'hidden',
    padding: space.xl,
    ...shadow,
  },
  eyebrow: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: palette.canvasRaised,
    fontFamily: fonts.recipeHeading,
    fontSize: 27,
    letterSpacing: -0.6,
  },
  heroBody: { color: palette.line, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: space.md, marginTop: space.md },
  progressTrack: {
    backgroundColor: palette.inkMuted,
    borderRadius: radius.pill,
    flex: 1,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: palette.ember, borderRadius: radius.pill, height: '100%' },
  progressText: { color: palette.canvasRaised, fontFamily: fonts.sansMedium, fontSize: 11 },
  group: { gap: space.sm },
  groupTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.7,
    marginLeft: space.xs,
    textTransform: 'uppercase',
  },
  cardGroup: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    marginHorizontal: space.lg,
    minHeight: 78,
    paddingVertical: space.md,
  },
  sectionDivider: { borderBottomColor: palette.line, borderBottomWidth: 1 },
  sectionIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 15 },
  sectionSummary: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  sectionEmpty: { fontStyle: 'italic', opacity: 0.72 },
  completeDot: { backgroundColor: palette.herb, borderRadius: radius.pill, height: 6, width: 6 },
  pressed: { opacity: 0.62 },
  privacyNote: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  privacyText: {
    color: palette.inkMuted,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: space.md,
    justifyContent: 'center',
    padding: space.xl,
  },
  stateIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  stateTitle: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 22 },
  stateBody: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 14, textAlign: 'center' },
  retryButton: {
    backgroundColor: palette.ink,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  retryText: { color: palette.canvasRaised, fontFamily: fonts.sansSemibold, fontSize: 14 },
  editorBackdrop: { backgroundColor: 'rgba(9,8,6,0.48)', flex: 1, justifyContent: 'flex-end' },
  editorDismiss: { flex: 1 },
  editorSheet: {
    backgroundColor: palette.canvasRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: space.lg,
    padding: space.xl,
  },
  editorHandle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    width: 40,
  },
  editorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  editorHeadingRow: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: space.md },
  editorIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  editorTitle: { color: palette.ink, flex: 1, fontFamily: fonts.recipeHeading, fontSize: 22 },
  closeButton: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  editorPrompt: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  suggestion: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suggestionSelected: { backgroundColor: palette.softClay, borderColor: palette.ember },
  suggestionText: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 12 },
  suggestionTextSelected: { color: palette.emberDark },
  inputLabel: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 13 },
  editorInput: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 112,
    padding: space.md,
  },
  errorText: { color: palette.danger, fontFamily: fonts.sansMedium, fontSize: 12 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonText: { color: palette.white, fontFamily: fonts.sansBold, fontSize: 15 },
}));
