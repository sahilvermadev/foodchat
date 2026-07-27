import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type {
  AddShoppingItemInput,
  ShoppingCategory,
  ShoppingListItem,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import {
  possibleShoppingDuplicates,
  recipeShoppingContributions,
} from 'librechat-data-provider/mobile';

import { ActionSheet } from '@/components/actionsheet';
import type { ActionSheetAction } from '@/components/actionsheet';
import { fonts, radius, space } from '@/constants/theme';
import { ShoppingItemEditor } from '@/features/shopping/editor';
import { ShoppingProvenance } from '@/features/shopping/provenance';
import {
  shoppingListText,
  shoppingPurchaseAmount,
  shoppingRequiredAmount,
} from '@/features/shopping/format';
import {
  useAddShoppingItems,
  useClearPurchasedShoppingItems,
  useDeleteShoppingItem,
  useMergeShoppingItems,
  useRemoveShoppingContribution,
  useShoppingList,
  useShoppingPendingCount,
  useUpdateShoppingItem,
} from '@/features/shopping/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { userErrorMessage } from '@/lib/errors';
import { useTranslation } from '@/lib/i18n';
import { useConnectivity } from '@/features/connectivity/provider';
import { useOfflineLibrary } from '@/features/offline/provider';

const categoryOrder: ShoppingCategory[] = [
  'produce',
  'bakery',
  'dairy',
  'meat_seafood',
  'pantry',
  'frozen',
  'beverages',
  'household',
  'other',
];

const restoreInputs = (item: ShoppingListItem): AddShoppingItemInput[] => {
  const base: AddShoppingItemInput = {
    id: item.id,
    displayName: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    purchaseQuantity: item.purchaseQuantity,
    category: item.category,
    categoryOverride: item.categoryOverride,
    note: item.note,
    optional: item.optional,
    pantry: item.pantry,
  };
  return item.contributions.map((contribution, index) => ({
    ...base,
    contributionId: contribution.id,
    quantity: contribution.quantity,
    unit: contribution.unit,
    recipeReference:
      contribution.kind === 'recipe' &&
      contribution.recipeId &&
      contribution.recipeTitle &&
      contribution.ingredientId
        ? {
            recipeId: contribution.recipeId,
            recipeTitle: contribution.recipeTitle,
            ingredientId: contribution.ingredientId,
            quantity: contribution.quantity,
            unit: contribution.unit,
            servings: contribution.servings,
          }
        : undefined,
    purchaseQuantity: index === 0 ? base.purchaseQuantity : undefined,
  }));
};

export default function ShoppingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isOnline } = useConnectivity();
  const { isSyncing } = useOfflineLibrary();
  const { colors } = useTheme();
  const styles = useStyles();
  const listQuery = useShoppingList();
  const addItems = useAddShoppingItems();
  const updateItem = useUpdateShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const clearPurchased = useClearPurchasedShoppingItems();
  const removeContribution = useRemoveShoppingContribution();
  const mergeItems = useMergeShoppingItems();
  const pendingQuery = useShoppingPendingCount();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem>();
  const [actionItem, setActionItem] = useState<ShoppingListItem>();
  const [listActionsOpen, setListActionsOpen] = useState(false);
  const [sourceItem, setSourceItem] = useState<ShoppingListItem>();
  const [pantryOpen, setPantryOpen] = useState(false);
  const [dismissedDuplicates, setDismissedDuplicates] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [undoItems, setUndoItems] = useState<ShoppingListItem[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const list = listQuery.data;

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const activeItems = list?.items.filter((item) => !item.purchased && !item.pantry) ?? [];
  const pantryItems = list?.items.filter((item) => !item.purchased && item.pantry) ?? [];
  const purchasedItems = list?.items.filter((item) => item.purchased) ?? [];
  const toBuyCount = activeItems.length;
  const grouped = useMemo(() => {
    const buckets = new Map<ShoppingCategory, ShoppingListItem[]>();
    for (const item of activeItems) {
      const bucket = buckets.get(item.category) ?? [];
      bucket.push(item);
      buckets.set(item.category, bucket);
    }
    return categoryOrder.flatMap((category) => {
      const items = buckets.get(category);
      return items?.length ? [{ category, items }] : [];
    });
  }, [activeItems]);
  const duplicateSuggestions = useMemo(
    () =>
      possibleShoppingDuplicates(list?.items.filter((item) => !item.purchased) ?? []).filter(
        ({ first, second }) => !dismissedDuplicates.has(`${first.id}:${second.id}`),
      ),
    [dismissedDuplicates, list?.items],
  );

  const showUndo = (items: ShoppingListItem[]) => {
    clearTimeout(undoTimer.current);
    setUndoItems(items);
    undoTimer.current = setTimeout(() => setUndoItems([]), 5000);
  };

  const saveEditor = (input: AddShoppingItemInput | UpdateShoppingItemRequest) => {
    const action = editingItem
      ? updateItem.mutateAsync({ itemId: editingItem.id, patch: input })
      : addItems.mutateAsync([input as AddShoppingItemInput]);
    setEditorOpen(false);
    setEditingItem(undefined);
    void action.catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const toggle = (item: ShoppingListItem) => {
    void Haptics.selectionAsync();
    void updateItem
      .mutateAsync({ itemId: item.id, patch: { purchased: !item.purchased } })
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const remove = (item: ShoppingListItem) => {
    setActionItem(undefined);
    showUndo([item]);
    void deleteItem
      .mutateAsync(item.id)
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const undo = () => {
    const inputs = undoItems.flatMap(restoreInputs);
    setUndoItems([]);
    clearTimeout(undoTimer.current);
    void addItems
      .mutateAsync(inputs)
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const share = () => {
    setListActionsOpen(false);
    if (!list || !toBuyCount) return;
    void Share.share({ message: shoppingListText(list), title: list.name }).catch((reason) =>
      setError(userErrorMessage(reason, t('shopping.shareError'))),
    );
  };

  const copy = () => {
    setListActionsOpen(false);
    if (!list || !toBuyCount) return;
    void Clipboard.setStringAsync(shoppingListText(list))
      .then(() => setNotice(t('shopping.copied')))
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.copyError'))));
  };

  const clear = () => {
    setListActionsOpen(false);
    if (!purchasedItems.length) return;
    showUndo(purchasedItems);
    void clearPurchased
      .mutateAsync()
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const removeSource = (contributionId: string) => {
    if (!sourceItem) return;
    const itemId = sourceItem.id;
    setSourceItem(undefined);
    void removeContribution
      .mutateAsync({ contributionId, itemId })
      .catch((reason) => setError(userErrorMessage(reason, t('shopping.updateError'))));
  };

  const syncLabel = !isOnline
    ? t('shopping.syncOffline')
    : isSyncing
      ? t('shopping.syncing')
      : pendingQuery.data
        ? t('shopping.syncPending', { count: pendingQuery.data })
        : t('shopping.synced');

  const itemRow = (item: ShoppingListItem) => {
    const purchaseAmount = shoppingPurchaseAmount(item);
    const requiredAmount = shoppingRequiredAmount(item);
    const sources = recipeShoppingContributions(item);
    const recipeSources = Array.from(
      new Map(sources.map((source) => [source.recipeId, source.recipeTitle])).entries(),
    );
    const firstSource = recipeSources[0];
    return (
      <View key={item.id} style={[styles.item, item.purchased && styles.itemPurchased]}>
        <Pressable
          accessibilityLabel={t(item.purchased ? 'shopping.markNeeded' : 'shopping.markPurchased', {
            item: item.displayName,
          })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.purchased }}
          hitSlop={4}
          onPress={() => toggle(item)}
          style={[styles.checkbox, item.purchased && styles.checkboxChecked]}
        >
          {item.purchased ? (
            <SymbolView
              name={{ android: 'check', ios: 'checkmark' }}
              size={15}
              tintColor={colors.white}
            />
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEditingItem(item);
            setEditorOpen(true);
          }}
          style={styles.itemCopy}
        >
          <View style={styles.itemLine}>
            <Text style={[styles.itemName, item.purchased && styles.purchasedText]}>
              {item.displayName}
            </Text>
            {purchaseAmount ? <Text style={styles.amount}>{purchaseAmount}</Text> : null}
          </View>
          {item.purchaseQuantity && requiredAmount ? (
            <Text style={styles.requiredAmount}>
              {t('shopping.recipesRequire', { amount: requiredAmount })}
            </Text>
          ) : null}
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          <View style={styles.metaRow}>
            {firstSource ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSourceItem(item)}
                style={styles.sourceLink}
              >
                <Text numberOfLines={1} style={styles.sourceText}>
                  {recipeSources.length === 1
                    ? t('shopping.forRecipe', { recipe: firstSource[1] })
                    : t('shopping.forRecipeMore', {
                        count: recipeSources.length - 1,
                        recipe: firstSource[1],
                      })}
                </Text>
                <SymbolView
                  name={{ android: 'chevron_right', ios: 'chevron.right' }}
                  size={13}
                  tintColor={colors.ember}
                />
              </Pressable>
            ) : (
              <Text style={styles.meta}>{t('shopping.addedManually')}</Text>
            )}
            {item.optional ? <Text style={styles.tag}>{t('shopping.optional')}</Text> : null}
            {item.pantry ? <Text style={styles.pantryTag}>{t('shopping.inPantry')}</Text> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel={t('shopping.itemActions', { item: item.displayName })}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setActionItem(item)}
          style={styles.more}
        >
          <SymbolView
            name={{ android: 'more_vert', ios: 'ellipsis' }}
            size={20}
            tintColor={colors.inkMuted}
          />
        </Pressable>
      </View>
    );
  };

  const shoppingListActions: ActionSheetAction[] = [
    {
      description: t('shopping.copyDescription'),
      icon: { android: 'content_copy', ios: 'doc.on.doc' },
      label: t('shopping.copy'),
      onPress: copy,
    },
    {
      description: t('shopping.shareDescription'),
      icon: { android: 'share', ios: 'square.and.arrow.up' },
      label: t('shopping.share'),
      onPress: share,
      tone: 'accent',
    },
    ...(purchasedItems.length
      ? [
          {
            description: t('shopping.clearPurchasedDescription'),
            icon: { android: 'delete_sweep' as const, ios: 'checkmark.circle' as const },
            label: t('shopping.clearPurchased'),
            onPress: clear,
            tone: 'danger' as const,
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('shopping.title')}</Text>
          <Text style={styles.subtitle}>{t('shopping.remaining', { count: toBuyCount })}</Text>
          <View style={styles.syncRow}>
            <View
              style={[
                styles.syncDot,
                !isOnline || pendingQuery.data ? styles.syncDotPending : styles.syncDotReady,
              ]}
            />
            <Text style={styles.syncText}>{syncLabel}</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel={t('shopping.addItem')}
          accessibilityRole="button"
          onPress={() => {
            setEditingItem(undefined);
            setEditorOpen(true);
          }}
          style={styles.addButton}
        >
          <SymbolView name={{ android: 'add', ios: 'plus' }} size={21} tintColor={colors.white} />
        </Pressable>
        <Pressable
          accessibilityLabel={t('shopping.listActions')}
          accessibilityRole="button"
          onPress={() => setListActionsOpen(true)}
          style={styles.headerButton}
        >
          <SymbolView
            name={{ android: 'more_vert', ios: 'ellipsis' }}
            size={21}
            tintColor={colors.ink}
          />
        </Pressable>
      </View>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setError(undefined)}
          style={styles.error}
        >
          <Text style={styles.errorText}>{error}</Text>
          <SymbolView
            name={{ android: 'close', ios: 'xmark' }}
            size={15}
            tintColor={colors.danger}
          />
        </Pressable>
      ) : null}
      {notice ? (
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityRole="button"
          onPress={() => setNotice(undefined)}
          style={styles.notice}
        >
          <SymbolView
            name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }}
            size={16}
            tintColor={colors.herb}
          />
          <Text style={styles.noticeText}>{notice}</Text>
        </Pressable>
      ) : null}
      {listQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ember} />
        </View>
      ) : !list?.items.length ? (
        <ScrollView
          contentContainerStyle={styles.empty}
          refreshControl={
            <RefreshControl
              onRefresh={() => void listQuery.refetch()}
              refreshing={listQuery.isRefetching}
              tintColor={colors.ember}
            />
          }
        >
          <View style={styles.emptyIcon}>
            <SymbolView
              name={{ android: 'shopping_basket', ios: 'basket' }}
              size={31}
              tintColor={colors.ember}
            />
          </View>
          <Text style={styles.emptyTitle}>{t('shopping.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('shopping.emptyDescription')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditorOpen(true)}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>{t('shopping.addFirstItem')}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              onRefresh={() => void listQuery.refetch()}
              refreshing={listQuery.isRefetching}
              tintColor={colors.ember}
            />
          }
        >
          {duplicateSuggestions.length ? (
            <View style={styles.suggestions}>
              <View style={styles.suggestionHeading}>
                <SymbolView
                  name={{ android: 'merge', ios: 'arrow.triangle.merge' }}
                  size={16}
                  tintColor={colors.saffron}
                />
                <View style={styles.suggestionHeadingCopy}>
                  <Text style={styles.suggestionTitle}>{t('shopping.possibleDuplicates')}</Text>
                  <Text style={styles.suggestionHelp}>{t('shopping.possibleDuplicatesHelp')}</Text>
                </View>
              </View>
              {duplicateSuggestions.map(({ first, second }) => {
                const pairId = `${first.id}:${second.id}`;
                return (
                  <View key={pairId} style={styles.suggestion}>
                    <Text style={styles.suggestionNames}>
                      {first.displayName} · {second.displayName}
                    </Text>
                    <View style={styles.suggestionActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setDismissedDuplicates((current) => new Set(current).add(pairId))
                        }
                      >
                        <Text style={styles.keepSeparate}>{t('shopping.keepSeparate')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void mergeItems
                            .mutateAsync({ sourceId: second.id, targetId: first.id })
                            .catch((reason) =>
                              setError(userErrorMessage(reason, t('shopping.updateError'))),
                            )
                        }
                        style={styles.mergeButton}
                      >
                        <Text style={styles.mergeText}>{t('shopping.merge')}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          {grouped.map((group) => (
            <View key={group.category} style={styles.group}>
              <Text style={styles.groupTitle}>{t(`shopping.category.${group.category}`)}</Text>
              <View>{group.items.map(itemRow)}</View>
            </View>
          ))}
          {pantryItems.length ? (
            <View style={styles.group}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPantryOpen((value) => !value)}
                style={styles.purchasedHeader}
              >
                <View style={styles.pantryHeaderCopy}>
                  <Text style={styles.groupTitle}>
                    {t('shopping.alreadyHave', { count: pantryItems.length })}
                  </Text>
                  <Text style={styles.pantryHelp}>{t('shopping.alreadyHaveHelp')}</Text>
                </View>
                <SymbolView
                  name={{
                    android: pantryOpen ? 'expand_less' : 'expand_more',
                    ios: pantryOpen ? 'chevron.up' : 'chevron.down',
                  }}
                  size={18}
                  tintColor={colors.inkMuted}
                />
              </Pressable>
              {pantryOpen ? <View>{pantryItems.map(itemRow)}</View> : null}
            </View>
          ) : null}
          {purchasedItems.length ? (
            <View style={styles.group}>
              <View style={styles.purchasedHeader}>
                <Text style={styles.groupTitle}>
                  {t('shopping.purchased', { count: purchasedItems.length })}
                </Text>
                <Pressable accessibilityRole="button" onPress={clear}>
                  <Text style={styles.clearText}>{t('shopping.clearPurchased')}</Text>
                </Pressable>
              </View>
              <View>{purchasedItems.map(itemRow)}</View>
            </View>
          ) : null}
        </ScrollView>
      )}
      {undoItems.length ? (
        <View accessibilityLiveRegion="polite" style={styles.undo}>
          <Text style={styles.undoText}>
            {undoItems.length === 1
              ? t('shopping.oneItemRemoved')
              : t('shopping.itemsRemoved', { count: undoItems.length })}
          </Text>
          <Pressable accessibilityRole="button" onPress={undo}>
            <Text style={styles.undoAction}>{t('shopping.undo')}</Text>
          </Pressable>
        </View>
      ) : null}
      <ShoppingItemEditor
        item={editingItem}
        onClose={() => {
          setEditorOpen(false);
          setEditingItem(undefined);
        }}
        onSave={saveEditor}
        visible={editorOpen}
      />
      <ShoppingProvenance
        item={sourceItem}
        onClose={() => setSourceItem(undefined)}
        onOpenRecipe={(recipeId) => {
          setSourceItem(undefined);
          router.push({ pathname: '/recipe', params: { id: recipeId } });
        }}
        onRemove={removeSource}
      />
      <ActionSheet
        actions={
          actionItem
            ? [
                {
                  icon: { android: 'edit', ios: 'pencil' },
                  label: t('shopping.editItem'),
                  onPress: () => {
                    setEditingItem(actionItem);
                    setActionItem(undefined);
                    setEditorOpen(true);
                  },
                },
                {
                  icon: { android: 'delete', ios: 'trash' },
                  label: t('shopping.removeItem'),
                  onPress: () => remove(actionItem),
                  tone: 'danger' as const,
                },
              ]
            : []
        }
        closeLabel={t('shopping.closeActions')}
        onClose={() => setActionItem(undefined)}
        title={actionItem?.displayName ?? ''}
        visible={Boolean(actionItem)}
      />
      <ActionSheet
        actions={shoppingListActions}
        closeLabel={t('shopping.closeActions')}
        onClose={() => setListActionsOpen(false)}
        title={t('shopping.listActions')}
        visible={listActionsOpen}
      />
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerCopy: { flex: 1 },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 30, lineHeight: 37 },
  subtitle: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  syncRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 3 },
  syncDot: { borderRadius: radius.pill, height: 6, width: 6 },
  syncDotReady: { backgroundColor: palette.herb },
  syncDotPending: { backgroundColor: palette.saffron },
  syncText: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10 },
  addButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerButton: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  error: {
    alignItems: 'center',
    backgroundColor: palette.dangerSoft,
    flexDirection: 'row',
    gap: space.sm,
    marginHorizontal: space.lg,
    padding: space.md,
  },
  errorText: { color: palette.danger, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12 },
  notice: {
    alignItems: 'center',
    backgroundColor: palette.herbSoft,
    flexDirection: 'row',
    gap: space.sm,
    marginHorizontal: space.lg,
    padding: space.md,
  },
  noticeText: { color: palette.herb, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { gap: space.xl, paddingBottom: space.hero, paddingHorizontal: space.lg },
  group: { gap: space.sm },
  suggestions: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.md,
    padding: space.md,
  },
  suggestionHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: space.sm },
  suggestionHeadingCopy: { flex: 1, gap: 2 },
  suggestionTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 13 },
  suggestionHelp: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  suggestion: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.md,
  },
  suggestionNames: { color: palette.ink, flex: 1, fontFamily: fonts.recipeBody, fontSize: 13 },
  suggestionActions: { alignItems: 'center', flexDirection: 'row', gap: space.md },
  keepSeparate: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 10 },
  mergeButton: {
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  mergeText: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 10 },
  groupTitle: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  purchasedHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  clearText: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 11 },
  item: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.sm,
  },
  itemPurchased: { opacity: 0.62 },
  checkbox: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 7,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  checkboxChecked: { backgroundColor: palette.herb, borderColor: palette.herb },
  itemCopy: { flex: 1, gap: 4, paddingVertical: space.sm },
  itemLine: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  itemName: { color: palette.ink, flex: 1, fontFamily: fonts.recipeBody, fontSize: 16 },
  purchasedText: { textDecorationLine: 'line-through' },
  amount: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 13 },
  requiredAmount: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10 },
  note: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  meta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10 },
  sourceLink: { alignItems: 'center', flexDirection: 'row', gap: 2, maxWidth: '78%' },
  sourceText: {
    color: palette.inkMuted,
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 10,
  },
  pantryHeaderCopy: { flex: 1, gap: 3 },
  pantryHelp: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 10 },
  tag: {
    color: palette.inkMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  pantryTag: {
    color: palette.herb,
    fontFamily: fonts.sansSemibold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  more: { alignItems: 'center', height: 44, justifyContent: 'center', width: 32 },
  empty: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    height: 72,
    justifyContent: 'center',
    marginBottom: space.lg,
    width: 72,
  },
  emptyTitle: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 25 },
  emptyText: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: space.sm,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    marginTop: space.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  emptyButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 14 },
  undo: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: radius.md,
    bottom: space.md,
    flexDirection: 'row',
    gap: space.xl,
    justifyContent: 'space-between',
    left: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    position: 'absolute',
    right: space.lg,
  },
  undoText: { color: palette.canvas, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  undoAction: { color: palette.ember, fontFamily: fonts.sansBold, fontSize: 13 },
}));
