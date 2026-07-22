import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeMetric } from './content';
import type { StructuredRecipe } from './types';
import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { shouldRenderRecipeMarkdown } from '@/features/cook/document';
import { recipeReaderContent } from './content';
import { AuthenticatedImage } from './authenticated-image';
import { RecipeMarkdown } from './markdown';
import { usePublicRecipe, useRecipe } from './queries';
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

function RecipeMetrics({ metrics }: { metrics: RecipeMetric[] }) {
  const { t } = useTranslation();
  const styles = useStyles();
  if (!metrics.length) return null;
  return (
    <View style={styles.metricsSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.heading}>{t('recipe.atAGlance')}</Text>
        <View style={styles.headingRule} />
      </View>
      <View style={styles.metricsGrid}>
        {metrics.map((metric) => (
          <View key={`${metric.label}:${metric.value}`} style={styles.metricCard}>
            <View style={styles.metricAccent} />
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

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
  const privateQuery = useRecipe(source === 'private' ? recipeId : null);
  const publicQuery = usePublicRecipe(source === 'public' ? recipeId : null);
  const query = source === 'public' ? publicQuery : privateQuery;
  const detail = query.data;
  const recipe = detail?.recipe;
  const canonicalMarkdown = detail?.documentMarkdown.trim();
  const renderCanonicalMarkdown = shouldRenderRecipeMarkdown({
    documentMarkdown: canonicalMarkdown,
    recipe,
  });
  const readerContent = canonicalMarkdown ? recipeReaderContent(canonicalMarkdown) : undefined;
  const voiceMarkdown = detail
    ? canonicalMarkdown || structuredRecipeMarkdown(detail.title, recipe)
    : '';
  const voiceConversationId =
    detail && 'sourceConversationId' in detail && typeof detail.sourceConversationId === 'string'
      ? detail.sourceConversationId
      : undefined;
  let recipeContent = <Text style={styles.body}>{t('recipe.noDetails')}</Text>;
  if (renderCanonicalMarkdown && canonicalMarkdown && readerContent) {
    recipeContent = (
      <>
        {readerContent.beforeMetrics ? (
          <RecipeMarkdown value={readerContent.beforeMetrics} />
        ) : null}
        <RecipeMetrics metrics={readerContent.metrics} />
        {readerContent.afterMetrics ? <RecipeMarkdown value={readerContent.afterMetrics} /> : null}
      </>
    );
  } else if (recipe) {
    recipeContent = (
      <>
        <RecipeMetrics
          metrics={[
            { label: t('recipe.yield'), value: t('recipe.servings', { count: recipe.servings }) },
            {
              label: t('recipe.prepTime'),
              value: t('recipe.minutes', { count: recipe.timing.prepMinutes }),
            },
            {
              label: t('recipe.cookTime'),
              value: t('recipe.minutes', { count: recipe.timing.cookMinutes }),
            },
          ]}
        />
        <Text style={styles.heading}>{t('recipe.ingredients')}</Text>
        {recipe.ingredients.map((ingredient) => (
          <Text key={ingredient.id} style={styles.listItem}>
            • {ingredient.originalText}
          </Text>
        ))}
        <Text style={styles.heading}>{t('recipe.steps')}</Text>
        {recipe.steps.map((step, index) => (
          <View key={step.id} style={styles.step}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <Text style={styles.stepText}>{step.text}</Text>
          </View>
        ))}
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
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.title}>{detail.title}</Text>
          {'author' in detail ? (
            <Text style={styles.author}>{t('explore.by', { name: detail.author.name })}</Text>
          ) : null}
          {detail.shortDescription ? (
            <Text style={styles.description}>{detail.shortDescription}</Text>
          ) : null}
          {recipeContent}
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View
        style={[styles.toolbar, standalone && styles.toolbarStart, { top: insets.top + space.sm }]}
        pointerEvents="box-none"
      >
        {detail ? (
          <RecipeVoiceMode
            conversationId={voiceConversationId}
            recipeMarkdown={voiceMarkdown}
            recipeTitle={detail.title}
            tone="overlay"
            voiceId={`recipe:${recipeId}`}
          />
        ) : null}
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
      </View>
      {content}
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
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    left: 0,
    paddingHorizontal: space.lg,
    position: 'absolute',
    right: 0,
    zIndex: 3,
  },
  toolbarStart: { justifyContent: 'space-between' },
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
  content: { paddingBottom: space.hero },
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
    fontFamily: fonts.recipeHeading,
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 41,
  },
  description: {
    color: palette.inkMuted,
    fontFamily: fonts.recipeBody,
    fontSize: 16,
    lineHeight: 26,
  },
  author: {
    color: palette.ember,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    marginTop: space.xs,
  },
  heading: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 24,
  },
  metricsSection: { gap: space.md, marginBottom: space.sm, marginTop: space.sm },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  headingRule: { backgroundColor: palette.line, flex: 1, height: 1 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metricCard: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    minHeight: 98,
    overflow: 'hidden',
    padding: space.md,
  },
  metricAccent: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    height: 3,
    marginBottom: 3,
    width: 22,
  },
  metricLabel: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: palette.ink,
    fontFamily: fonts.recipeBodyBold,
    fontSize: 14,
    lineHeight: 20,
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
