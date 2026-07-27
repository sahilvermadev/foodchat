import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { ShoppingContribution, ShoppingListItem } from 'librechat-data-provider';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { formatQuantity } from '@/features/recipes/workspace-format';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { shoppingRequiredAmount } from './format';

const contributionAmount = (contribution: ShoppingContribution) =>
  contribution.quantity == null
    ? ''
    : [formatQuantity(contribution.quantity), contribution.unit].filter(Boolean).join(' ');

export function ShoppingProvenance({
  item,
  onClose,
  onOpenRecipe,
  onRemove,
}: {
  item?: ShoppingListItem;
  onClose(): void;
  onOpenRecipe(recipeId: string): void;
  onRemove(contributionId: string): void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={Boolean(item)}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={t('shopping.closeSources')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('shopping.usedFor')}</Text>
              <Text style={styles.title}>{item?.displayName}</Text>
              {item ? (
                <Text style={styles.total}>
                  {t('shopping.totalRequired', {
                    amount: shoppingRequiredAmount(item) || t('shopping.amountUnspecified'),
                  })}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel={t('shopping.closeSources')}
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={19}
                tintColor={colors.ink}
              />
            </Pressable>
          </View>
          <View style={styles.sources}>
            {item?.contributions.map((contribution) => {
              const isRecipe = contribution.kind === 'recipe' && Boolean(contribution.recipeId);
              const navigable = isRecipe && !contribution.recipeId?.startsWith('draft:');
              return (
                <View key={contribution.id} style={styles.source}>
                  <Pressable
                    accessibilityRole={navigable ? 'button' : undefined}
                    disabled={!navigable}
                    onPress={() => contribution.recipeId && onOpenRecipe(contribution.recipeId)}
                    style={styles.sourceCopy}
                  >
                    <View style={styles.sourceTitleRow}>
                      <Text numberOfLines={2} style={styles.sourceTitle}>
                        {isRecipe ? contribution.recipeTitle : t('shopping.addedManually')}
                      </Text>
                      {navigable ? (
                        <SymbolView
                          name={{ android: 'arrow_outward', ios: 'arrow.up.right' }}
                          size={14}
                          tintColor={colors.ember}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.sourceMeta}>
                      {[
                        contributionAmount(contribution) || t('shopping.amountUnspecified'),
                        contribution.servings
                          ? t('recipe.servings', { count: contribution.servings })
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t('shopping.removeContribution', {
                      source: contribution.recipeTitle ?? t('shopping.addedManually'),
                    })}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => onRemove(contribution.id)}
                    style={styles.remove}
                  >
                    <SymbolView
                      name={{ android: 'close', ios: 'minus.circle' }}
                      size={18}
                      tintColor={colors.inkMuted}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const useStyles = createThemeStyles((palette) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    backgroundColor: 'rgba(8, 6, 7, 0.72)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: palette.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '82%',
    paddingBottom: space.lg,
    paddingTop: space.xl,
    ...shadow,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    position: 'absolute',
    top: 9,
    width: 38,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.md,
    paddingBottom: space.lg,
    paddingHorizontal: space.xl,
  },
  headerCopy: { flex: 1, gap: space.xs },
  eyebrow: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 26 },
  total: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 13 },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  sources: { borderTopColor: palette.line, borderTopWidth: 1, paddingHorizontal: space.xl },
  source: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 76,
  },
  sourceCopy: { flex: 1, gap: space.xs, paddingVertical: space.md },
  sourceTitleRow: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  sourceTitle: { color: palette.ink, flexShrink: 1, fontFamily: fonts.sansSemibold, fontSize: 15 },
  sourceMeta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  remove: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
}));
