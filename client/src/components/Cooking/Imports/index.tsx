import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToastContext } from '@librechat/client';
import type {
  SocialImport,
  SocialPlaylistSubscription,
  SocialImportsQuery,
} from 'librechat-data-provider';
import type { FormEvent } from 'react';
import {
  useCreateSocialImportMutation,
  useCreateSocialImportDraftMutation,
  useCreateSocialPlaylistSubscriptionMutation,
  useDeleteSocialPlaylistSubscriptionMutation,
  useDeleteSocialImportMutation,
  useRetrySocialImportMutation,
  useSocialPlaylistSubscriptionsQuery,
  useSocialImportsInfiniteQuery,
  useSyncSocialPlaylistSubscriptionMutation,
  useUpdateSocialPlaylistSubscriptionMutation,
  useUpdateSocialImportMutation,
} from '~/data-provider';
import { useDebounce, useLocalize } from '~/hooks';
import {
  DeleteImportDialog,
  EmptyImports,
  FilterToolbar,
  ImportDialog,
  PlaylistSyncSummary,
  SocialImportCard,
  SocialImportSkeleton,
} from './components';
import type { SourceFilter, ViewFilter } from './helpers';
import {
  displayTitle,
  errorMessage,
  groupImportsByTimeline,
  isYouTubePlaylistUrl,
  sharedDetailsFromParams,
  sharedSourceFromParams,
  recipeCategories,
} from './helpers';

export default function SocialImports() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledSharedSourceRef = useRef('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCreator, setSelectedCreator] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [importToDelete, setImportToDelete] = useState<SocialImport | null>(null);
  const [detailsByImport, setDetailsByImport] = useState<Record<string, string>>({});
  const [draftingImportId, setDraftingImportId] = useState('');
  const [retryingImportId, setRetryingImportId] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 250);
  const params = useMemo<SocialImportsQuery>(
    () => ({
      q: debouncedQuery,
      view: viewFilter === 'all' ? undefined : viewFilter,
      provider: sourceFilter === 'all' ? undefined : sourceFilter,
      limit: 500, // Load all recipes on the first page to allow fast local filtering/sorting
    }),
    [debouncedQuery, sourceFilter, viewFilter],
  );
  const importsQuery = useSocialImportsInfiniteQuery(params, {
    refetchInterval: (data) =>
      data?.pages.some((page) =>
        page.imports.some((socialImport) => socialImport.status === 'processing'),
      )
        ? 3000
        : false,
  });
  const playlistsQuery = useSocialPlaylistSubscriptionsQuery();
  const createImport = useCreateSocialImportMutation();
  const createPlaylist = useCreateSocialPlaylistSubscriptionMutation();
  const createDraft = useCreateSocialImportDraftMutation();
  const updateImport = useUpdateSocialImportMutation();
  const retryImport = useRetrySocialImportMutation();
  const deleteImport = useDeleteSocialImportMutation();
  const updatePlaylist = useUpdateSocialPlaylistSubscriptionMutation();
  const syncPlaylist = useSyncSocialPlaylistSubscriptionMutation();
  const deletePlaylist = useDeleteSocialPlaylistSubscriptionMutation();
  const imports = importsQuery.data?.pages.flatMap((page) => page.imports) ?? [];
  const playlists = playlistsQuery.data?.subscriptions ?? [];
  
  const creators = useMemo(() => {
    const set = new Set<string>();
    imports.forEach((imp) => {
      if (imp.creatorName?.trim()) {
        set.add(imp.creatorName.trim());
      }
    });
    return Array.from(set).sort();
  }, [imports]);

  const filteredAndSortedImports = useMemo(() => {
    let result = [...imports];

    // 1. Filter by Creator
    if (selectedCreator !== 'all') {
      result = result.filter((imp) => imp.creatorName?.trim() === selectedCreator);
    }

    // 2. Filter by Category (based on title or text keywords)
    if (selectedCategory !== 'all') {
      const cat = recipeCategories.find((c) => c.id === selectedCategory);
      if (cat && cat.keywords) {
        result = result.filter((imp) => {
          const textToSearch = `${imp.title ?? ''} ${imp.extractedText ?? ''}`.toLowerCase();
          return cat.keywords.some((kw) => textToSearch.includes(kw));
        });
      }
    }

    // 3. Sort by criteria
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    } else if (sortBy === 'title_asc') {
      result.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    } else if (sortBy === 'title_desc') {
      result.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''));
    } else if (sortBy === 'creator_asc') {
      result.sort((a, b) => (a.creatorName ?? '').localeCompare(b.creatorName ?? ''));
    }

    return result;
  }, [imports, selectedCreator, selectedCategory, sortBy]);

  // Reset visible limit on filter changes so we don't render excessive off-screen items
  useEffect(() => {
    setVisibleLimit(24);
  }, [debouncedQuery, viewFilter, sourceFilter, selectedCategory, selectedCreator, sortBy]);

  const visibleImports = useMemo(() => {
    return filteredAndSortedImports.slice(0, visibleLimit);
  }, [filteredAndSortedImports, visibleLimit]);

  const isChronological = sortBy === 'newest' || sortBy === 'oldest';

  const timelineGroups = useMemo(() => {
    if (isChronological) {
      return groupImportsByTimeline(visibleImports);
    }
    return [
      {
        id: 'all_sorted',
        labelKey: 'com_social_imports_filter_all' as const,
        imports: visibleImports,
      },
    ];
  }, [visibleImports, isChronological]);

  const total = filteredAndSortedImports.length;

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (viewFilter !== 'all') count++;
    if (sourceFilter !== 'all') count++;
    if (selectedCategory !== 'all') count++;
    if (selectedCreator !== 'all') count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [viewFilter, sourceFilter, selectedCategory, selectedCreator, sortBy]);

  const activeFiltersCountInPanel = useMemo(() => {
    let count = 0;
    if (viewFilter !== 'all') count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [viewFilter, sortBy]);

  const clearAllFilters = () => {
    setViewFilter('all');
    setSourceFilter('all');
    setSelectedCategory('all');
    setSelectedCreator('all');
    setSortBy('newest');
  };

  const toggleFiltersPanel = () => {
    setFiltersExpanded((prev) => !prev);
  };

  const showPlaylistSyncResult = (result: {
    subscription: SocialPlaylistSubscription;
    importsCreated: number;
  }) => {
    if (result.subscription.status === 'failed') {
      showToast({
        status: 'error',
        message: result.subscription.lastErrorMessage || localize('com_social_imports_playlist_error'),
      });
      return;
    }
    showToast({
      status: 'success',
      message: localize('com_social_imports_playlist_synced', {
        count: result.importsCreated,
      }),
    });
  };

  useEffect(() => {
    setDetailsByImport((current) => {
      const importIds = new Set(imports.map((socialImport) => socialImport._id));
      let changed = false;
      const next = { ...current };

      imports.forEach((socialImport) => {
        if (next[socialImport._id] === undefined) {
          next[socialImport._id] = socialImport.userSuppliedText ?? '';
          changed = true;
        }
      });

      Object.keys(next).forEach((importId) => {
        if (!importIds.has(importId)) {
          delete next[importId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [imports]);

  useEffect(() => {
    const sharedSource = sharedSourceFromParams(searchParams);
    if (!sharedSource || handledSharedSourceRef.current === sharedSource) {
      return;
    }

    handledSharedSourceRef.current = sharedSource;
    const onSuccess = () => {
      setSearchParams({}, { replace: true });
      showToast({ status: 'success', message: localize('com_social_imports_shared_saved') });
    };
    const onError = (error: unknown) => {
      setSourceUrl(sharedSource);
      setImportDialogOpen(true);
      showToast({
        status: 'error',
        message: errorMessage(error) || localize('com_social_imports_save_error'),
      });
    };
    if (isYouTubePlaylistUrl(sharedSource)) {
      createPlaylist.mutate(
        { sourceUrl: sharedSource },
        {
          onSuccess: (result) => {
            setSearchParams({}, { replace: true });
            showPlaylistSyncResult(result);
          },
          onError,
        },
      );
      return;
    }
    createImport.mutate(
      {
        sourceUrl: sharedSource,
        title: searchParams.get('title') ?? undefined,
        userSuppliedText: sharedDetailsFromParams(searchParams),
      },
      { onSuccess, onError },
    );
  }, [createImport, createPlaylist, localize, searchParams, setSearchParams, showToast]);

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = sourceUrl.trim();
    if (!url || createImport.isLoading || createPlaylist.isLoading) {
      return;
    }
    if (isYouTubePlaylistUrl(url)) {
      createPlaylist.mutate(
        { sourceUrl: url },
        {
          onSuccess: (result) => {
            setSourceUrl('');
            setImportDialogOpen(false);
            showPlaylistSyncResult(result);
          },
          onError: (error) => {
            showToast({
              status: 'error',
              message: errorMessage(error) || localize('com_social_imports_playlist_error'),
            });
          },
        },
      );
      return;
    }
    createImport.mutate(
      { sourceUrl: url },
      {
        onSuccess: () => {
          setSourceUrl('');
          setImportDialogOpen(false);
          showToast({ status: 'success', message: localize('com_social_imports_saved') });
        },
        onError: () => {
          showToast({ status: 'error', message: localize('com_social_imports_save_error') });
        },
      },
    );
  };

  const togglePlaylist = (subscription: SocialPlaylistSubscription) => {
    updatePlaylist.mutate({
      subscriptionId: subscription._id,
      payload: { status: subscription.status === 'paused' ? 'active' : 'paused' },
    });
  };

  const syncPlaylistNow = (subscription: SocialPlaylistSubscription) => {
    syncPlaylist.mutate(subscription, {
      onSuccess: showPlaylistSyncResult,
      onError: (error) => {
        showToast({
          status: 'error',
          message: errorMessage(error) || localize('com_social_imports_playlist_error'),
        });
      },
    });
  };

  const removePlaylist = (subscription: SocialPlaylistSubscription) => {
    deletePlaylist.mutate(subscription, {
      onSuccess: () => {
        showToast({
          status: 'success',
          message: localize('com_social_imports_playlist_removed'),
        });
      },
    });
  };

  const markInspiration = (socialImport: SocialImport) => {
    updateImport.mutate(
      { importId: socialImport._id, payload: { status: 'inspiration' } },
      {
        onSuccess: () => {
          showToast({
            status: 'success',
            message: localize('com_social_imports_marked_inspiration'),
          });
        },
      },
    );
  };

  const updateDetails = (importId: string, value: string) => {
    setDetailsByImport((current) => ({ ...current, [importId]: value }));
  };

  const saveDetails = (socialImport: SocialImport) => {
    const userSuppliedText = detailsByImport[socialImport._id] ?? '';
    updateImport.mutate(
      { importId: socialImport._id, payload: { userSuppliedText } },
      {
        onSuccess: (updatedImport) => {
          setDetailsByImport((current) => ({
            ...current,
            [socialImport._id]: updatedImport.userSuppliedText ?? '',
          }));
          showToast({ status: 'success', message: localize('com_social_imports_details_saved') });
        },
        onError: () => {
          showToast({ status: 'error', message: localize('com_social_imports_details_error') });
        },
      },
    );
  };

  const draftWithRekky = (socialImport: SocialImport, detailsValue: string, detailsDirty: boolean) => {
    if (socialImport.draftConversationId && !detailsDirty) {
      navigate(`/cook/${socialImport.draftConversationId}`);
      return;
    }

    setDraftingImportId(socialImport._id);
    createDraft.mutate(
      {
        importId: socialImport._id,
        payload: { userSuppliedText: detailsValue },
      },
      {
        onSuccess: ({ draft }) => {
          setDraftingImportId('');
          if (draft.conversationId) {
            navigate(`/cook/${draft.conversationId}`);
          }
        },
        onError: () => {
          setDraftingImportId('');
          showToast({ status: 'error', message: localize('com_social_imports_draft_error') });
        },
      },
    );
  };

  const openRecipeImport = (
    socialImport: SocialImport,
    detailsValue: string,
    detailsDirty: boolean,
  ) => {
    if (socialImport.savedRecipeId) {
      navigate(`/recipes/${socialImport.savedRecipeId}`);
      return;
    }
    draftWithRekky(socialImport, detailsValue, detailsDirty);
  };

  const recreateRecipeImport = (socialImport: SocialImport, detailsValue: string) => {
    draftWithRekky(socialImport, detailsValue, true);
  };

  const confirmDelete = () => {
    if (!importToDelete || deleteImport.isLoading) {
      return;
    }
    deleteImport.mutate(importToDelete, {
      onSuccess: () => {
        setImportToDelete(null);
        showToast({ status: 'success', message: localize('com_social_imports_deleted') });
      },
      onError: () => {
        showToast({ status: 'error', message: localize('com_social_imports_delete_error') });
      },
    });
  };

  const retryProcessing = (socialImport: SocialImport) => {
    setRetryingImportId(socialImport._id);
    retryImport.mutate(socialImport, {
      onSuccess: () => {
        setRetryingImportId('');
        showToast({ status: 'success', message: localize('com_social_imports_retry_started') });
      },
      onError: () => {
        setRetryingImportId('');
        showToast({ status: 'error', message: localize('com_social_imports_retry_error') });
      },
    });
  };

  const hasMoreLocal = filteredAndSortedImports.length > visibleLimit;
  const hasMore = hasMoreLocal || importsQuery.hasNextPage;
  const loadMore = () => {
    if (hasMoreLocal) {
      setVisibleLimit((prev) => prev + 24);
    } else if (importsQuery.hasNextPage) {
      void importsQuery.fetchNextPage();
    }
  };

  return (
    <main className="rekky-ui flex h-full min-h-0 flex-col bg-surface-primary-alt text-text-primary">
      {/* Mobile Top Header Navbar */}
      <div className="flex h-12 shrink-0 items-center justify-center border-b border-border-light/10 bg-surface-primary-alt/85 backdrop-blur sticky top-0 z-30 md:hidden">
        <span className="text-[1.05rem] font-medium tracking-normal text-text-primary">{localize('com_social_imports_title')}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 lg:px-14">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:gap-5 pt-3 sm:pt-0">
        <header className="pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3 text-center sm:text-left">
            <div className="min-w-0 flex-1">
              <h1
                id="social-imports-title"
                className="text-[1.9rem] font-medium leading-none text-text-primary min-[380px]:text-[2rem] sm:text-[3rem] hidden sm:block"
              >
                {localize('com_social_imports_title')}
              </h1>
              <p className="mt-2 text-sm font-medium text-text-secondary hidden sm:block">
                {localize(
                  total === 1
                    ? 'com_social_imports_count_one'
                    : 'com_social_imports_count_other',
                  { count: total },
                )}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface-submit px-3 text-sm font-medium text-white transition-colors hover:bg-surface-submit-hover sm:h-10 sm:w-auto sm:gap-2 sm:px-4"
              onClick={() => setImportDialogOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {localize('com_social_imports_save_source')}
            </button>
          </div>

          {playlists.length > 0 ? (
            <PlaylistSyncSummary
              subscriptions={playlists}
              localize={localize}
              syncDisabled={syncPlaylist.isLoading}
              updateDisabled={updatePlaylist.isLoading}
              deleteDisabled={deletePlaylist.isLoading}
              onSync={syncPlaylistNow}
              onToggle={togglePlaylist}
              onRemove={removePlaylist}
            />
          ) : null}

          <FilterToolbar
            viewFilter={viewFilter}
            sourceFilter={sourceFilter}
            query={query}
            showSearch
            localize={localize}
            onViewFilterChange={setViewFilter}
            onSourceFilterChange={setSourceFilter}
            onQueryChange={setQuery}
            categoryFilter={selectedCategory}
            onCategoryFilterChange={setSelectedCategory}
            creatorFilter={selectedCreator}
            onCreatorFilterChange={setSelectedCreator}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            creators={creators}
            filtersExpanded={filtersExpanded}
            onToggleFilters={toggleFiltersPanel}
            onClearAll={clearAllFilters}
            activeFiltersCount={activeFiltersCount}
            activeFiltersCountInPanel={activeFiltersCountInPanel}
          />
        </header>

        {importsQuery.isLoading ? <SocialImportSkeleton /> : null}
        {!importsQuery.isLoading && imports.length === 0 ? (
          <EmptyImports localize={localize} />
        ) : null}
        {!importsQuery.isLoading && imports.length > 0 ? (
          <>
            {timelineGroups.map((group) => (
              <section key={group.id} className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
                  {localize(group.labelKey)}
                </h2>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.imports.map((socialImport) => {
                    const detailsValue =
                      detailsByImport[socialImport._id] ?? socialImport.userSuppliedText ?? '';
                    const detailsDirty = detailsValue !== (socialImport.userSuppliedText ?? '');
                    const isDrafting =
                      createDraft.isLoading && draftingImportId === socialImport._id;
                    const isRetrying =
                      retryImport.isLoading && retryingImportId === socialImport._id;
                    return (
                      <SocialImportCard
                        key={socialImport._id}
                        socialImport={socialImport}
                        detailsValue={detailsValue}
                        detailsDirty={detailsDirty}
                        isDrafting={isDrafting}
                        isRetrying={isRetrying}
                        draftDisabled={createDraft.isLoading}
                        updateDisabled={updateImport.isLoading}
                        retryDisabled={retryImport.isLoading}
                        localize={localize}
                        onOpen={openRecipeImport}
                        onRecreate={recreateRecipeImport}
                        onMarkInspiration={markInspiration}
                        onDetailsChange={updateDetails}
                        onSaveDetails={saveDetails}
                        onRetry={retryProcessing}
                        onDelete={setImportToDelete}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
            {hasMore ? (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  className="rounded-lg border border-border-light bg-surface-primary px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={importsQuery.isFetchingNextPage}
                  onClick={loadMore}
                >
                  {localize(
                    importsQuery.isFetchingNextPage
                      ? 'com_social_imports_loading_more'
                      : 'com_social_imports_load_more',
                  )}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      </div>

      <ImportDialog
        open={importDialogOpen}
        sourceUrl={sourceUrl}
        loading={createImport.isLoading || createPlaylist.isLoading}
        localize={localize}
        onOpenChange={setImportDialogOpen}
        onSourceUrlChange={setSourceUrl}
        onSubmit={submitImport}
      />

      <DeleteImportDialog
        socialImport={importToDelete}
        loading={deleteImport.isLoading}
        localize={localize}
        onOpenChange={(open) => {
          if (!open && !deleteImport.isLoading) {
            setImportToDelete(null);
          }
        }}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
