import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CookingDocument,
  CookingTimer,
  SavedRecipe,
  SavedRecipeList,
  SaveRecipeRequest,
} from 'librechat-data-provider';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

import { ActionSheet } from '@/components/actionsheet';
import { fonts, radius, space } from '@/constants/theme';
import { ApiError, apiFetch } from '@/lib/api/client';
import { recipeKeys } from '@/features/recipes/queries';
import { useOfflineLibrary } from '@/features/offline/provider';
import { RecipeVoiceMode } from '@/features/voice/mode';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { RecipeMarkdown } from '@/features/recipes/markdown';
import { shouldRenderCanonicalMarkdown } from './document';

const documentLabel = (type: CookingDocument['documentType']) => {
  if (type === 'guide') return 'Guide';
  if (type === 'prep_plan') return 'Prep plan';
  return 'Recipe';
};

const sourceLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
};

const documentMarkdown = (document: CookingDocument) => {
  if (document.documentMarkdown?.trim()) return document.documentMarkdown.trim();
  const { recipe } = document;
  return [
    `# ${recipe.title}`,
    recipe.description,
    `Serves ${recipe.servings} · ${recipe.timing.totalMinutes} min`,
    '## Ingredients',
    ...recipe.ingredients.map((ingredient) => `- ${ingredient.originalText}`),
    '## Method',
    ...recipe.steps.map((step) => `${step.order}. ${step.text}`),
    ...(recipe.notes.length ? ['## Notes', ...recipe.notes.map((note) => `- ${note}`)] : []),
  ]
    .filter(Boolean)
    .join('\n\n');
};

const timerText = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

function KitchenTimer({ timer }: { timer: CookingTimer }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const [remaining, setRemaining] = useState(timer.durationSeconds);
  const [running, setRunning] = useState(false);
  const endsAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(next);
      if (next > 0) return;
      setRunning(false);
      endsAt.current = undefined;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    const interval = setInterval(tick, 500);
    tick();
    return () => clearInterval(interval);
  }, [running]);

  const toggle = () => {
    void Haptics.selectionAsync();
    if (running) {
      const next = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(next);
      endsAt.current = undefined;
      setRunning(false);
      return;
    }
    const next = remaining || timer.durationSeconds;
    setRemaining(next);
    endsAt.current = Date.now() + next * 1000;
    setRunning(true);
  };

  const reset = () => {
    setRunning(false);
    endsAt.current = undefined;
    setRemaining(timer.durationSeconds);
  };

  let androidTimerIcon: AndroidSymbol = 'play_arrow';
  let iosTimerIcon: SFSymbol = 'play.fill';
  if (running) {
    androidTimerIcon = 'pause';
    iosTimerIcon = 'pause.fill';
  } else if (remaining === 0) {
    androidTimerIcon = 'replay';
    iosTimerIcon = 'arrow.clockwise';
  }

  return (
    <View
      style={[styles.timer, running && styles.timerRunning, remaining === 0 && styles.timerDone]}
    >
      <Pressable accessibilityRole="button" onPress={toggle} style={styles.timerPrimary}>
        <SymbolView
          name={{ android: androidTimerIcon, ios: iosTimerIcon }}
          size={14}
          tintColor={running ? colors.saffron : colors.ink}
        />
        <Text style={styles.timerLabel}>{timer.label || t('canvas.timer')}</Text>
        <Text style={styles.timerValue}>{timerText(remaining)}</Text>
      </Pressable>
      {remaining !== timer.durationSeconds ? (
        <Pressable accessibilityLabel={t('canvas.resetTimer')} hitSlop={8} onPress={reset}>
          <SymbolView
            name={{ android: 'refresh', ios: 'arrow.counterclockwise' }}
            size={14}
            tintColor={colors.inkMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function useSavedDocument(document: CookingDocument) {
  const queryClient = useQueryClient();
  const { syncNow } = useOfflineLibrary();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const savedQuery = useQuery({
    queryKey: [...recipeKeys.all, 'by-draft', document._id],
    queryFn: async () => {
      try {
        return await apiFetch<SavedRecipe>(
          `/api/recipes/by-draft/${encodeURIComponent(document._id)}`,
        );
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) return null;
        throw caught;
      }
    },
    retry: false,
  });
  const markdown = documentMarkdown(document);
  const saved = savedQuery.data;
  const changed = Boolean(saved && saved.documentMarkdown.trim() !== markdown);

  const save = async (saveList?: SavedRecipeList) => {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    const payload: SaveRecipeRequest = {
      title: document.recipe.title,
      documentType: document.documentType,
      documentMarkdown: markdown,
      recipe: document.recipe,
      sourceConversationId: document.conversationId,
      sourceDraftId: document._id,
      ...(saveList ? { saveList } : {}),
    };
    try {
      const next = saved
        ? await apiFetch<SavedRecipe>(`/api/recipes/${encodeURIComponent(saved._id)}`, {
            method: 'PATCH',
            body: payload,
          })
        : await apiFetch<SavedRecipe>('/api/recipes', { method: 'POST', body: payload });
      queryClient.setQueryData([...recipeKeys.all, 'by-draft', document._id], next);
      await queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      void syncNow().catch(() => undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The recipe could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return { changed, error, saved, saving, save };
}

export function RecipeCanvas({
  document,
  documents,
  busy,
  onDelete,
  onSelect,
  onStart,
}: {
  document: CookingDocument;
  documents: CookingDocument[];
  busy: boolean;
  onDelete: (documentId: string) => void;
  onSelect: (documentId: string) => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CookingDocument>();
  const saved = useSavedDocument(document);
  const recipe = document.recipe;
  const markdown = documentMarkdown(document);
  const renderCanonicalMarkdown = shouldRenderCanonicalMarkdown(document);
  let saveLabel = t('canvas.save');
  if (saved.saved) saveLabel = saved.changed ? t('canvas.update') : t('canvas.saved');

  useEffect(() => {
    setChecked({});
    setSaveSheetOpen(false);
    setDeleteTarget(undefined);
  }, [document._id]);

  const requestSave = () => {
    if (saved.saved) {
      if (saved.changed) void saved.save(saved.saved.saveList);
      return;
    }
    setSaveSheetOpen(true);
  };

  const confirmDelete = (target: CookingDocument) => {
    setDeleteTarget(target);
  };

  return (
    <View style={styles.screen}>
      {documents.length > 1 ? (
        <ScrollView
          contentContainerStyle={styles.documentTabs}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {documents.map((item) => {
            const selected = item._id === document._id;
            return (
              <View
                key={item._id}
                style={[styles.documentTab, selected && styles.documentTabSelected]}
              >
                <Pressable disabled={selected || busy} onPress={() => onSelect(item._id)}>
                  <Text
                    numberOfLines={1}
                    style={[styles.documentTabText, selected && styles.documentTabTextSelected]}
                  >
                    {item.recipe.title}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t('canvas.delete')}
                  hitSlop={8}
                  onPress={() => confirmDelete(item)}
                >
                  <SymbolView
                    name={{ android: 'close', ios: 'xmark' }}
                    size={13}
                    tintColor={colors.inkMuted}
                  />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.canvasHeader}>
          <View style={styles.canvasKickerRow}>
            <Text style={styles.canvasKicker}>{documentLabel(document.documentType)}</Text>
            {document.sourceUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(document.sourceUrl!)}
              >
                <Text style={styles.sourceLink}>· {sourceLabel(document.sourceUrl)} ↗</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.title}>{recipe.title}</Text>
          {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
          <View style={styles.canvasActions}>
            <Pressable
              accessibilityRole="button"
              disabled={saved.saving || Boolean(saved.saved && !saved.changed)}
              onPress={requestSave}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              {saved.saving ? (
                <ActivityIndicator color={colors.ember} size="small" />
              ) : (
                <SymbolView
                  name={{
                    android: saved.saved && !saved.changed ? 'bookmark_added' : 'bookmark_add',
                    ios: saved.saved && !saved.changed ? 'bookmark.fill' : 'bookmark',
                  }}
                  size={18}
                  tintColor={colors.ember}
                />
              )}
              <Text style={styles.actionText}>{saveLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void Share.share({ message: markdown, title: recipe.title })}
              style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
            >
              <SymbolView
                name={{ android: 'share', ios: 'square.and.arrow.up' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
            <RecipeVoiceMode
              conversationId={document.conversationId}
              recipeMarkdown={markdown}
              recipeTitle={recipe.title}
              tone="compact"
              voiceId={`canvas:${document._id}`}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onStart}
              style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
            >
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : null}
              <Text style={styles.startButtonText}>{t('cook.startCooking')}</Text>
            </Pressable>
          </View>
          {saved.error ? <Text style={styles.error}>{saved.error}</Text> : null}
        </View>

        {document.documentType === 'recipe' && !renderCanonicalMarkdown ? (
          <View style={styles.recipeBody}>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{recipe.servings || '—'}</Text>
                <Text style={styles.metricLabel}>{t('canvas.servings')}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{recipe.timing.prepMinutes || '—'}</Text>
                <Text style={styles.metricLabel}>{t('canvas.prepMinutes')}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{recipe.timing.totalMinutes || '—'}</Text>
                <Text style={styles.metricLabel}>{t('canvas.totalMinutes')}</Text>
              </View>
            </View>

            <Text style={styles.heading}>{t('recipe.ingredients')}</Text>
            <View style={styles.ingredients}>
              {recipe.ingredients.map((ingredient) => {
                const selected = Boolean(checked[ingredient.id]);
                return (
                  <Pressable
                    key={ingredient.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() =>
                      setChecked((current) => ({ ...current, [ingredient.id]: !selected }))
                    }
                    style={styles.ingredient}
                  >
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                      {selected ? (
                        <SymbolView
                          name={{ android: 'check', ios: 'checkmark' }}
                          size={13}
                          tintColor={colors.white}
                        />
                      ) : null}
                    </View>
                    <Text style={[styles.ingredientText, selected && styles.ingredientChecked]}>
                      {ingredient.originalText}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.heading}>{t('recipe.steps')}</Text>
            <View style={styles.steps}>
              {recipe.steps.map((step, index) => (
                <View key={step.id} style={styles.step}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                  <View style={styles.stepCopy}>
                    <Text style={styles.stepText}>{step.text}</Text>
                    {step.timers.map((timer) => (
                      <KitchenTimer key={timer.id} timer={timer} />
                    ))}
                    {step.tips.map((tip) => (
                      <View key={tip} style={styles.tip}>
                        <Text style={styles.tipLabel}>{t('canvas.tip')}</Text>
                        <Text style={styles.tipText}>{tip}</Text>
                      </View>
                    ))}
                    {step.warnings.map((warning) => (
                      <View key={warning} style={styles.warning}>
                        <Text style={styles.warningText}>{warning}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
            {recipe.notes.length ? (
              <View style={styles.notes}>
                <Text style={styles.heading}>{t('canvas.notes')}</Text>
                {recipe.notes.map((note) => (
                  <Text key={note} style={styles.note}>
                    • {note}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.guideBody}>
            <RecipeMarkdown value={markdown} />
          </View>
        )}
      </ScrollView>
      <ActionSheet
        actions={[
          {
            description: t('canvas.wantToCookSubtitle'),
            icon: { android: 'bookmark_add', ios: 'bookmark' },
            label: t('canvas.wantToCook'),
            onPress: () => {
              setSaveSheetOpen(false);
              void saved.save('want_to_cook');
            },
            tone: 'accent',
          },
          {
            description: t('canvas.cookedAlreadySubtitle'),
            icon: { android: 'check_circle', ios: 'checkmark.circle' },
            label: t('canvas.cookedAlready'),
            onPress: () => {
              setSaveSheetOpen(false);
              void saved.save('cooked_already');
            },
          },
        ]}
        closeLabel={t('cook.cancel')}
        description={t('canvas.saveSubtitle')}
        onClose={() => setSaveSheetOpen(false)}
        title={t('canvas.saveTitle')}
        visible={saveSheetOpen}
      />
      <ActionSheet
        actions={
          deleteTarget
            ? [
                {
                  description: t('canvas.deleteActionSubtitle'),
                  icon: { android: 'delete', ios: 'trash' },
                  label: t('canvas.delete'),
                  onPress: () => {
                    const target = deleteTarget;
                    setDeleteTarget(undefined);
                    onDelete(target._id);
                  },
                  tone: 'danger',
                },
              ]
            : []
        }
        closeLabel={t('cook.cancel')}
        description={
          deleteTarget
            ? t('canvas.deleteSubtitle', { title: deleteTarget.recipe.title })
            : undefined
        }
        onClose={() => setDeleteTarget(undefined)}
        title={t('canvas.deleteTitle')}
        visible={Boolean(deleteTarget)}
      />
    </View>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { flex: 1, marginHorizontal: -space.lg },
  documentTabs: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  documentTab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flexDirection: 'row',
    gap: space.sm,
    maxWidth: 220,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  documentTabSelected: { borderBottomColor: palette.ember },
  documentTabText: {
    color: palette.inkMuted,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    maxWidth: 170,
  },
  documentTabTextSelected: { color: palette.ink },
  content: { paddingBottom: 130 },
  canvasHeader: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    gap: space.md,
    padding: space.xl,
  },
  canvasKickerRow: { alignItems: 'center', flexDirection: 'row' },
  canvasKicker: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  sourceLink: { color: palette.emberDark, fontFamily: fonts.sansMedium, fontSize: 12 },
  title: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 40,
  },
  description: {
    color: palette.inkMuted,
    fontFamily: fonts.recipeBody,
    fontSize: 15,
    lineHeight: 24,
  },
  canvasActions: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  actionButton: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 42,
    paddingHorizontal: space.md,
  },
  actionText: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 12 },
  iconAction: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.sm,
    marginLeft: 'auto',
    minHeight: 42,
    paddingHorizontal: space.lg,
  },
  startButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 12 },
  error: { color: palette.danger, fontFamily: fonts.sans, fontSize: 12 },
  recipeBody: { gap: space.xl, padding: space.xl },
  metrics: { flexDirection: 'row', gap: space.sm },
  metric: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: space.md,
  },
  metricValue: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 20 },
  metricLabel: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  heading: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 24 },
  ingredients: { gap: space.xs },
  ingredient: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.md,
    minHeight: 42,
    paddingVertical: space.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxSelected: { backgroundColor: palette.herb, borderColor: palette.herb },
  ingredientText: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.recipeBody,
    fontSize: 16,
    lineHeight: 24,
  },
  ingredientChecked: { color: palette.inkMuted, textDecorationLine: 'line-through' },
  steps: { gap: space.xl },
  step: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md },
  stepNumber: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    color: palette.white,
    fontFamily: fonts.mono,
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stepCopy: { flex: 1, gap: space.md },
  stepText: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 16, lineHeight: 27 },
  timer: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  timerRunning: { borderColor: palette.saffron },
  timerDone: { borderColor: palette.herb },
  timerPrimary: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  timerLabel: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 12 },
  timerValue: { color: palette.ink, fontFamily: fonts.mono, fontSize: 12 },
  tip: { backgroundColor: palette.herbSoft, borderRadius: radius.md, gap: 2, padding: space.md },
  tipLabel: {
    color: palette.herb,
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  tipText: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 14, lineHeight: 21 },
  warning: { backgroundColor: palette.dangerSoft, borderRadius: radius.md, padding: space.md },
  warningText: {
    color: palette.danger,
    fontFamily: fonts.recipeBodyBold,
    fontSize: 13,
    lineHeight: 20,
  },
  notes: { gap: space.md },
  note: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 15, lineHeight: 24 },
  guideBody: { padding: space.xl },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
}));
