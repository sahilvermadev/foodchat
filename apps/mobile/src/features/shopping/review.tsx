import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { AddShoppingItemInput, StructuredRecipe } from 'librechat-data-provider';
import { recipeContributionId } from 'librechat-data-provider/mobile';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { formatQuantity } from '@/features/recipes/workspace-format';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { groupRecipeIngredients } from './review-model';
import { useShoppingList } from './queries';

export function AddIngredientsReview({
  initialServings,
  onAdd,
  onClose,
  recipe,
  recipeId,
  visible,
}: {
  initialServings: number;
  onAdd(items: AddShoppingItemInput[]): void;
  onClose(): void;
  recipe?: StructuredRecipe;
  recipeId: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const listQuery = useShoppingList();
  const [servings, setServings] = useState(initialServings);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pantry, setPantry] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || !recipe) return;
    setServings(initialServings);
    setSelected(
      new Set(recipe.ingredients.filter((item) => !item.optional).map((item) => item.id)),
    );
    setPantry(new Set());
  }, [initialServings, recipe, visible]);

  const scale = servings / Math.max(1, recipe?.servings || 1);
  const selectedCount = selected.size;
  const groups = useMemo(() => groupRecipeIngredients(recipe), [recipe]);
  const existingContributionIds = useMemo(
    () =>
      new Set(
        listQuery.data?.items.flatMap((item) => item.contributions.map((entry) => entry.id)) ?? [],
      ),
    [listQuery.data],
  );
  const allSelected =
    Boolean(recipe?.ingredients.length) && selectedCount === recipe?.ingredients.length;

  const toggleSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    ingredientId: string,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const add = () => {
    if (!recipe) return;
    const items = recipe.ingredients.flatMap<AddShoppingItemInput>((ingredient) => {
      if (!selected.has(ingredient.id)) return [];
      const quantity = ingredient.quantity ? ingredient.quantity * scale : undefined;
      return [
        {
          displayName: ingredient.item || ingredient.originalText,
          quantity,
          unit: ingredient.unit,
          optional: ingredient.optional,
          pantry: pantry.has(ingredient.id),
          recipeReference: {
            recipeId,
            recipeTitle: recipe.title,
            ingredientId: ingredient.id,
            quantity,
            unit: ingredient.unit,
            servings,
          },
        },
      ];
    });
    onAdd(items);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={t('shopping.closeReview')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('shopping.reviewTitle')}</Text>
              <Text style={styles.description}>{t('shopping.reviewDescription')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('shopping.closeReview')}
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
          <View style={styles.servings}>
            <Text style={styles.servingsLabel}>{t('recipe.servingsControl')}</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel={t('recipe.decreaseServings')}
                accessibilityRole="button"
                disabled={servings <= 1}
                onPress={() => setServings((value) => Math.max(1, value - 1))}
                style={styles.stepperButton}
              >
                <SymbolView
                  name={{ android: 'remove', ios: 'minus' }}
                  size={16}
                  tintColor={colors.ink}
                />
              </Pressable>
              <Text style={styles.servingsValue}>{servings}</Text>
              <Pressable
                accessibilityLabel={t('recipe.increaseServings')}
                accessibilityRole="button"
                onPress={() => setServings((value) => value + 1)}
                style={styles.stepperButton}
              >
                <SymbolView
                  name={{ android: 'add', ios: 'plus' }}
                  size={16}
                  tintColor={colors.ink}
                />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set(recipe?.ingredients.map((ingredient) => ingredient.id) ?? []),
                )
              }
            >
              <Text style={styles.selectAll}>
                {t(allSelected ? 'shopping.deselectAll' : 'shopping.selectAll')}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.ingredients}>
            {groups.map((group, groupIndex) => (
              <View key={`${group.title ?? 'ingredients'}-${groupIndex}`}>
                {group.title ? <Text style={styles.groupTitle}>{group.title}</Text> : null}
                {group.ingredients.map((ingredient) => {
                  const included = selected.has(ingredient.id);
                  const inPantry = pantry.has(ingredient.id);
                  const quantity = ingredient.quantity
                    ? [formatQuantity(ingredient.quantity * scale), ingredient.unit]
                        .filter(Boolean)
                        .join(' ')
                    : '';
                  const alreadyOnList = recipe
                    ? existingContributionIds.has(
                        recipeContributionId({
                          ingredientId: ingredient.id,
                          recipeId,
                          recipeTitle: recipe.title,
                        }),
                      )
                    : false;
                  return (
                    <View key={ingredient.id} style={styles.ingredient}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: included }}
                        onPress={() => toggleSet(setSelected, ingredient.id)}
                        style={[styles.check, included && styles.checkSelected]}
                      >
                        {included ? (
                          <SymbolView
                            name={{ android: 'check', ios: 'checkmark' }}
                            size={14}
                            tintColor={colors.white}
                          />
                        ) : null}
                      </Pressable>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: included }}
                        onPress={() => toggleSet(setSelected, ingredient.id)}
                        style={styles.ingredientCopy}
                      >
                        <View style={styles.nameRow}>
                          <Text style={styles.ingredientName}>{ingredient.item}</Text>
                          {quantity ? <Text style={styles.quantity}>{quantity}</Text> : null}
                        </View>
                        {ingredient.optional ? (
                          <Text style={styles.optional}>{t('shopping.optional')}</Text>
                        ) : null}
                        {alreadyOnList ? (
                          <Text style={styles.onList}>{t('shopping.alreadyOnList')}</Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t('shopping.togglePantry', { item: ingredient.item })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: inPantry }}
                        disabled={!included}
                        onPress={() => toggleSet(setPantry, ingredient.id)}
                        style={[
                          styles.pantry,
                          inPantry && styles.pantrySelected,
                          !included && styles.disabled,
                        ]}
                      >
                        <SymbolView
                          name={{ android: 'kitchen', ios: 'cabinet' }}
                          size={15}
                          tintColor={inPantry ? colors.herb : colors.inkMuted}
                        />
                        <Text style={[styles.pantryText, inPantry && styles.pantryTextSelected]}>
                          {t('shopping.pantryShort')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Text style={styles.selection}>
              {t('shopping.selectedCount', { count: selectedCount })}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!selectedCount}
              onPress={add}
              style={[styles.add, !selectedCount && styles.disabled]}
            >
              <Text style={styles.addText}>{t('shopping.addSelected')}</Text>
            </Pressable>
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
    maxHeight: '92%',
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
    paddingHorizontal: space.xl,
  },
  headerCopy: { flex: 1, gap: space.xs },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 25 },
  description: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  servings: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
    minHeight: 54,
    paddingHorizontal: space.xl,
  },
  servingsLabel: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 12 },
  selectAll: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 11 },
  stepper: { alignItems: 'center', flexDirection: 'row' },
  stepperButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 38 },
  servingsValue: {
    color: palette.ink,
    fontFamily: fonts.recipeBodyBold,
    fontSize: 16,
    minWidth: 28,
    textAlign: 'center',
  },
  ingredients: { paddingBottom: space.xl, paddingHorizontal: space.xl },
  groupTitle: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    paddingTop: space.lg,
    textTransform: 'uppercase',
  },
  ingredient: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 68,
  },
  check: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkSelected: { backgroundColor: palette.herb, borderColor: palette.herb },
  ingredientCopy: { flex: 1, gap: 3, paddingVertical: space.sm },
  nameRow: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  ingredientName: { color: palette.ink, flex: 1, fontFamily: fonts.recipeBody, fontSize: 14 },
  quantity: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 12 },
  optional: {
    color: palette.inkMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  onList: { color: palette.herb, fontFamily: fonts.sansSemibold, fontSize: 9 },
  pantry: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  pantrySelected: { backgroundColor: palette.herbSoft, borderColor: palette.herb },
  pantryText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 9 },
  pantryTextSelected: { color: palette.herb },
  disabled: { opacity: 0.35 },
  footer: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.lg,
    justifyContent: 'space-between',
    padding: space.lg,
  },
  selection: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 12 },
  add: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  addText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 14 },
}));
