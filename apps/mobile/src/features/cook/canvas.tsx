import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CookingDocument,
  SavedRecipe,
  SavedRecipeList,
  SaveRecipeRequest,
} from 'librechat-data-provider';
import { recipe, recipeByDraft, recipes } from 'librechat-data-provider/mobile';
import type { ActiveTimerState } from '@/features/recipes/workspace';

import { ActionSheet } from '@/components/actionsheet';
import { fonts, radius, space } from '@/constants/theme';
import { ApiError, apiFetch } from '@/lib/api/client';
import { userErrorMessage } from '@/lib/errors';
import { recipeKeys } from '@/features/recipes/queries';
import { useOfflineLibrary } from '@/features/offline/provider';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { RecipeVoiceMode } from '@/features/voice/mode';
import { useTranslation } from '@/lib/i18n';
import { RecipeMarkdown } from '@/features/recipes/markdown';
import { RecipeMetrics } from '@/features/recipes/metrics';
import {
  recipeSupplementFromMarkdown,
  structuredRecipeFromMarkdown,
} from '@/features/recipes/content';
import { ActiveTimerDock, RecipeWorkspace } from '@/features/recipes/workspace';
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

function useSavedDocument(document: CookingDocument) {
  const queryClient = useQueryClient();
  const { syncNow } = useOfflineLibrary();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const savedQuery = useQuery({
    queryKey: [...recipeKeys.all, 'by-draft', document._id],
    queryFn: async () => {
      try {
        return await apiFetch<SavedRecipe>(recipeByDraft(document._id));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) return null;
        throw caught;
      }
    },
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.categorizationStatus;
      return status === 'pending' || status === 'processing' ? 1500 : false;
    },
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
        ? await apiFetch<SavedRecipe>(recipe(saved._id), {
            method: 'PATCH',
            body: payload,
          })
        : await apiFetch<SavedRecipe>(recipes(), { method: 'POST', body: payload });
      queryClient.setQueryData([...recipeKeys.all, 'by-draft', document._id], next);
      await queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      void syncNow().catch(() => undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (caught) {
      setError(userErrorMessage(caught, 'The recipe could not be saved. Please try again.'));
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
}: {
  document: CookingDocument;
  documents: CookingDocument[];
  busy: boolean;
  onDelete: (documentId: string) => void;
  onSelect: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CookingDocument>();
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [activeTimers, setActiveTimers] = useState<Record<string, ActiveTimerState>>({});
  const saved = useSavedDocument(document);
  const recipe = document.recipe;
  const markdown = documentMarkdown(document);
  const supplement = recipeSupplementFromMarkdown(markdown);
  const workspaceRecipe = shouldRenderCanonicalMarkdown(document)
    ? structuredRecipeFromMarkdown(markdown, recipe)
    : recipe;
  const handleTimerChange = useCallback((timerId: string, state?: ActiveTimerState) => {
    setActiveTimers((current) => {
      if (state) return { ...current, [timerId]: state };
      if (!current[timerId]) return current;
      const next = { ...current };
      delete next[timerId];
      return next;
    });
  }, []);
  let saveLabel = t('canvas.save');
  if (saved.saved) saveLabel = saved.changed ? t('canvas.update') : t('canvas.saved');

  useEffect(() => {
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
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={(event) => setHeaderCollapsed(event.nativeEvent.contentOffset.y > 180)}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      >
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
          </View>
          {saved.error ? <Text style={styles.error}>{saved.error}</Text> : null}
        </View>

        {document.documentType === 'recipe' && workspaceRecipe ? (
          <View style={styles.recipeBody}>
            <RecipeMetrics
              metrics={[
                {
                  label: t('recipe.prepTime'),
                  value: t('recipe.minutes', { count: workspaceRecipe.timing.prepMinutes }),
                },
                {
                  label: t('recipe.cookTime'),
                  value: t('recipe.minutes', { count: workspaceRecipe.timing.cookMinutes }),
                },
                {
                  label: t('recipe.totalTime'),
                  value: t('recipe.minutes', { count: workspaceRecipe.timing.totalMinutes }),
                },
              ]}
            />
            <RecipeWorkspace
              onTimerChange={handleTimerChange}
              recipe={workspaceRecipe}
              supplement={supplement}
              workspaceId={`draft:${document._id}`}
            />
          </View>
        ) : (
          <View style={styles.guideBody}>
            <RecipeMarkdown value={markdown} />
          </View>
        )}
      </ScrollView>
      {headerCollapsed ? (
        <View
          style={[styles.collapsedHeader, documents.length > 1 && styles.collapsedHeaderWithTabs]}
        >
          <Text numberOfLines={1} style={styles.collapsedTitle}>
            {recipe.title}
          </Text>
          <RecipeVoiceMode
            conversationId={document.conversationId}
            recipeMarkdown={markdown}
            recipeTitle={recipe.title}
            tone="compact"
            voiceId={`canvas-header:${document._id}`}
          />
        </View>
      ) : null}
      <ActiveTimerDock timers={Object.values(activeTimers)} />
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
  collapsedHeader: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    left: 0,
    minHeight: 54,
    paddingHorizontal: space.xl,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  collapsedHeaderWithTabs: { top: 59 },
  collapsedTitle: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
  },
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
