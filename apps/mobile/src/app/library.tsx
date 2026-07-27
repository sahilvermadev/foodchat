import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AdvancedFilterKey,
  AdvancedFilters,
  FilterGroup,
  SaveListFilter,
} from '@/features/recipes/library';
import type { RecipeSort, RecipeSummary } from '@/features/recipes/types';
import { OfflineStatus } from '@/components/offline-status';
import { ActionSheet } from '@/components/actionsheet';
import { Chip, RecipeTile, SearchField, type RecipePreview } from '@/components/ui';
import {
  buildFilterGroups,
  buildLibraryFilters,
  displayFilter,
  recipeSorts,
  saveListFilters,
} from '@/features/recipes/library';
import { fonts, radius, space } from '@/constants/theme';
import { useConnectivity } from '@/features/connectivity/provider';
import {
  useDeleteRecipe,
  useRecipeFacets,
  useRecipes,
  useUpdateRecipe,
} from '@/features/recipes/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { translate, useTranslation } from '@/lib/i18n';

const recipeMeta = (recipe: RecipeSummary) => {
  const rawCategory = recipe.categorization?.cuisine?.[0] ?? recipe.categorization?.diet?.[0];
  const category = rawCategory ? displayFilter(rawCategory) : undefined;
  const yieldText =
    recipe.yield && !/^\d+\s*(?:servings?|serves?)$/i.test(recipe.yield) ? recipe.yield : undefined;
  const amount =
    yieldText ?? (recipe.servings ? translate('library.servings', { count: recipe.servings }) : '');
  const timing = recipe.totalMinutes
    ? translate('library.minutes', { count: recipe.totalMinutes })
    : '';
  return [amount, timing, category].filter(Boolean).join(' · ') || recipe.shortDescription || '';
};

const preview = (recipe: RecipeSummary): RecipePreview => ({
  id: recipe._id,
  title: recipe.title,
  meta: recipeMeta(recipe),
  imageUrl: recipe.illustrationUrl,
  badges: [
    ...(recipe.pinned ? [translate('library.pinned')] : []),
    ...(recipe.favorite ? [translate('library.favorite')] : []),
    translate(recipe.saveList === 'cooked_already' ? 'library.cooked' : 'library.wantToCookBadge'),
  ],
  status: translate(
    recipe.saveList === 'cooked_already' ? 'library.cooked' : 'library.wantToCookBadge',
  ),
});

function FilterSheet({
  filters,
  groups,
  onChange,
  onClear,
  onClose,
  visible,
}: {
  filters: AdvancedFilters;
  groups: FilterGroup[];
  onChange: (filters: AdvancedFilters) => void;
  onClear: () => void;
  onClose: () => void;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<AdvancedFilterKey | null>(groups[0]?.key ?? null);
  const visibleGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        values: group.values.filter((option) =>
          displayFilter(option.value).toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.values.length);
  }, [groups, search]);
  const toggle = (key: AdvancedFilterKey, value: string) => {
    const selected = filters[key] ?? [];
    const values = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    const next = { ...filters };
    if (values.length) next[key] = values;
    else delete next[key];
    onChange(next);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.filterModal}>
        <Pressable
          accessibilityLabel={t('library.closeFilters')}
          onPress={onClose}
          style={styles.filterDismiss}
        />
        <SafeAreaView
          edges={[]}
          style={[
            styles.filterSheet,
            { maxHeight: height - insets.top - space.xl, paddingBottom: insets.bottom + space.md },
          ]}
        >
          <View style={styles.filterHandle} />
          <View style={styles.filterHeader}>
            <View style={styles.filterHeaderCopy}>
              <Text style={styles.filterTitle}>{t('library.filters')}</Text>
              <Text style={styles.filterHint}>{t('library.filterHint')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('library.closeFilters')}
              onPress={onClose}
              style={styles.filterClose}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
          </View>
          <View style={styles.filterSearch}>
            <SearchField
              clearLabel={t('library.clearFilterSearch')}
              onChangeText={setSearch}
              placeholder={t('library.searchFilters')}
              value={search}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.filterGroups}
            keyboardShouldPersistTaps="handled"
          >
            {visibleGroups.length ? (
              visibleGroups.map((group) => {
                const selectedCount = filters[group.key]?.length ?? 0;
                const isExpanded = Boolean(search) || expanded === group.key;
                return (
                  <View key={group.key} style={styles.filterGroup}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setExpanded(isExpanded && !search ? null : group.key)}
                      style={styles.filterGroupHeader}
                    >
                      <Text style={styles.filterGroupTitle}>{t(group.labelKey)}</Text>
                      <View style={styles.filterGroupMeta}>
                        {selectedCount ? (
                          <Text style={styles.selectedCount}>{selectedCount}</Text>
                        ) : null}
                        <SymbolView
                          name={{
                            android: isExpanded ? 'expand_less' : 'expand_more',
                            ios: isExpanded ? 'chevron.up' : 'chevron.down',
                          }}
                          size={16}
                          tintColor={colors.inkMuted}
                        />
                      </View>
                    </Pressable>
                    {isExpanded ? (
                      <View style={styles.filterOptions}>
                        {group.values.map((option) => (
                          <Chip
                            key={`${group.key}:${option.value}`}
                            label={`${displayFilter(option.value)}  ${option.count}`}
                            onPress={() => toggle(group.key, option.value)}
                            selected={filters[group.key]?.includes(option.value)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.noFilters}>{t('library.noFilters')}</Text>
            )}
          </ScrollView>
          <View style={styles.filterFooter}>
            <Pressable disabled={!Object.keys(filters).length} onPress={onClear}>
              <Text
                style={[
                  styles.clearFiltersText,
                  !Object.keys(filters).length && styles.clearFiltersDisabled,
                ]}
              >
                {t('library.clearFilters')}
              </Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.doneButton}>
              <Text style={styles.doneButtonText}>{t('library.showResults')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isOnline } = useConnectivity();
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [saveList, setSaveList] = useState<SaveListFilter>('all');
  const [filters, setFilters] = useState<AdvancedFilters>({});
  const [sort, setSort] = useState<RecipeSort>('recently_updated');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null);
  const deferredSearch = useDeferredValue(search);
  const query = useRecipes(
    buildLibraryFilters(deferredSearch, saveList, filters, sort, favoriteOnly, pinnedOnly),
  );
  const facetsQuery = useRecipeFacets({
    ...(deferredSearch.trim() ? { q: deferredSearch.trim() } : {}),
    ...(saveList !== 'all' ? { saveList } : {}),
  });
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const recipes = useMemo(
    () => query.data?.pages.flatMap((page) => page.recipes) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total ?? facetsQuery.data?.total ?? 0;
  const filterGroups = useMemo(() => buildFilterGroups(facetsQuery.data), [facetsQuery.data]);
  const activeFilters = Object.entries(filters).flatMap(([key, values]) =>
    (values ?? []).map((value) => [key as AdvancedFilterKey, value] as const),
  );
  const hasActiveQuery =
    saveList !== 'all' ||
    activeFilters.length > 0 ||
    favoriteOnly ||
    pinnedOnly ||
    Boolean(search.trim());
  const sortLabel =
    recipeSorts.find((item) => item.id === sort)?.key ?? 'library.sortRecentlyUpdated';

  const clearAll = () => {
    setSaveList('all');
    setFilters({});
    setFavoriteOnly(false);
    setPinnedOnly(false);
    setSearch('');
  };
  const patchSelected = (patch: {
    favorite?: boolean;
    pinned?: boolean;
    saveList?: RecipeSummary['saveList'];
  }) => {
    if (!selectedRecipe) return;
    updateRecipe.mutate({ id: selectedRecipe._id, patch });
    setSelectedRecipe(null);
  };
  const confirmDelete = () => {
    if (!selectedRecipe) return;
    const recipe = selectedRecipe;
    setSelectedRecipe(null);
    Alert.alert(t('library.deleteTitle'), t('library.deleteBody', { title: recipe.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('library.delete'),
        style: 'destructive',
        onPress: () => deleteRecipe.mutate(recipe._id),
      },
    ]);
  };

  let emptyContent = isOnline ? (
    <View style={styles.state}>
      <View style={styles.emptyMark}>
        <Text style={styles.emptyMarkText}>R</Text>
      </View>
      <Text style={styles.stateTitle}>{t('library.emptyTitle')}</Text>
      <Text style={styles.stateBody}>{t('library.emptySubtitle')}</Text>
      <Pressable onPress={() => router.push('/imports')} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{t('library.addRecipe')}</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{t('offline.noCookbookTitle')}</Text>
      <Text style={styles.stateBody}>{t('offline.noCookbookBody')}</Text>
    </View>
  );
  if (hasActiveQuery)
    emptyContent = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{t('library.noMatchesTitle')}</Text>
        <Text style={styles.stateBody}>{t('library.noMatchesSubtitle')}</Text>
        <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clearButton}>
          <Text style={styles.clearButtonText}>{t('library.clearFilters')}</Text>
        </Pressable>
      </View>
    );
  if (query.isLoading)
    emptyContent = (
      <View style={styles.state}>
        <ActivityIndicator color={colors.ember} size="large" />
      </View>
    );
  else if (query.isError)
    emptyContent = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{t('library.error')}</Text>
        <Pressable onPress={() => void query.refetch()}>
          <Text style={styles.retry}>{t('library.retry')}</Text>
        </Pressable>
      </View>
    );

  let footerContent = null;
  if (query.isFetchingNextPage) {
    footerContent = (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.ember} />
        <Text style={styles.stateBody}>{t('library.loadingMore')}</Text>
      </View>
    );
  } else if (recipes.length && !query.hasNextPage) {
    footerContent = <Text style={styles.endText}>{t('library.endOfCookbook')}</Text>;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <OfflineStatus />
      <View>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{t('library.title')}</Text>
            <Text style={styles.count}>{t('library.recipeCount', { count: total })}</Text>
          </View>
          <Pressable
            accessibilityLabel={t('settings.open')}
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
            style={styles.headerAction}
          >
            <SymbolView
              name={{ android: 'settings', ios: 'gearshape' }}
              size={19}
              tintColor={colors.ink}
            />
          </Pressable>
        </View>
      </View>
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <SearchField
            clearLabel={t('library.clearSearch')}
            onChangeText={setSearch}
            placeholder={t('library.search')}
            value={search}
          />
        </View>
        <Pressable
          accessibilityLabel={t('library.filters')}
          onPress={() => setFiltersOpen(true)}
          style={styles.squareButton}
        >
          <SymbolView
            name={{ android: 'filter_list', ios: 'line.3.horizontal.decrease' }}
            size={20}
            tintColor={colors.ink}
          />
          {activeFilters.length ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeFilters.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={styles.toolbar}>
        <Pressable onPress={() => setSortOpen(true)} style={styles.sortButton}>
          <SymbolView
            name={{ android: 'sort', ios: 'arrow.up.arrow.down' }}
            size={16}
            tintColor={colors.inkMuted}
          />
          <Text numberOfLines={1} style={styles.sortText}>
            {t(sortLabel)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t(view === 'grid' ? 'library.listView' : 'library.gridView')}
          onPress={() => setView(view === 'grid' ? 'list' : 'grid')}
          style={styles.viewButton}
        >
          <SymbolView
            name={{
              android: view === 'grid' ? 'view_list' : 'grid_view',
              ios: view === 'grid' ? 'list.bullet' : 'square.grid.2x2',
            }}
            size={18}
            tintColor={colors.ink}
          />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.filters}
        showsHorizontalScrollIndicator={false}
        style={styles.filterRail}
      >
        {saveListFilters.map((item) => (
          <Chip
            key={item.id}
            label={t(item.key)}
            onPress={() => setSaveList(item.id)}
            selected={saveList === item.id}
          />
        ))}
        <Chip
          label={t('library.favorites')}
          onPress={() => setFavoriteOnly(!favoriteOnly)}
          selected={favoriteOnly}
        />
        <Chip
          label={t('library.pinned')}
          onPress={() => setPinnedOnly(!pinnedOnly)}
          selected={pinnedOnly}
        />
        {filterGroups
          .find((group) => group.key === 'collection')
          ?.values.slice(0, 4)
          .map((collection) => {
            const selected = Boolean(filters.collection?.includes(collection.value));
            return (
              <Chip
                key={`collection:${collection.value}`}
                label={collection.value}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    collection: selected
                      ? (current.collection ?? []).filter((value) => value !== collection.value)
                      : [...(current.collection ?? []), collection.value],
                  }))
                }
                selected={selected}
              />
            );
          })}
      </ScrollView>
      {activeFilters.length ? (
        <ScrollView
          contentContainerStyle={styles.activeFilters}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeFilterRail}
        >
          {activeFilters.map(([key, value]) => (
            <Pressable
              key={`${key}:${value}`}
              onPress={() =>
                setFilters((current) => {
                  const next = { ...current };
                  const values = (next[key] ?? []).filter((item) => item !== value);
                  if (values.length) next[key] = values;
                  else delete next[key];
                  return next;
                })
              }
              style={styles.activeFilter}
            >
              <Text style={styles.activeFilterText}>{displayFilter(value)}</Text>
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={12}
                tintColor={colors.inkMuted}
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        key={view}
        contentContainerStyle={styles.listContent}
        data={recipes}
        extraData={view}
        initialNumToRender={10}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={emptyContent}
        ListFooterComponent={footerContent}
        maxToRenderPerBatch={10}
        numColumns={view === 'grid' ? 2 : 1}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.45}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.tileWrap,
              view === 'grid' && (index % 2 === 0 ? styles.tileLeft : styles.tileRight),
            ]}
          >
            <RecipeTile
              compact
              onLongPress={() => setSelectedRecipe(item)}
              onPress={() => router.push({ pathname: '/recipe', params: { id: item._id } })}
              recipe={preview(item)}
              variant={view}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        updateCellsBatchingPeriod={40}
        windowSize={7}
      />
      <FilterSheet
        filters={filters}
        groups={filterGroups}
        onChange={setFilters}
        onClear={() => setFilters({})}
        onClose={() => setFiltersOpen(false)}
        visible={filtersOpen}
      />
      <ActionSheet
        actions={recipeSorts.map((item) => ({
          icon: {
            android: item.id === sort ? 'check' : 'sort',
            ios: item.id === sort ? 'checkmark' : 'arrow.up.arrow.down',
          },
          label: t(item.key),
          onPress: () => {
            setSort(item.id);
            setSortOpen(false);
          },
          tone: item.id === sort ? 'accent' : 'neutral',
        }))}
        closeLabel={t('common.close')}
        onClose={() => setSortOpen(false)}
        title={t('library.sortBy')}
        visible={sortOpen}
      />
      <ActionSheet
        actions={
          selectedRecipe
            ? [
                {
                  icon: { android: 'star', ios: 'star' },
                  label: t(
                    selectedRecipe.favorite ? 'library.removeFavorite' : 'library.addFavorite',
                  ),
                  onPress: () => patchSelected({ favorite: !selectedRecipe.favorite }),
                  tone: 'accent',
                },
                {
                  icon: { android: 'push_pin', ios: 'pin' },
                  label: t(selectedRecipe.pinned ? 'library.unpin' : 'library.pin'),
                  onPress: () => patchSelected({ pinned: !selectedRecipe.pinned }),
                },
                {
                  icon: { android: 'done', ios: 'checkmark.circle' },
                  label: t(
                    selectedRecipe.saveList === 'cooked_already'
                      ? 'library.markWantToCook'
                      : 'library.markCooked',
                  ),
                  onPress: () =>
                    patchSelected({
                      saveList:
                        selectedRecipe.saveList === 'cooked_already'
                          ? 'want_to_cook'
                          : 'cooked_already',
                    }),
                },
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
        description={t('library.manageHint')}
        onClose={() => setSelectedRecipe(null)}
        title={selectedRecipe?.title ?? ''}
        visible={Boolean(selectedRecipe)}
      />
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: {
    backgroundColor: palette.canvas,
    flex: 1,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 31, lineHeight: 36 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerAction: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  count: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  searchWrap: { flex: 1 },
  squareButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  filterCount: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderColor: palette.canvas,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  filterCountText: { color: palette.white, fontFamily: fonts.mono, fontSize: 9, fontWeight: '900' },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  sortButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7, minHeight: 34 },
  sortText: { color: palette.inkMuted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12 },
  viewButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  filterRail: { flexGrow: 0, height: 42 },
  filters: { alignItems: 'center', gap: space.sm, paddingRight: space.lg },
  activeFilterRail: { flexGrow: 0, maxHeight: 38 },
  activeFilters: { alignItems: 'center', gap: space.sm, paddingRight: space.lg },
  activeFilter: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  activeFilterText: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingBottom: 110 },
  rowGap: { height: space.lg },
  tileWrap: { flex: 1 },
  tileLeft: { paddingRight: space.sm },
  tileRight: { paddingLeft: space.sm },
  state: {
    alignItems: 'center',
    gap: space.md,
    justifyContent: 'center',
    minHeight: 340,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
  },
  emptyMark: {
    alignItems: 'center',
    backgroundColor: palette.herbSoft,
    borderRadius: radius.xl,
    height: 76,
    justifyContent: 'center',
    marginBottom: space.sm,
    transform: [{ rotate: '-4deg' }],
    width: 76,
  },
  emptyMarkText: {
    color: palette.herb,
    fontFamily: fonts.serif,
    fontSize: 34,
    fontWeight: '800',
    transform: [{ rotate: '4deg' }],
  },
  stateTitle: {
    color: palette.ink,
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateBody: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
    textAlign: 'center',
  },
  clearButton: {
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: space.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  clearButtonText: { color: palette.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
  primaryButton: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: 12,
  },
  primaryButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 14 },
  retry: { color: palette.ember, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    padding: space.xl,
  },
  endText: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    padding: space.xl,
    textAlign: 'center',
  },
  filterModal: { flex: 1, justifyContent: 'flex-end' },
  filterDismiss: {
    backgroundColor: 'rgba(9,8,6,0.54)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  filterSheet: {
    backgroundColor: palette.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  filterHandle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    marginTop: space.sm,
    width: 38,
  },
  filterHeader: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  filterHeaderCopy: { flex: 1, gap: 2 },
  filterTitle: { color: palette.ink, fontFamily: fonts.serif, fontSize: 24, fontWeight: '800' },
  filterHint: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  filterClose: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  filterSearch: { paddingHorizontal: space.lg, paddingTop: space.md },
  filterGroups: { gap: space.sm, padding: space.lg, paddingBottom: space.xl },
  filterGroup: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    gap: space.md,
    paddingBottom: space.md,
  },
  filterGroupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  filterGroupTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterGroupMeta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  selectedCount: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 11 },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  noFilters: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 14 },
  filterFooter: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  clearFiltersText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 14 },
  clearFiltersDisabled: { opacity: 0.35 },
  doneButton: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: 12,
  },
  doneButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 14 },
}));
