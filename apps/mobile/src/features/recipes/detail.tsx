import { useCallback, useEffect, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeMetric } from './content';
import type { RecipeDetail, StructuredRecipe } from './types';
import type { ActiveTimerState } from './workspace';
import type { RecipeWorkspaceState } from 'librechat-data-provider';
import { ActionSheet } from '@/components/actionsheet';
import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { shouldRenderRecipeMarkdown } from '@/features/cook/document';
import {
  recipeReaderContent,
  recipeSupplementFromMarkdown,
  structuredRecipeFromMarkdown,
} from './content';
import { AuthenticatedImage } from './authenticated-image';
import { RecipeMarkdown } from './markdown';
import { RecipeMetrics } from './metrics';
import { ActiveTimerDock, RecipeWorkspace } from './workspace';
import { useDeleteRecipe, usePublicRecipe, useRecipe, useUpdateRecipe } from './queries';
import { RecipeVoiceMode } from '@/features/voice/mode';

const structuredRecipeMarkdown = (title: string, recipe?: StructuredRecipe) => {
  if (!recipe) return `# ${title}`;
  return [
    `# ${recipe.title}`,
    recipe.description,
    `Serves ${recipe.servings} · ${recipe.timing.totalMinutes} min`,
    '## Ingredients',
    ...recipe.ingredients.map((ingredient) => `- ${ingredient.originalText}`),
    '## Method',
    ...recipe.steps.map((step) => `${step.order}. ${step.text}`),
  ]
    .filter(Boolean)
    .join('\n\n');
};

const sourceName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function RecipeDetailView({
  recipeId,
  onClose,
  source = 'private',
  standalone = false,
}: {
  recipeId: string | null;
  onClose(): void;
  source?: 'private' | 'public';
  standalone?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [activeTimers, setActiveTimers] = useState<Record<string, ActiveTimerState>>({});
  const [editTitle, setEditTitle] = useState('');
  const [editCollections, setEditCollections] = useState('');
  const workspaceSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWorkspaceState = useRef<Omit<RecipeWorkspaceState, 'updatedAt'> | null>(null);
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const updateRecipeRef = useRef(updateRecipe);
  updateRecipeRef.current = updateRecipe;
  const handleTimerChange = useCallback((timerId: string, state?: ActiveTimerState) => {
    setActiveTimers((current) => {
      if (state) return { ...current, [timerId]: state };
      if (!current[timerId]) return current;
      const next = { ...current };
      delete next[timerId];
      return next;
    });
  }, []);
  const privateQuery = useRecipe(source === 'private' ? recipeId : null);
  const publicQuery = usePublicRecipe(source === 'public' ? recipeId : null);
  const query = source === 'public' ? publicQuery : privateQuery;
  const detail = query.data;
  const privateDetail = source === 'private' ? (detail as RecipeDetail | undefined) : undefined;
  const syncWorkspaceState = useCallback(
    (workspaceState: Omit<RecipeWorkspaceState, 'updatedAt'>) => {
      if (!privateDetail || !recipeId) return;
      pendingWorkspaceState.current = workspaceState;
      if (workspaceSyncTimer.current) return;
      workspaceSyncTimer.current = setTimeout(() => {
        workspaceSyncTimer.current = null;
        const pending = pendingWorkspaceState.current;
        pendingWorkspaceState.current = null;
        if (!pending) return;
        updateRecipe.mutate({ id: recipeId, patch: { workspaceState: pending } });
      }, 1000);
    },
    [privateDetail, recipeId, updateRecipe],
  );
  useEffect(
    () => () => {
      if (workspaceSyncTimer.current) clearTimeout(workspaceSyncTimer.current);
      const pending = pendingWorkspaceState.current;
      if (pending && recipeId) {
        updateRecipeRef.current.mutate({ id: recipeId, patch: { workspaceState: pending } });
      }
    },
    [recipeId],
  );
  const recipe = detail?.recipe;
  const canonicalMarkdown = detail?.documentMarkdown.trim();
  const renderCanonicalMarkdown = shouldRenderRecipeMarkdown({
    documentMarkdown: canonicalMarkdown,
    recipe,
  });
  const readerContent = canonicalMarkdown ? recipeReaderContent(canonicalMarkdown) : undefined;
  const supplement = canonicalMarkdown
    ? recipeSupplementFromMarkdown(canonicalMarkdown)
    : undefined;
  const workspaceRecipe =
    recipe && renderCanonicalMarkdown && canonicalMarkdown
      ? (structuredRecipeFromMarkdown(canonicalMarkdown, recipe) ?? undefined)
      : recipe;
  let workspaceMetrics: RecipeMetric[] = [];
  if (renderCanonicalMarkdown && readerContent?.metrics.length) {
    workspaceMetrics = readerContent.metrics;
  } else if (workspaceRecipe) {
    workspaceMetrics = [
      {
        label: t('recipe.yield'),
        value: t('recipe.servings', { count: workspaceRecipe.servings }),
      },
      {
        label: t('recipe.prepTime'),
        value: t('recipe.minutes', { count: workspaceRecipe.timing.prepMinutes }),
      },
      {
        label: t('recipe.cookTime'),
        value: t('recipe.minutes', { count: workspaceRecipe.timing.cookMinutes }),
      },
    ];
  }
  const workspaceYieldText =
    privateDetail?.yield ??
    workspaceMetrics.find((metric) => /^(servings?|yield)$/i.test(metric.label.trim()))?.value;
  const voiceMarkdown = detail
    ? canonicalMarkdown || structuredRecipeMarkdown(detail.title, recipe)
    : '';
  const voiceConversationId =
    detail && 'sourceConversationId' in detail && typeof detail.sourceConversationId === 'string'
      ? detail.sourceConversationId
      : undefined;
  const openEditor = () => {
    if (!privateDetail) return;
    setEditTitle(privateDetail.title);
    setEditCollections(privateDetail.collections.join(', '));
    setActionsOpen(false);
    setEditOpen(true);
  };
  const saveEditor = () => {
    if (!privateDetail || !editTitle.trim()) return;
    const title = editTitle.trim();
    const markdown = privateDetail.documentMarkdown.replace(/^#\s+.*$/m, `# ${title}`);
    updateRecipe.mutate({
      id: privateDetail._id,
      patch: {
        title,
        documentMarkdown: markdown,
        collections: editCollections
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
    });
    setEditOpen(false);
  };
  const confirmDelete = () => {
    if (!privateDetail) return;
    setActionsOpen(false);
    Alert.alert(t('library.deleteTitle'), t('library.deleteBody', { title: privateDetail.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('library.delete'),
        style: 'destructive',
        onPress: () => deleteRecipe.mutate(privateDetail._id, { onSuccess: onClose }),
      },
    ]);
  };
  let recipeContent = <Text style={styles.body}>{t('recipe.noDetails')}</Text>;
  if (workspaceRecipe && detail?.documentType === 'recipe') {
    recipeContent = (
      <>
        <RecipeMetrics metrics={workspaceMetrics} />
        <RecipeWorkspace
          initialNotes={privateDetail?.personalNotes}
          initialWorkspaceState={privateDetail?.workspaceState}
          isCooked={privateDetail?.saveList === 'cooked_already'}
          metadata={detail?.categorization}
          onMarkCooked={
            privateDetail
              ? () =>
                  updateRecipe.mutate({
                    id: privateDetail._id,
                    patch: { saveList: 'cooked_already' },
                  })
              : undefined
          }
          onNotesChange={
            privateDetail
              ? (personalNotes) =>
                  updateRecipe.mutate({ id: privateDetail._id, patch: { personalNotes } })
              : undefined
          }
          onTimerChange={handleTimerChange}
          onWorkspaceStateChange={privateDetail ? syncWorkspaceState : undefined}
          recipe={workspaceRecipe}
          supplement={supplement}
          workspaceId={`saved:${recipeId}`}
          yieldText={workspaceYieldText}
        />
      </>
    );
  } else if (renderCanonicalMarkdown && canonicalMarkdown && readerContent) {
    recipeContent = (
      <>
        {readerContent.beforeMetrics ? (
          <RecipeMarkdown value={readerContent.beforeMetrics} />
        ) : null}
        <RecipeMetrics metrics={readerContent.metrics} />
        {readerContent.afterMetrics ? <RecipeMarkdown value={readerContent.afterMetrics} /> : null}
      </>
    );
  }

  let content = (
    <View style={styles.center}>
      <Text style={styles.body}>{t('library.error')}</Text>
      <Pressable onPress={() => void query.refetch()}>
        <Text style={styles.retry}>{t('library.retry')}</Text>
      </Pressable>
    </View>
  );
  if (query.isLoading) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ember} size="large" />
      </View>
    );
  } else if (!query.isError && detail) {
    content = (
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={(event) => setHeaderCollapsed(event.nativeEvent.contentOffset.y > 250)}
        scrollEventThrottle={32}
      >
        {detail.illustrationUrl ? (
          <AuthenticatedImage
            cachePolicy="memory-disk"
            contentFit="cover"
            path={detail.illustrationUrl}
            style={styles.image}
            transition={250}
          />
        ) : null}
        <View
          style={[styles.copy, detail.illustrationUrl ? styles.copyWithImage : styles.copyAlone]}
        >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{detail.title}</Text>
            {privateDetail?.sourceUrl ? (
              <Pressable
                accessibilityLabel={t('recipe.openOriginalFrom', {
                  source: sourceName(privateDetail.sourceUrl),
                })}
                accessibilityRole="link"
                hitSlop={6}
                onPress={() => void Linking.openURL(privateDetail.sourceUrl ?? '')}
                style={styles.titleSourceLink}
              >
                <SymbolView
                  name={{ android: 'open_in_new', ios: 'arrow.up.right' }}
                  size={17}
                  tintColor={colors.ember}
                />
              </Pressable>
            ) : null}
          </View>
          {'author' in detail ? (
            <Text style={styles.author}>{t('explore.by', { name: detail.author.name })}</Text>
          ) : null}
          {detail.shortDescription ? (
            <Text style={styles.description}>{detail.shortDescription}</Text>
          ) : null}
          {privateDetail?.categorizationStatus === 'pending' ||
          privateDetail?.categorizationStatus === 'processing' ? (
            <Text accessibilityLiveRegion="polite" style={styles.enrichmentStatus}>
              {t('recipe.analyzingDetails')}
            </Text>
          ) : null}
          {privateDetail?.categorizationStatus === 'failed' ? (
            <Text accessibilityLiveRegion="polite" style={styles.enrichmentWarning}>
              {t('recipe.detailsUnavailable')}
            </Text>
          ) : null}
          {privateDetail?.collections.length ? (
            <View style={styles.recipeMetaRow}>
              {privateDetail.collections.map((collection) => (
                <Text key={collection} style={styles.collectionBadge}>
                  {collection}
                </Text>
              ))}
            </View>
          ) : null}
          {recipeContent}
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View
        pointerEvents="none"
        style={[
          styles.statusScrim,
          headerCollapsed && styles.statusScrimCollapsed,
          { height: insets.top + 62 },
        ]}
      />
      <View style={[styles.toolbar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <Pressable
          accessibilityLabel={standalone ? t('recipe.back') : t('recipe.close')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.close}
        >
          <SymbolView
            name={
              standalone
                ? { android: 'arrow_back', ios: 'chevron.left' }
                : { android: 'close', ios: 'xmark' }
            }
            size={19}
            tintColor={colors.white}
          />
        </Pressable>
        {headerCollapsed && detail ? (
          <Text numberOfLines={1} style={styles.collapsedTitle}>
            {detail.title}
          </Text>
        ) : (
          <View style={styles.toolbarSpacer} />
        )}
        {detail ? (
          <RecipeVoiceMode
            conversationId={voiceConversationId}
            recipeMarkdown={voiceMarkdown}
            recipeTitle={detail.title}
            tone={headerCollapsed ? 'compact' : 'overlay'}
            voiceId={`recipe:${recipeId}`}
          />
        ) : null}
        {privateDetail ? (
          <Pressable
            accessibilityLabel={t('recipe.manage')}
            accessibilityRole="button"
            onPress={() => setActionsOpen(true)}
            style={styles.close}
          >
            <SymbolView
              name={{ android: 'more_vert', ios: 'ellipsis' }}
              size={20}
              tintColor={colors.white}
            />
          </Pressable>
        ) : null}
      </View>
      {content}
      <ActiveTimerDock timers={Object.values(activeTimers)} />
      <ActionSheet
        actions={
          privateDetail
            ? [
                {
                  icon: { android: 'edit', ios: 'pencil' },
                  label: t('recipe.editDetails'),
                  onPress: openEditor,
                  tone: 'accent',
                },
                {
                  icon: { android: 'star', ios: 'star' },
                  label: t(
                    privateDetail.favorite ? 'library.removeFavorite' : 'library.addFavorite',
                  ),
                  onPress: () => {
                    updateRecipe.mutate({
                      id: privateDetail._id,
                      patch: { favorite: !privateDetail.favorite },
                    });
                    setActionsOpen(false);
                  },
                },
                {
                  icon: { android: 'push_pin', ios: 'pin' },
                  label: t(privateDetail.pinned ? 'library.unpin' : 'library.pin'),
                  onPress: () => {
                    updateRecipe.mutate({
                      id: privateDetail._id,
                      patch: { pinned: !privateDetail.pinned },
                    });
                    setActionsOpen(false);
                  },
                },
                {
                  icon: { android: 'done', ios: 'checkmark.circle' },
                  label: t(
                    privateDetail.saveList === 'cooked_already'
                      ? 'library.markWantToCook'
                      : 'library.markCooked',
                  ),
                  onPress: () => {
                    updateRecipe.mutate({
                      id: privateDetail._id,
                      patch: {
                        saveList:
                          privateDetail.saveList === 'cooked_already'
                            ? 'want_to_cook'
                            : 'cooked_already',
                      },
                    });
                    setActionsOpen(false);
                  },
                },
                {
                  icon: { android: 'share', ios: 'square.and.arrow.up' },
                  label: t('recipe.share'),
                  onPress: () => {
                    void Share.share({
                      title: privateDetail.title,
                      message: privateDetail.sourceUrl ?? privateDetail.documentMarkdown,
                    });
                    setActionsOpen(false);
                  },
                },
                ...(privateDetail.sourceUrl
                  ? [
                      {
                        icon: { android: 'open_in_new' as const, ios: 'safari' as const },
                        label: t('recipe.openOriginal'),
                        onPress: () => {
                          void Linking.openURL(privateDetail.sourceUrl ?? '');
                          setActionsOpen(false);
                        },
                      },
                    ]
                  : []),
                {
                  icon: { android: 'delete', ios: 'trash' },
                  label: t('library.delete'),
                  onPress: confirmDelete,
                  tone: 'danger',
                },
              ]
            : []
        }
        closeLabel={t('common.close')}
        onClose={() => setActionsOpen(false)}
        title={privateDetail?.title ?? ''}
        visible={actionsOpen}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
        presentationStyle="pageSheet"
        visible={editOpen}
      >
        <SafeAreaView style={styles.editor}>
          <View style={styles.editorHeader}>
            <Pressable onPress={() => setEditOpen(false)}>
              <Text style={styles.editorCancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Text style={styles.editorTitle}>{t('recipe.editDetails')}</Text>
            <Pressable disabled={!editTitle.trim() || updateRecipe.isPending} onPress={saveEditor}>
              <Text style={styles.editorSave}>{t('recipe.saveChanges')}</Text>
            </Pressable>
          </View>
          <Text style={styles.fieldLabel}>{t('recipe.titleField')}</Text>
          <TextInput onChangeText={setEditTitle} style={styles.fieldInput} value={editTitle} />
          <Text style={styles.fieldLabel}>{t('recipe.collectionsField')}</Text>
          <TextInput
            onChangeText={setEditCollections}
            placeholder={t('recipe.collectionsPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            style={styles.fieldInput}
            value={editCollections}
          />
          <Text style={styles.fieldHint}>{t('recipe.collectionsHint')}</Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export function RecipeDetailScreen({
  recipeId,
  onBack,
  source = 'private',
}: {
  recipeId: string;
  onBack(): void;
  source?: 'private' | 'public';
}) {
  return <RecipeDetailView onClose={onBack} recipeId={recipeId} source={source} standalone />;
}

export function RecipeDetailModal({
  recipeId,
  onClose,
  source = 'private',
}: {
  recipeId: string | null;
  onClose(): void;
  source?: 'private' | 'public';
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(recipeId)}
    >
      <RecipeDetailView onClose={onClose} recipeId={recipeId} source={source} />
    </Modal>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  statusScrim: {
    backgroundColor: 'rgba(9,8,6,0.88)',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  statusScrimCollapsed: {
    backgroundColor: palette.canvas,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    left: 0,
    paddingHorizontal: space.lg,
    position: 'absolute',
    right: 0,
    zIndex: 3,
  },
  toolbarSpacer: { flex: 1 },
  collapsedTitle: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
  },
  close: {
    alignItems: 'center',
    backgroundColor: 'rgba(18,14,16,0.76)',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: space.md,
    justifyContent: 'center',
    padding: space.xl,
  },
  content: { paddingBottom: 100 },
  image: { height: 310, width: '100%' },
  copy: {
    backgroundColor: palette.canvas,
    gap: space.lg,
    paddingBottom: space.xl,
    paddingHorizontal: space.xl,
  },
  copyWithImage: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -26,
    paddingTop: space.xl,
  },
  copyAlone: { paddingTop: 90 },
  title: {
    color: palette.ink,
    flexShrink: 1,
    fontFamily: fonts.recipeHeading,
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 41,
  },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space.xs },
  titleSourceLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    minHeight: 36,
    minWidth: 36,
  },
  description: {
    color: palette.inkMuted,
    fontFamily: fonts.recipeBody,
    fontSize: 16,
    lineHeight: 26,
  },
  enrichmentStatus: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  enrichmentWarning: { color: palette.saffron, fontFamily: fonts.sansMedium, fontSize: 11 },
  recipeMetaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  collectionBadge: {
    backgroundColor: palette.herbSoft,
    borderRadius: radius.pill,
    color: palette.herb,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editor: { backgroundColor: palette.canvas, flex: 1, gap: space.md, padding: space.lg },
  editorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  editorTitle: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 20 },
  editorCancel: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 14 },
  editorSave: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 14 },
  fieldLabel: {
    color: palette.ink,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    marginTop: space.md,
  },
  fieldInput: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: space.md,
  },
  fieldHint: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 },
  author: {
    color: palette.ember,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    marginTop: space.xs,
  },
  listItem: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 16, lineHeight: 26 },
  step: { alignItems: 'flex-start', flexDirection: 'row', gap: space.md },
  stepNumber: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    color: palette.white,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stepText: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.recipeBody,
    fontSize: 16,
    lineHeight: 26,
  },
  body: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 15, textAlign: 'center' },
  retry: { color: palette.ember, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
}));
