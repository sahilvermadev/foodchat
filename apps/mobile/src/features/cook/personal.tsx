import { Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { RecentConversation } from '@/features/today/queries';
import type { RecipeSummary } from '@/features/recipes/types';
import { AuthenticatedImage } from '@/features/recipes/authenticated-image';
import { useRecentRecipes } from '@/features/recipes/queries';
import { useRecentConversations } from '@/features/today/queries';
import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

function ContinueConversation({
  conversation,
  onPress,
}: {
  conversation: RecentConversation;
  onPress(): void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.continueCard, pressed && styles.pressed]}
    >
      <View style={styles.continueIcon}>
        <SymbolView
          name={{ android: 'chat_bubble', ios: 'bubble.left.fill' }}
          size={19}
          tintColor={colors.ember}
        />
      </View>
      <View style={styles.continueCopy}>
        <Text style={styles.eyebrow}>{t('cook.continueTitle')}</Text>
        <Text numberOfLines={1} style={styles.continueTitle}>
          {conversation.title || t('cook.untitledChat')}
        </Text>
      </View>
      <Text style={styles.continueAction}>{t('cook.continueChat')}</Text>
    </Pressable>
  );
}

function RecipeCard({ recipe, onPress }: { recipe: RecipeSummary; onPress(): void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityLabel={recipe.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recipeCard, pressed && styles.pressed]}
    >
      {recipe.illustrationUrl ? (
        <AuthenticatedImage
          contentFit="cover"
          path={recipe.illustrationUrl}
          style={styles.recipeImage}
        />
      ) : (
        <View style={styles.recipeImageFallback} />
      )}
      <Text numberOfLines={2} style={styles.recipeTitle}>
        {recipe.title}
      </Text>
      <Text numberOfLines={1} style={styles.recipeMeta}>
        {[
          recipe.totalMinutes ? `${recipe.totalMinutes} min` : '',
          recipe.categorization?.cuisine?.[0],
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

export function PersonalKitchen({
  onConversation,
  onRecipe,
}: {
  onConversation(conversationId: string): void;
  onRecipe(recipeId: string): void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const conversations = useRecentConversations(4);
  const recipes = useRecentRecipes(6);
  const recentConversations = conversations.data?.conversations ?? [];
  const recentRecipes = recipes.data?.recipes ?? [];

  if (!recentConversations.length && !recentRecipes.length) return null;

  return (
    <View style={styles.personal}>
      {recentConversations[0] ? (
        <ContinueConversation
          conversation={recentConversations[0]}
          onPress={() => onConversation(recentConversations[0].conversationId)}
        />
      ) : null}
      {recentRecipes.length ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t('today.libraryTitle')}</Text>
            <Text style={styles.sectionHint}>{t('cook.savedForYou')}</Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.recipeRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {recentRecipes.map((recipe) => (
              <RecipeCard key={recipe._id} onPress={() => onRecipe(recipe._id)} recipe={recipe} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemeStyles((palette) => ({
  personal: { gap: space.xl },
  continueCard: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
  },
  continueIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  continueCopy: { flex: 1, gap: 2 },
  eyebrow: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  continueTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  continueAction: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 11 },
  section: { gap: space.md },
  sectionHeading: { gap: 2 },
  sectionTitle: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 22 },
  sectionHint: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 11 },
  recipeRail: { gap: space.md, paddingRight: space.xl },
  recipeCard: { gap: 5, width: 154 },
  recipeImage: { borderRadius: radius.md, height: 96, width: '100%' },
  recipeImageFallback: { backgroundColor: palette.softClay, borderRadius: radius.md, height: 96 },
  recipeTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 14,
    lineHeight: 18,
  },
  recipeMeta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
}));
