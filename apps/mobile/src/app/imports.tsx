import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import type { SocialImport, SocialPlaylistSubscription } from 'librechat-data-provider';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ImportFilters, ImportSort, ImportView } from '@/features/imports/library';
import type { ActionSheetAction } from '@/components/actionsheet';
import type { ThemePalette } from '@/constants/theme';
import type { TranslationKey } from '@/lib/i18n';
import { ActionSheet } from '@/components/actionsheet';
import { OfflineStatus } from '@/components/offline-status';
import { fonts, radius, shadow, space } from '@/constants/theme';
import { useConnectivity } from '@/features/connectivity/provider';
import {
  activeImportFilterCount,
  creatorsFromImports,
  displayImportTitle,
  filterAndSortImports,
  importSource,
  initialImportFilters,
  isYouTubePlaylistUrl,
  recipeCategories,
  sortFilters,
  sourceFilters,
  viewFilters,
} from '@/features/imports/library';
import {
  useImportMutations,
  useSocialImports,
  useSocialPlaylists,
} from '@/features/imports/queries';
import { extractSharedUrl } from '@/features/imports/share';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { apiUrl } from '@/lib/api/client';
import { useTranslation } from '@/lib/i18n';

type ImportSection = { data: SocialImport[]; id: string; title?: TranslationKey };
type ImportDialog = { actions: ActionSheetAction[]; description: string; title: string };

const providerKeys = {
  all: 'imports.allPlatforms',
  instagram: 'imports.instagram',
  tiktok: 'imports.tiktok',
  unknown: 'imports.unknown',
  web: 'imports.web',
  youtube: 'imports.youtube',
} as const;

const statusKeys = {
  draft_ready: 'imports.statusReady',
  failed: 'imports.statusFailed',
  inspiration: 'imports.statusInspiration',
  needs_review: 'imports.statusNeedsReview',
  processing: 'imports.statusProcessing',
  saved: 'imports.statusSaved',
  saved_recipe: 'imports.statusSavedRecipe',
} as const;

const viewKeys = {
  all: 'imports.viewAll',
  needs_help: 'imports.viewNeedsHelp',
  processing: 'imports.viewProcessing',
  ready: 'imports.viewReady',
  saved: 'imports.viewSaved',
} as const;

const sortKeys = {
  creator_asc: 'imports.sortCreator',
  newest: 'imports.sortNewest',
  oldest: 'imports.sortOldest',
  title_asc: 'imports.sortTitleAsc',
  title_desc: 'imports.sortTitleDesc',
} as const;

const categoryKeys = {
  all: 'imports.categoryAll',
  bread: 'imports.categoryBread',
  breakfast: 'imports.categoryBreakfast',
  chicken: 'imports.categoryChicken',
  dessert: 'imports.categoryDessert',
  pasta: 'imports.categoryPasta',
  pizza: 'imports.categoryPizza',
  sandwich: 'imports.categorySandwich',
  sauce: 'imports.categorySauce',
  soup: 'imports.categorySoup',
} as const;

const playlistStatusKeys = {
  active: 'imports.playlist.active',
  failed: 'imports.playlist.failed',
  paused: 'imports.playlist.paused',
} as const;

const timelineKeys = {
  older: 'imports.timeline.older',
  today: 'imports.timeline.today',
  week: 'imports.timeline.week',
  yesterday: 'imports.timeline.yesterday',
} as const;

const thumbnailSource = (item: SocialImport) => {
  if (!item.thumbnailUrl) return undefined;
  if (item.thumbnailUrl.includes('ytimg.com') || item.thumbnailUrl.includes('youtube.com')) {
    return item.thumbnailUrl;
  }
  return `${apiUrl}/api/social-imports/image-proxy?url=${encodeURIComponent(item.thumbnailUrl)}`;
};

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const timelineId = (days: number): keyof typeof timelineKeys => {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'older';
};

const timelineSections = (imports: SocialImport[], sort: ImportSort): ImportSection[] => {
  if (sort !== 'newest' && sort !== 'oldest') return [{ data: imports, id: 'sorted' }];
  const today = startOfDay(new Date()).getTime();
  const groups = new Map<string, SocialImport[]>();
  imports.forEach((item) => {
    const days = Math.floor((today - startOfDay(new Date(item.createdAt)).getTime()) / 86_400_000);
    const id = timelineId(days);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  });
  const order =
    sort === 'newest'
      ? ['today', 'yesterday', 'week', 'older']
      : ['older', 'week', 'yesterday', 'today'];
  return order
    .map((id) => ({
      data: groups.get(id) ?? [],
      id,
      title: timelineKeys[id as keyof typeof timelineKeys],
    }))
    .filter((section) => section.data.length);
};

function Sheet({
  children,
  closeLabel,
  onClose,
  visible,
}: {
  children: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
  visible: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.modalDismiss} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetKeyboard}
        >
          <SafeAreaView
            edges={[]}
            style={[
              styles.sheet,
              {
                maxHeight: height - insets.top - space.xl,
                paddingBottom: insets.bottom + space.md,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.sheetClose}>
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
            {children}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function OptionGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string;
  onChange: (id: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.optionText, active && styles.optionTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ImportCard({
  busy,
  colors,
  item,
  onAction,
  onOpen,
}: {
  busy: boolean;
  colors: ThemePalette;
  item: SocialImport;
  onAction: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const source = importSource(item, t(providerKeys[item.provider]));
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.cardOpen}>
        <View style={styles.cardMedia}>
          {thumbnailSource(item) ? (
            <Image
              cachePolicy="memory-disk"
              contentFit="cover"
              source={thumbnailSource(item)}
              style={styles.cardImage}
              transition={180}
            />
          ) : (
            <View style={styles.cardFallback}>
              <SymbolView
                name={{ android: 'video_library', ios: 'play.rectangle' }}
                size={27}
                tintColor={colors.inkMuted}
              />
            </View>
          )}
          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.creator}>
            {source}
          </Text>
          <Text numberOfLines={2} style={styles.cardTitle}>
            {displayImportTitle(item)}
          </Text>
          <View style={styles.cardStatus}>
            {item.status === 'processing' ? (
              <ActivityIndicator color={colors.saffron} size="small" />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  item.status === 'failed' || item.status === 'needs_review'
                    ? styles.statusDotError
                    : styles.statusDotReady,
                ]}
              />
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.cardStatusText,
                (item.status === 'failed' || item.status === 'needs_review') &&
                  styles.cardStatusError,
              ]}
            >
              {busy ? t('imports.creating') : t(statusKeys[item.status])}
            </Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={t('imports.actions')}
        hitSlop={8}
        onPress={onAction}
        style={styles.moreButton}
      >
        <SymbolView
          name={{ android: 'more_horiz', ios: 'ellipsis' }}
          size={20}
          tintColor={colors.inkMuted}
        />
      </Pressable>
    </View>
  );
}

export default function ImportsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isOnline } = useConnectivity();
  const styles = useStyles();
  const shared = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  const { clearSharedPayloads, sharedPayloads } = useIncomingShare();
  const handledShare = useRef('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ImportFilters>(initialImportFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedImport, setSelectedImport] = useState<SocialImport>();
  const [busyImportId, setBusyImportId] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<ImportDialog>();
  const deferredSearch = useDeferredValue(search.trim());
  const importsQuery = useSocialImports({
    q: deferredSearch || undefined,
    provider: filters.source === 'all' ? undefined : filters.source,
    view: filters.view === 'all' ? undefined : filters.view,
  });
  const playlistsQuery = useSocialPlaylists();
  const mutations = useImportMutations();
  const createSharedImport = mutations.createImport.mutateAsync;
  const createSharedPlaylist = mutations.createPlaylist.mutateAsync;
  const imports = useMemo(
    () => importsQuery.data?.pages.flatMap((page) => page.imports) ?? [],
    [importsQuery.data],
  );
  const creators = useMemo(() => creatorsFromImports(imports), [imports]);
  const visibleImports = useMemo(() => filterAndSortImports(imports, filters), [filters, imports]);
  const sections = useMemo(
    () => timelineSections(visibleImports, filters.sort),
    [filters.sort, visibleImports],
  );
  const playlists = playlistsQuery.data?.subscriptions ?? [];
  const filterCount = activeImportFilterCount(filters);
  const totalSaved = playlists.reduce((total, playlist) => total + playlist.importCount, 0);

  const showError = useCallback(
    (error: unknown) => {
      setDialog({
        actions: [
          {
            icon: { android: 'close', ios: 'xmark' },
            label: t('imports.dismiss'),
            onPress: () => setDialog(undefined),
          },
        ],
        description: error instanceof Error ? error.message : t('imports.error'),
        title: t('imports.errorTitle'),
      });
    },
    [t],
  );

  const showNotice = (message: string) => {
    setNotice(message);
  };

  const submitUrl = async (value = sourceUrl) => {
    const url = value.trim();
    if (!url || mutations.createImport.isPending || mutations.createPlaylist.isPending) return;
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    try {
      if (isYouTubePlaylistUrl(url)) {
        const result = await mutations.createPlaylist.mutateAsync(url);
        showNotice(t('imports.playlistSynced', { count: result.importsCreated }));
      } else {
        await mutations.createImport.mutateAsync({ sourceUrl: url });
        showNotice(t('imports.importSaved'));
      }
      setSourceUrl('');
      setImportOpen(false);
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    const routeValues = [shared.url, shared.text, shared.title].map(
      (value) => (Array.isArray(value) ? value[0] : value)?.trim() ?? '',
    );
    const url = extractSharedUrl([
      ...sharedPayloads.map((payload) => payload.value),
      ...routeValues,
    ]);
    if (!url || handledShare.current === url) return;
    if (!isOnline) {
      setSourceUrl(url);
      setNotice(t('offline.importWhenOnline'));
      return;
    }
    handledShare.current = url;
    const saveSharedSource = async () => {
      try {
        if (isYouTubePlaylistUrl(url)) {
          const result = await createSharedPlaylist(url);
          clearSharedPayloads();
          setNotice(t('imports.playlistSynced', { count: result.importsCreated }));
          return;
        }
        await createSharedImport({ sourceUrl: url });
        clearSharedPayloads();
        setNotice(t('imports.importSaved'));
      } catch (error) {
        setSourceUrl(url);
        setImportOpen(true);
        showError(error);
      }
    };
    void saveSharedSource();
  }, [
    createSharedImport,
    createSharedPlaylist,
    clearSharedPayloads,
    isOnline,
    sharedPayloads,
    shared.text,
    shared.title,
    shared.url,
    showError,
    t,
  ]);

  const openImport = async (item: SocialImport, recreate = false) => {
    if (item.savedRecipeId && !recreate) {
      router.push({ pathname: '/recipe', params: { id: item.savedRecipeId } });
      return;
    }
    if (item.draftConversationId && !recreate) {
      if (!isOnline) {
        showNotice(t('offline.onlineAction'));
        return;
      }
      router.push({ pathname: '/cook', params: { conversationId: item.draftConversationId } });
      return;
    }
    if (item.status === 'processing') {
      showNotice(t('imports.stillProcessing'));
      return;
    }
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    setBusyImportId(item._id);
    setSelectedImport(undefined);
    try {
      const result = await mutations.createDraft.mutateAsync({
        id: item._id,
        payload: item.userSuppliedText ? { userSuppliedText: item.userSuppliedText } : undefined,
      });
      if (!result.draft.conversationId) throw new Error(t('imports.draftError'));
      router.push({ pathname: '/cook', params: { conversationId: result.draft.conversationId } });
    } catch (error) {
      showError(error);
    } finally {
      setBusyImportId('');
    }
  };

  const updateStatus = async (item: SocialImport) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.updateImport.isPending) return;
    try {
      await mutations.updateImport.mutateAsync({
        id: item._id,
        payload: { status: 'inspiration' },
      });
      setSelectedImport(undefined);
      showNotice(t('imports.keptInspiration'));
    } catch (error) {
      showError(error);
    }
  };

  const retry = async (item: SocialImport) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.retryImport.isPending) return;
    setBusyImportId(item._id);
    setSelectedImport(undefined);
    try {
      await mutations.retryImport.mutateAsync(item._id);
      showNotice(t('imports.retryStarted'));
    } catch (error) {
      showError(error);
    } finally {
      setBusyImportId('');
    }
  };

  const confirmDelete = (item: SocialImport) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.deleteImport.isPending) return;
    setSelectedImport(undefined);
    setDialog({
      actions: [
        {
          description: t('imports.deleteActionSubtitle'),
          icon: { android: 'delete', ios: 'trash' },
          label: t('imports.delete'),
          onPress: () => {
            setDialog(undefined);
            void mutations.deleteImport
              .mutateAsync(item._id)
              .then(() => showNotice(t('imports.deleted')))
              .catch(showError);
          },
          tone: 'danger',
        },
      ],
      description: t('imports.deleteConfirm', { title: displayImportTitle(item) }),
      title: t('imports.deleteTitle'),
    });
  };

  const syncPlaylist = async (playlist: SocialPlaylistSubscription) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.syncPlaylist.isPending) return;
    try {
      const result = await mutations.syncPlaylist.mutateAsync(playlist._id);
      showNotice(t('imports.playlistSynced', { count: result.importsCreated }));
    } catch (error) {
      showError(error);
    }
  };

  const togglePlaylist = async (playlist: SocialPlaylistSubscription) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.updatePlaylist.isPending) return;
    try {
      await mutations.updatePlaylist.mutateAsync({
        id: playlist._id,
        status: playlist.status === 'paused' ? 'active' : 'paused',
      });
    } catch (error) {
      showError(error);
    }
  };

  const removePlaylist = (playlist: SocialPlaylistSubscription) => {
    if (!isOnline) {
      showNotice(t('offline.onlineAction'));
      return;
    }
    if (mutations.deletePlaylist.isPending) return;
    setDialog({
      actions: [
        {
          description: t('imports.removePlaylistActionSubtitle'),
          icon: { android: 'delete', ios: 'trash' },
          label: t('imports.remove'),
          onPress: () => {
            setDialog(undefined);
            void mutations.deletePlaylist.mutateAsync(playlist._id).catch(showError);
          },
          tone: 'danger',
        },
      ],
      description: t('imports.removePlaylistBody'),
      title: t('imports.removePlaylistTitle'),
    });
  };

  const header = (
    <View style={styles.header}>
      <OfflineStatus />
      <View style={styles.summaryRow}>
        <View style={styles.summaryCopy}>
          <Text style={styles.count}>
            {t('imports.count', { count: importsQuery.data?.pages[0]?.total ?? 0 })}
          </Text>
          {playlists.length ? (
            <Pressable onPress={() => setPlaylistOpen(true)} style={styles.playlistInline}>
              <SymbolView
                name={{ android: 'playlist_play', ios: 'rectangle.stack' }}
                size={15}
                tintColor={colors.inkMuted}
              />
              <Text numberOfLines={1} style={styles.playlistInlineText}>
                {t('imports.playlistCompact', { count: playlists.length, saved: totalSaved })}
              </Text>
              <SymbolView
                name={{ android: 'chevron_right', ios: 'chevron.right' }}
                size={12}
                tintColor={colors.inkMuted}
              />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!isOnline}
          onPress={() => setImportOpen(true)}
          style={({ pressed }) => [
            styles.importButton,
            !isOnline && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView name={{ android: 'add', ios: 'plus' }} size={18} tintColor={colors.white} />
          <Text style={styles.importButtonText}>{t('imports.actionCompact')}</Text>
        </Pressable>
      </View>
      {notice ? (
        <View style={styles.notice}>
          <SymbolView
            name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }}
            size={18}
            tintColor={colors.herb}
          />
          <Text style={styles.noticeText}>{notice}</Text>
          <Pressable accessibilityLabel={t('imports.dismiss')} onPress={() => setNotice('')}>
            <SymbolView
              name={{ android: 'close', ios: 'xmark' }}
              size={16}
              tintColor={colors.inkMuted}
            />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <View style={styles.compactSearch}>
            <SymbolView
              name={{ android: 'search', ios: 'magnifyingglass' }}
              size={18}
              tintColor={colors.inkMuted}
            />
            <TextInput
              onChangeText={setSearch}
              placeholder={t('imports.search')}
              placeholderTextColor={colors.inkMuted}
              style={styles.compactSearchInput}
              value={search}
            />
            {search ? (
              <Pressable
                accessibilityLabel={t('imports.clearSearch')}
                hitSlop={8}
                onPress={() => setSearch('')}
              >
                <SymbolView
                  name={{ android: 'close', ios: 'xmark.circle.fill' }}
                  size={17}
                  tintColor={colors.inkMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ android: 'filter_list', ios: 'line.3.horizontal.decrease' }}
            size={20}
            tintColor={colors.ink}
          />
          {filterCount ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.platforms}
      >
        {sourceFilters
          .filter((source) => source !== 'unknown')
          .map((source) => (
            <Pressable
              key={source}
              onPress={() => setFilters((current) => ({ ...current, source }))}
              style={({ pressed }) => [
                styles.platform,
                filters.source === source && styles.platformSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.platformText,
                  filters.source === source && styles.platformTextSelected,
                ]}
              >
                {t(providerKeys[source])}
              </Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );

  let empty = (
    <View style={styles.empty}>
      <SymbolView
        name={{ android: 'move_to_inbox', ios: 'tray' }}
        size={34}
        tintColor={colors.inkMuted}
      />
      <Text style={styles.emptyTitle}>{t('imports.emptyTitle')}</Text>
      <Text style={styles.emptyBody}>{t('imports.emptyBody')}</Text>
      <Pressable onPress={() => setImportOpen(true)} style={styles.emptyButton}>
        <Text style={styles.emptyButtonText}>{t('imports.action')}</Text>
      </Pressable>
    </View>
  );
  if (!isOnline) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('offline.noImportsTitle')}</Text>
        <Text style={styles.emptyBody}>{t('offline.noImportsBody')}</Text>
      </View>
    );
  }
  if (importsQuery.isLoading) {
    empty = (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.ember} size="large" />
        <Text style={styles.emptyBody}>{t('imports.loading')}</Text>
      </View>
    );
  } else if (importsQuery.isError) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('imports.error')}</Text>
        <Pressable onPress={() => void importsQuery.refetch()}>
          <Text style={styles.retry}>{t('imports.retry')}</Text>
        </Pressable>
      </View>
    );
  } else if (imports.length && !visibleImports.length) {
    empty = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('imports.noMatches')}</Text>
        <Pressable
          onPress={() => {
            setFilters(initialImportFilters);
            setSearch('');
          }}
        >
          <Text style={styles.retry}>{t('imports.clearFilters')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <SectionList
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={empty}
        ListHeaderComponent={header}
        onEndReached={() => {
          if (importsQuery.hasNextPage && !importsQuery.isFetchingNextPage)
            void importsQuery.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        onRefresh={() => void Promise.all([importsQuery.refetch(), playlistsQuery.refetch()])}
        refreshing={importsQuery.isRefetching && !importsQuery.isFetchingNextPage}
        renderItem={({ item }) => (
          <ImportCard
            busy={busyImportId === item._id}
            colors={colors}
            item={item}
            onAction={() => setSelectedImport(item)}
            onOpen={() => void openImport(item)}
          />
        )}
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={styles.sectionTitle}>{t(section.title)}</Text> : null
        }
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />

      <Sheet
        closeLabel={t('imports.closeImport')}
        onClose={() => setImportOpen(false)}
        visible={importOpen}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>{t('imports.importTitle')}</Text>
          <Text style={styles.sheetSubtitle}>{t('imports.importSubtitle')}</Text>
          <View style={styles.urlField}>
            <SymbolView
              name={{ android: 'link', ios: 'link' }}
              size={19}
              tintColor={colors.inkMuted}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setSourceUrl}
              onSubmitEditing={() => void submitUrl()}
              placeholder={t('imports.urlPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              returnKeyType="go"
              style={styles.urlInput}
              value={sourceUrl}
            />
          </View>
          <Text style={styles.urlHint}>{t('imports.urlHint')}</Text>
          <Pressable
            disabled={
              !sourceUrl.trim() ||
              mutations.createImport.isPending ||
              mutations.createPlaylist.isPending
            }
            onPress={() => void submitUrl()}
            style={({ pressed }) => [
              styles.primaryButton,
              (!sourceUrl.trim() ||
                mutations.createImport.isPending ||
                mutations.createPlaylist.isPending) &&
                styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {mutations.createImport.isPending || mutations.createPlaylist.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : null}
            <Text style={styles.primaryButtonText}>{t('imports.saveSource')}</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet
        closeLabel={t('imports.closeFilters')}
        onClose={() => setFilterOpen(false)}
        visible={filterOpen}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('imports.filters')}</Text>
          {filterCount ? (
            <Pressable onPress={() => setFilters(initialImportFilters)}>
              <Text style={styles.clearText}>{t('imports.clearFilters')}</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={styles.filterGroups}
          showsVerticalScrollIndicator={false}
        >
          <OptionGroup
            label={t('imports.filterStatus')}
            onChange={(view) => setFilters((current) => ({ ...current, view: view as ImportView }))}
            options={viewFilters.map((view) => ({ id: view, label: t(viewKeys[view]) }))}
            selected={filters.view}
          />
          <OptionGroup
            label={t('imports.filterCategory')}
            onChange={(category) => setFilters((current) => ({ ...current, category }))}
            options={recipeCategories.map((category) => ({
              id: category.id,
              label: t(categoryKeys[category.id]),
            }))}
            selected={filters.category}
          />
          <OptionGroup
            label={t('imports.filterCreator')}
            onChange={(creator) => setFilters((current) => ({ ...current, creator }))}
            options={[
              { id: 'all', label: t('imports.creatorAll') },
              ...creators.map((creator) => ({ id: creator, label: creator })),
            ]}
            selected={filters.creator}
          />
          <OptionGroup
            label={t('imports.filterSort')}
            onChange={(sort) => setFilters((current) => ({ ...current, sort: sort as ImportSort }))}
            options={sortFilters.map((sort) => ({ id: sort, label: t(sortKeys[sort]) }))}
            selected={filters.sort}
          />
        </ScrollView>
        <Pressable onPress={() => setFilterOpen(false)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('imports.done')}</Text>
        </Pressable>
      </Sheet>

      <Sheet
        closeLabel={t('imports.closeActions')}
        onClose={() => setSelectedImport(undefined)}
        visible={Boolean(selectedImport)}
      >
        {selectedImport ? (
          <View style={styles.actionContent}>
            <Text numberOfLines={2} style={styles.actionTitle}>
              {displayImportTitle(selectedImport)}
            </Text>
            {selectedImport.status !== 'inspiration' ? (
              <Pressable onPress={() => void updateStatus(selectedImport)} style={styles.actionRow}>
                <SymbolView
                  name={{ android: 'move_to_inbox', ios: 'tray' }}
                  size={20}
                  tintColor={colors.ink}
                />
                <Text style={styles.actionText}>{t('imports.keepInspiration')}</Text>
              </Pressable>
            ) : null}
            {selectedImport.draftConversationId ? (
              <Pressable
                onPress={() => void openImport(selectedImport, true)}
                style={styles.actionRow}
              >
                <SymbolView
                  name={{ android: 'refresh', ios: 'arrow.clockwise' }}
                  size={20}
                  tintColor={colors.ink}
                />
                <Text style={styles.actionText}>{t('imports.recreate')}</Text>
              </Pressable>
            ) : null}
            {selectedImport.status === 'failed' ? (
              <Pressable onPress={() => void retry(selectedImport)} style={styles.actionRow}>
                <SymbolView
                  name={{ android: 'refresh', ios: 'arrow.clockwise' }}
                  size={20}
                  tintColor={colors.ink}
                />
                <Text style={styles.actionText}>{t('imports.retryProcessing')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void Linking.openURL(selectedImport.canonicalUrl).catch(showError)}
              style={styles.actionRow}
            >
              <SymbolView
                name={{ android: 'open_in_new', ios: 'arrow.up.right.square' }}
                size={20}
                tintColor={colors.ink}
              />
              <Text style={styles.actionText}>{t('imports.openSource')}</Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(selectedImport)} style={styles.actionRow}>
              <SymbolView
                name={{ android: 'delete', ios: 'trash' }}
                size={20}
                tintColor={colors.danger}
              />
              <Text style={styles.dangerText}>{t('imports.delete')}</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      <Sheet
        closeLabel={t('imports.closePlaylists')}
        onClose={() => setPlaylistOpen(false)}
        visible={playlistOpen}
      >
        <Text style={[styles.sheetTitle, styles.playlistTitle]}>{t('imports.playlists')}</Text>
        <ScrollView contentContainerStyle={styles.playlistList}>
          {playlists.map((playlist) => (
            <View key={playlist._id} style={styles.playlistCard}>
              <View style={styles.playlistCopy}>
                <Text numberOfLines={1} style={styles.playlistName}>
                  {playlist.title || playlist.playlistId}
                </Text>
                <Text style={styles.playlistMeta}>
                  {t(playlistStatusKeys[playlist.status], { count: playlist.importCount })}
                </Text>
                {playlist.lastErrorMessage ? (
                  <Text numberOfLines={2} style={styles.playlistError}>
                    {playlist.lastErrorMessage}
                  </Text>
                ) : null}
              </View>
              <View style={styles.playlistActions}>
                <Pressable
                  accessibilityLabel={t('imports.syncPlaylist')}
                  onPress={() => void syncPlaylist(playlist)}
                  style={styles.iconButton}
                >
                  <SymbolView
                    name={{ android: 'refresh', ios: 'arrow.clockwise' }}
                    size={19}
                    tintColor={colors.ink}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    playlist.status === 'paused'
                      ? t('imports.resumePlaylist')
                      : t('imports.pausePlaylist')
                  }
                  onPress={() => void togglePlaylist(playlist)}
                  style={styles.iconButton}
                >
                  <SymbolView
                    name={{
                      android: playlist.status === 'paused' ? 'play_arrow' : 'pause',
                      ios: playlist.status === 'paused' ? 'play.fill' : 'pause.fill',
                    }}
                    size={19}
                    tintColor={colors.ink}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel={t('imports.removePlaylist')}
                  onPress={() => removePlaylist(playlist)}
                  style={styles.iconButton}
                >
                  <SymbolView
                    name={{ android: 'delete', ios: 'trash' }}
                    size={19}
                    tintColor={colors.danger}
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>

      <ActionSheet
        actions={dialog?.actions ?? []}
        closeLabel={t('imports.cancel')}
        description={dialog?.description}
        onClose={() => setDialog(undefined)}
        title={dialog?.title ?? ''}
        visible={Boolean(dialog)}
      />
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  content: { paddingBottom: 110, paddingHorizontal: space.lg },
  header: { gap: space.md, paddingBottom: space.lg, paddingTop: space.md },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 2,
  },
  summaryCopy: { flex: 1, gap: 5, paddingRight: space.md },
  count: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  importButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  importButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 13 },
  playlistInline: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 4,
  },
  playlistInlineText: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: palette.herbSoft,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
  },
  noticeText: { color: palette.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  searchWrap: { flex: 1 },
  compactSearch: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    height: 46,
    paddingHorizontal: space.md,
  },
  compactSearchInput: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    height: 44,
    paddingVertical: 0,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    position: 'relative',
    width: 46,
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
  filterCountText: { color: palette.white, fontFamily: fonts.mono, fontSize: 9 },
  platforms: { gap: 7, paddingRight: space.lg },
  platform: {
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  platformSelected: { backgroundColor: palette.ember, borderColor: palette.ember },
  platformText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  platformTextSelected: { color: palette.white },
  sectionTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: space.sm,
    textTransform: 'uppercase',
  },
  sectionGap: { height: space.md },
  card: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  cardOpen: { flexDirection: 'row', height: 112 },
  cardMedia: {
    backgroundColor: palette.line,
    height: 112,
    overflow: 'hidden',
    position: 'relative',
    width: 124,
  },
  cardImage: { height: '100%', width: '100%' },
  cardFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  busyOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,8,6,0.66)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cardBody: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    paddingBottom: 10,
    paddingLeft: space.md,
    paddingRight: 38,
    paddingTop: 10,
  },
  creator: {
    color: palette.ember,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  moreButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 5,
    top: 6,
    width: 30,
  },
  cardTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 17,
    lineHeight: 22,
  },
  cardStatus: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2 },
  statusDot: { borderRadius: radius.pill, height: 6, width: 6 },
  statusDotReady: { backgroundColor: palette.herb },
  statusDotError: { backgroundColor: palette.danger },
  cardStatusText: { color: palette.inkMuted, flex: 1, fontFamily: fonts.sans, fontSize: 11 },
  cardStatusError: { color: palette.danger },
  empty: {
    alignItems: 'center',
    gap: space.md,
    justifyContent: 'center',
    minHeight: 360,
    paddingHorizontal: space.xl,
  },
  emptyTitle: {
    color: palette.ink,
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    textAlign: 'center',
  },
  emptyBody: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyButton: {
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
  },
  emptyButtonText: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  retry: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalDismiss: {
    backgroundColor: 'rgba(9,8,6,0.56)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: palette.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    ...shadow,
  },
  sheetKeyboard: { width: '100%' },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    position: 'absolute',
    top: 8,
    width: 38,
  },
  sheetClose: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: space.lg,
    top: space.lg,
    width: 36,
    zIndex: 2,
  },
  sheetContent: { gap: space.md, paddingBottom: space.lg, paddingTop: space.sm },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: space.md,
    paddingRight: 48,
  },
  sheetTitle: { color: palette.ink, fontFamily: fonts.sansBold, fontSize: 24 },
  sheetSubtitle: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 40,
  },
  urlField: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  urlInput: { color: palette.ink, flex: 1, fontFamily: fonts.sans, fontSize: 15, height: 52 },
  urlHint: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    marginBottom: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
  },
  primaryButtonText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  clearText: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 13 },
  filterGroups: { gap: space.xl, paddingBottom: space.lg },
  optionGroup: { gap: space.md },
  optionLabel: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionSelected: { backgroundColor: palette.ember, borderColor: palette.ember },
  optionText: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 13 },
  optionTextSelected: { color: palette.white },
  actionContent: { gap: 2, paddingBottom: space.md },
  actionTitle: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 20,
    lineHeight: 26,
    marginBottom: space.md,
    paddingRight: 48,
  },
  actionRow: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 52,
  },
  actionText: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 15 },
  dangerText: { color: palette.danger, fontFamily: fonts.sansMedium, fontSize: 15 },
  playlistTitle: { paddingBottom: space.md, paddingRight: 48 },
  playlistList: { gap: space.md, paddingBottom: space.lg },
  playlistCard: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.md,
    padding: space.md,
  },
  playlistCopy: { gap: 3 },
  playlistName: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 15 },
  playlistMeta: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  playlistError: { color: palette.danger, fontFamily: fonts.sans, fontSize: 12 },
  playlistActions: { flexDirection: 'row', gap: space.sm },
  iconButton: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 44,
  },
}));
