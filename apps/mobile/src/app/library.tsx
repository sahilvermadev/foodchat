import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  AdvancedFilterKey,
  AdvancedFilters,
  FilterGroup,
  SaveListFilter,
} from '@/features/recipes/library';
import type { RecipeSummary } from '@/features/recipes/types';
import { OfflineStatus } from '@/components/offline-status';
import { Chip, RecipeTile, SearchField, type RecipePreview } from '@/components/ui';
import {
  buildFilterGroups,
  buildLibraryFilters,
  displayFilter,
  saveListFilters,
} from '@/features/recipes/library';
import { fonts, radius, space } from '@/constants/theme';
import { useConnectivity } from '@/features/connectivity/provider';
import { useRecipes } from '@/features/recipes/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { translate, useTranslation } from '@/lib/i18n';

const recipeMeta = (recipe: RecipeSummary) => {
  const rawCategory = recipe.categorization?.cuisine?.[0] ?? recipe.categorization?.diet?.[0];
  const category = rawCategory ? displayFilter(rawCategory) : undefined;
  if (recipe.servings && category) {
    return translate('library.servingsCategory', { count: recipe.servings, category });
  }
  if (recipe.servings) return translate('library.servings', { count: recipe.servings });
  return category ?? recipe.shortDescription ?? '';
};

const preview = (recipe: RecipeSummary): RecipePreview => ({
  id: recipe._id,
  title: recipe.title,
  meta: recipeMeta(recipe),
  imageUrl: recipe.illustrationUrl,
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
  const toggle = (key: AdvancedFilterKey, value: string) => {
    const next = { ...filters };
    if (next[key] === value) delete next[key];
    else next[key] = value;
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
            {
              maxHeight: height - insets.top - space.xl,
              paddingBottom: insets.bottom + space.md,
            },
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
          <ScrollView contentContainerStyle={styles.filterGroups}>
            {groups.length ? (
              groups.map((group) => (
                <View key={group.key} style={styles.filterGroup}>
                  <Text style={styles.filterGroupTitle}>{t(group.labelKey)}</Text>
                  <View style={styles.filterOptions}>
                    {group.values.map((value) => (
                      <Chip
                        key={`${group.key}:${value}`}
                        label={displayFilter(value)}
                        onPress={() => toggle(group.key, value)}
                        selected={filters[group.key] === value}
                      />
                    ))}
                  </View>
                </View>
              ))
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
              <Text style={styles.doneButtonText}>{t('library.done')}</Text>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const query = useRecipes(buildLibraryFilters(deferredSearch, saveList, filters));
  const filterOptionsQuery = useRecipes(
    deferredSearch.trim() ? { q: deferredSearch.trim() } : {},
    100,
  );
  const recipes = useMemo(
    () => query.data?.pages.flatMap((page) => page.recipes) ?? [],
    [query.data],
  );
  const filterOptionRecipes = useMemo(
    () => filterOptionsQuery.data?.pages[0]?.recipes ?? recipes,
    [filterOptionsQuery.data, recipes],
  );
  const filterGroups = useMemo(() => buildFilterGroups(filterOptionRecipes), [filterOptionRecipes]);
  const activeFilters = Object.entries(filters) as Array<[AdvancedFilterKey, string]>;
  const hasActiveQuery = saveList !== 'all' || activeFilters.length > 0 || Boolean(search.trim());

  const clearAll = () => {
    setSaveList('all');
    setFilters({});
    setSearch('');
  };

  let emptyContent = isOnline ? (
    <View style={styles.state}>
      <View style={styles.emptyMark}>
        <Text style={styles.emptyMarkText}>R</Text>
      </View>
      <Text style={styles.stateTitle}>{t('library.emptyTitle')}</Text>
      <Text style={styles.stateBody}>{t('library.emptySubtitle')}</Text>
    </View>
  ) : (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{t('offline.noCookbookTitle')}</Text>
      <Text style={styles.stateBody}>{t('offline.noCookbookBody')}</Text>
    </View>
  );
  if (hasActiveQuery) {
    emptyContent = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{t('library.noMatchesTitle')}</Text>
        <Text style={styles.stateBody}>{t('library.noMatchesSubtitle')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={clearAll}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        >
          <Text style={styles.clearButtonText}>{t('library.clearFilters')}</Text>
        </Pressable>
      </View>
    );
  }
  if (query.isLoading) {
    emptyContent = (
      <View style={styles.state}>
        <ActivityIndicator color={colors.ember} size="large" />
      </View>
    );
  } else if (query.isError) {
    emptyContent = (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>{t('library.error')}</Text>
        <Pressable accessibilityRole="button" onPress={() => void query.refetch()}>
          <Text style={styles.retry}>{t('library.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <OfflineStatus />
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
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
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
              onPress={() => {
                const next = { ...filters };
                delete next[key];
                setFilters(next);
              }}
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
          <Pressable onPress={() => setFilters({})} style={styles.clearActiveFilters}>
            <Text style={styles.clearActiveFiltersText}>{t('library.clearFilters')}</Text>
          </Pressable>
        </ScrollView>
      ) : null}
      <FlashList
        contentContainerStyle={styles.listContent}
        data={recipes}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={emptyContent}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.ember} />
              <Text style={styles.stateBody}>{t('library.loadingMore')}</Text>
            </View>
          ) : null
        }
        numColumns={2}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.45}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        renderItem={({ item, index }) => (
          <View style={[styles.tileWrap, index % 2 === 0 ? styles.tileLeft : styles.tileRight]}>
            <RecipeTile
              compact
              onPress={() => router.push({ pathname: '/recipe', params: { id: item._id } })}
              recipe={preview(item)}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
      <FilterSheet
        filters={filters}
        groups={filterGroups}
        onChange={setFilters}
        onClear={() => setFilters({})}
        onClose={() => setFiltersOpen(false)}
        visible={filtersOpen}
      />
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: {
    backgroundColor: palette.canvas,
    flex: 1,
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  searchWrap: { flex: 1 },
  filterButton: {
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
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 20,
  },
  filterCountText: {
    color: palette.white,
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '900',
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
  clearActiveFilters: { paddingHorizontal: space.sm, paddingVertical: 8 },
  clearActiveFiltersText: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 12 },
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
  retry: { color: palette.ember, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    padding: space.xl,
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
  filterGroups: { gap: space.xl, padding: space.lg, paddingBottom: space.xl },
  filterGroup: { gap: space.md },
  filterGroupTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
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
