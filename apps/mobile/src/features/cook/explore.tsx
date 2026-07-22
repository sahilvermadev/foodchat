import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PublicRecipeSummary } from '@/features/recipes/types';
import { fonts, radius, space } from '@/constants/theme';
import { AuthenticatedImage } from '@/features/recipes/authenticated-image';
import { usePublicRecipes } from '@/features/recipes/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { exploreFixtures, isExploreFixture } from './fixtures';
import { exploreCardWidth } from './layout';

function FixturePreview({
  onAsk,
  onClose,
  recipe,
}: {
  onAsk: (prompt: string) => void;
  onClose: () => void;
  recipe: PublicRecipeSummary | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={Boolean(recipe)}
    >
      <SafeAreaView edges={['bottom']} style={styles.previewScreen}>
        {recipe ? (
          <ScrollView contentContainerStyle={styles.previewContent}>
            <View style={[styles.previewImageWrap, { height: Math.min(330, height * 0.4) }]}>
              <AuthenticatedImage
                contentFit="cover"
                path={recipe.illustrationUrl}
                style={styles.previewImage}
              />
              <Pressable
                accessibilityLabel={t('explore.previewClose')}
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.previewClose, { top: insets.top + space.sm }]}
              >
                <SymbolView
                  name={{ android: 'close', ios: 'xmark' }}
                  size={19}
                  tintColor={colors.white}
                />
              </Pressable>
            </View>
            <View style={styles.previewCopy}>
              <View style={styles.previewAuthor}>
                <View style={styles.previewAvatar}>
                  <Text style={styles.previewAvatarText}>{recipe.author.name.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.previewAuthorName}>{recipe.author.name}</Text>
                  {recipe.author.username ? (
                    <Text style={styles.previewHandle}>@{recipe.author.username}</Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.previewTitle}>{recipe.title}</Text>
              {recipe.shortDescription ? (
                <Text style={styles.previewDescription}>{recipe.shortDescription}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onAsk(t('explore.askPrompt', { title: recipe.title }));
                }}
                style={({ pressed }) => [styles.previewAction, pressed && styles.pressed]}
              >
                <Text style={styles.previewActionText}>{t('explore.makeWithRekky')}</Text>
                <SymbolView
                  name={{ android: 'arrow_forward', ios: 'arrow.right' }}
                  size={18}
                  tintColor={colors.white}
                />
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

export function ExploreSurface({
  compact,
  onAsk,
}: {
  compact: boolean;
  onAsk: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useStyles();
  const query = usePublicRecipes(8);
  const [fixturePreview, setFixturePreview] = useState<PublicRecipeSummary | null>(null);
  const publicRecipes = query.data?.recipes ?? [];
  const recipes = publicRecipes.length ? publicRecipes : exploreFixtures;
  const cardWidth = exploreCardWidth(width, compact);

  const openRecipe = (recipe: PublicRecipeSummary) => {
    if (isExploreFixture(recipe._id)) {
      setFixturePreview(recipe);
      return;
    }
    router.push({ pathname: '/recipe', params: { id: recipe._id, source: 'public' } });
  };

  return (
    <View style={[styles.explore, compact && styles.exploreCompact]}>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, compact && styles.titleCompact]}>{t('explore.title')}</Text>
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
            {t('explore.subtitle')}
          </Text>
        </View>
      </View>

      {recipes.length ? (
        <ScrollView
          contentContainerStyle={styles.rail}
          decelerationRate="fast"
          horizontal
          snapToAlignment="start"
          snapToInterval={cardWidth + space.lg}
          showsHorizontalScrollIndicator={false}
        >
          {recipes.map((recipe) => {
            return (
              <Pressable
                accessibilityLabel={t('explore.openRecipe', { title: recipe.title })}
                accessibilityRole="button"
                key={recipe._id}
                onPress={() => openRecipe(recipe)}
                style={({ pressed }) => [
                  styles.card,
                  { width: cardWidth },
                  compact && styles.cardCompact,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.imageWrap, compact && styles.imageWrapCompact]}>
                  {recipe.illustrationUrl ? (
                    <AuthenticatedImage
                      contentFit="cover"
                      path={recipe.illustrationUrl}
                      style={styles.image}
                      transition={220}
                    />
                  ) : (
                    <View style={styles.fallback}>
                      <SymbolView
                        name={{ android: 'restaurant', ios: 'fork.knife' }}
                        size={25}
                        tintColor={colors.ember}
                      />
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={compact ? 1 : 2}
                  style={[styles.cardTitle, compact && styles.cardTitleCompact]}
                >
                  {recipe.title}
                </Text>
                <View style={[styles.authorRow, compact && styles.authorRowCompact]}>
                  <View style={[styles.avatar, compact && styles.avatarCompact]}>
                    <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>
                      {recipe.author.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.authorCopy}>
                    <Text numberOfLines={1} style={[styles.meta, compact && styles.metaCompact]}>
                      {t('explore.by', { name: recipe.author.name })}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <FixturePreview
        onAsk={onAsk}
        onClose={() => setFixturePreview(null)}
        recipe={fixturePreview}
      />
    </View>
  );
}

const useStyles = createThemeStyles((palette) => ({
  explore: { gap: space.md },
  exploreCompact: { gap: space.sm },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingCopy: { gap: 2 },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 24 },
  titleCompact: { fontSize: 21 },
  subtitle: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  subtitleCompact: { display: 'none' },
  rail: { gap: space.lg, paddingRight: space.xl },
  card: { width: 248 },
  cardCompact: { width: 224 },
  imageWrap: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 148,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  imageWrapCompact: { height: 96 },
  image: { height: '100%', width: '100%' },
  fallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  cardTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 18,
    lineHeight: 22,
  },
  cardTitleCompact: { fontSize: 16, lineHeight: 19 },
  authorRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  authorRowCompact: { marginTop: space.xs },
  avatar: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  avatarText: { color: palette.emberDark, fontFamily: fonts.sansBold, fontSize: 11 },
  avatarCompact: { height: 22, width: 22 },
  avatarTextCompact: { fontSize: 10 },
  authorCopy: { flex: 1 },
  meta: {
    color: palette.inkMuted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  metaCompact: { fontSize: 11 },
  previewScreen: { backgroundColor: palette.canvas, flex: 1 },
  previewContent: { flexGrow: 1 },
  previewImageWrap: { height: 330, position: 'relative' },
  previewImage: { height: '100%', width: '100%' },
  previewClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(18,14,16,0.82)',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: space.lg,
    width: 42,
  },
  previewCopy: { gap: space.lg, padding: space.xl },
  previewAuthor: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  previewAvatar: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  previewAvatarText: { color: palette.emberDark, fontFamily: fonts.sansBold, fontSize: 14 },
  previewAuthorName: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  previewHandle: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  previewTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 32,
    letterSpacing: -0.8,
    lineHeight: 39,
  },
  previewDescription: {
    color: palette.inkMuted,
    fontFamily: fonts.recipeBody,
    fontSize: 16,
    lineHeight: 26,
  },
  previewAction: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.sm,
    minHeight: 54,
    paddingHorizontal: space.lg,
  },
  previewActionText: { color: palette.white, fontFamily: fonts.sansBold, fontSize: 15 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
}));
