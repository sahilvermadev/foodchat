import { useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import {
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  ImageOff,
  Inbox,
  ListVideo,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
  X,
  Video,
  SlidersHorizontal,
} from 'lucide-react';
import { Input, OGDialog, OGDialogTemplate } from '@librechat/client';
import type { FormEvent } from 'react';
import type { SocialImport, SocialPlaylistSubscription } from 'librechat-data-provider';
import type { Localize, SourceFilter, ViewFilter } from './helpers';
import {
  displayTitle,
  playlistStatusLabel,
  providerLabelKeys,
  sourceFilters,
  sourceLabelKeys,
  sourceLabel,
  statusLabelKeys,
  viewFilters,
  viewLabelKeys,
  recipeCategories,
} from './helpers';
import { cn } from '~/utils';
import {
  collectionCard,
  collectionCardBody,
  collectionCardMedia,
  collectionCardTitle,
  collectionGrid,
} from '../collection';

export function SocialImportSkeleton() {
  return (
    <div className={cn(collectionGrid, 'animate-pulse')}>
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="overflow-hidden">
          <div className="aspect-[3/2] w-full rounded-card bg-surface-hover" />
          <div className="px-1 py-3">
            <div className="h-3 w-20 rounded-full bg-surface-hover" />
            <div className="mt-3 h-5 w-4/5 rounded-md bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyImports({ localize }: { localize: Localize }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-border-light bg-surface-primary p-8 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full border border-border-light text-text-secondary">
          <Inbox className="size-5" aria-hidden="true" />
        </div>
        <p className="text-base font-medium text-text-primary">
          {localize('com_social_imports_empty_title')}
        </p>
        <p className="text-sm leading-6 text-text-secondary">
          {localize('com_social_imports_empty_body')}
        </p>
      </div>
    </div>
  );
}

type PlaylistSyncSummaryProps = {
  subscriptions: SocialPlaylistSubscription[];
  localize: Localize;
  syncDisabled: boolean;
  updateDisabled: boolean;
  deleteDisabled: boolean;
  onSync: (subscription: SocialPlaylistSubscription) => void;
  onToggle: (subscription: SocialPlaylistSubscription) => void;
  onRemove: (subscription: SocialPlaylistSubscription) => void;
};

function playlistSummaryStatus(
  subscriptions: SocialPlaylistSubscription[],
  localize: Localize,
): string {
  if (subscriptions.some((subscription) => subscription.status === 'failed')) {
    return localize('com_social_imports_playlist_summary_attention');
  }
  if (subscriptions.every((subscription) => subscription.status === 'paused')) {
    return localize('com_social_imports_playlist_summary_paused');
  }
  return localize('com_social_imports_playlist_summary_active');
}

export function PlaylistSyncSummary({
  subscriptions,
  localize,
  syncDisabled,
  updateDisabled,
  deleteDisabled,
  onSync,
  onToggle,
  onRemove,
}: PlaylistSyncSummaryProps) {
  const totalSaved = subscriptions.reduce((sum, subscription) => sum + subscription.importCount, 0);
  const summaryTitle = localize(
    subscriptions.length === 1
      ? 'com_social_imports_playlist_summary_one'
      : 'com_social_imports_playlist_summary_other',
    { count: subscriptions.length },
  );
  const summaryMeta = [
    localize('com_social_imports_playlist_summary_saved', { count: totalSaved }),
    playlistSummaryStatus(subscriptions, localize),
  ].join(' · ');

  return (
    <div className="mt-3 flex max-w-fit items-center gap-2.5 text-sm text-text-secondary">
      <div className="flex size-7 shrink-0 items-center justify-center text-surface-submit">
        <ListVideo className="size-4" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="truncate text-sm font-medium text-text-primary">{summaryTitle}</span>
        <span className="truncate text-xs text-text-secondary">{summaryMeta}</span>
      </div>
      <Menu.MenuProvider>
        <Menu.MenuButton
          aria-label={localize('com_social_imports_playlist_actions')}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Menu.MenuButton>
        <Menu.Menu
          portal
          className="popover-ui z-dropdown flex w-[min(380px,calc(100vw-2rem))] flex-col gap-1 rounded-card p-2 shadow-floating"
        >
          {subscriptions.map((subscription) => (
            <div key={subscription._id} className="border-border-light/70 rounded-md border p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {subscription.title || subscription.playlistId}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-secondary">
                  {subscription.status === 'failed' && subscription.lastErrorMessage
                    ? subscription.lastErrorMessage
                    : localize(playlistStatusLabel(subscription), {
                        count: subscription.importCount,
                      })}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  disabled={syncDisabled}
                  aria-label={localize('com_social_imports_playlist_sync')}
                  className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => onSync(subscription)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={updateDisabled}
                  aria-label={localize(
                    subscription.status === 'paused'
                      ? 'com_social_imports_playlist_resume'
                      : 'com_social_imports_playlist_pause',
                  )}
                  className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => onToggle(subscription)}
                >
                  {subscription.status === 'paused' ? (
                    <Play className="size-4" aria-hidden="true" />
                  ) : (
                    <Pause className="size-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={deleteDisabled}
                  aria-label={localize('com_social_imports_playlist_remove')}
                  className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => onRemove(subscription)}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </Menu.Menu>
      </Menu.MenuProvider>
    </div>
  );
}

type FilterToolbarProps = {
  viewFilter: ViewFilter;
  sourceFilter: SourceFilter;
  query: string;
  showSearch: boolean;
  localize: Localize;
  onViewFilterChange: (value: ViewFilter) => void;
  onSourceFilterChange: (value: SourceFilter) => void;
  onQueryChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  creatorFilter: string;
  onCreatorFilterChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  creators: string[];
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  onClearAll: () => void;
  activeFiltersCount: number;
};

type ToolbarSelectProps = {
  active?: boolean;
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
};

function ToolbarSelect({
  active,
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: ToolbarSelectProps) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className={cn(
          'h-10 w-full appearance-none rounded-control border bg-surface-primary px-3 pr-9 text-sm font-medium text-text-secondary shadow-surface transition-colors [color-scheme:light] hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary dark:[color-scheme:dark]',
          active
            ? 'border-surface-submit/50 bg-surface-submit/5 text-surface-submit'
            : 'border-border-light',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
        aria-hidden="true"
      />
    </label>
  );
}

export function FilterToolbar({
  viewFilter,
  sourceFilter,
  query,
  showSearch,
  localize,
  onViewFilterChange,
  onSourceFilterChange,
  onQueryChange,
  categoryFilter,
  onCategoryFilterChange,
  creatorFilter,
  onCreatorFilterChange,
  sortBy,
  onSortByChange,
  creators,
  filtersExpanded,
  onToggleFilters,
  onClearAll,
  activeFiltersCount,
}: FilterToolbarProps) {
  const categoryOptions = recipeCategories.map((category) => ({
    value: category.id,
    label: localize(category.labelKey),
  }));
  const creatorOptions = [
    { value: 'all', label: localize('com_social_imports_filter_all_creators') },
    ...creators.map((creator) => ({ value: creator, label: creator })),
  ];
  const statusOptions = viewFilters.map((filter) => ({
    value: filter,
    label: localize(viewLabelKeys[filter]),
  }));
  const sortOptions = [
    { value: 'newest', label: localize('com_social_imports_sort_newest') },
    { value: 'oldest', label: localize('com_social_imports_sort_oldest') },
    { value: 'title_asc', label: localize('com_social_imports_sort_title_asc') },
    { value: 'title_desc', label: localize('com_social_imports_sort_title_desc') },
    { value: 'creator_asc', label: localize('com_social_imports_sort_creator_asc') },
  ];
  const activeFilterChips = [
    ...(categoryFilter !== 'all'
      ? [
          {
            id: 'category',
            label: categoryOptions.find((option) => option.value === categoryFilter)?.label ?? '',
            remove: () => onCategoryFilterChange('all'),
          },
        ]
      : []),
    ...(creatorFilter !== 'all'
      ? [
          {
            id: 'creator',
            label: creatorFilter,
            remove: () => onCreatorFilterChange('all'),
          },
        ]
      : []),
    ...(viewFilter !== 'all'
      ? [
          {
            id: 'status',
            label: statusOptions.find((option) => option.value === viewFilter)?.label ?? '',
            remove: () => onViewFilterChange('all'),
          },
        ]
      : []),
    ...(sortBy !== 'newest'
      ? [
          {
            id: 'sort',
            label: sortOptions.find((option) => option.value === sortBy)?.label ?? '',
            remove: () => onSortByChange('newest'),
          },
        ]
      : []),
  ];

  return (
    <div className="bg-surface-primary-alt/95 sticky top-0 z-sticky -mx-4 mt-4 flex flex-col gap-3 border-b border-border-light px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-14 lg:px-14">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        {showSearch ? (
          <div className="relative min-w-0 flex-1 md:max-w-[480px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={localize('com_social_imports_search_placeholder')}
              aria-label={localize('com_social_imports_search_placeholder')}
              className="placeholder:text-text-secondary/70 h-11 rounded-control border-border-light bg-surface-primary pl-10 text-sm shadow-surface transition-colors hover:border-border-medium focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </div>
        ) : null}

        <div className="flex min-w-0 items-center gap-2 md:ml-auto">
          <button
            type="button"
            onClick={onToggleFilters}
            aria-expanded={filtersExpanded}
            className={cn(
              'relative ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm font-medium shadow-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary md:ml-0',
              filtersExpanded
                ? 'border-surface-submit/50 bg-surface-submit/10 text-surface-submit'
                : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span>{localize('com_social_imports_filters')}</span>
            {activeFiltersCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-surface-submit px-1.5 py-0.5 text-[10px] font-bold text-text-submit">
                {activeFiltersCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div
        className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto py-0.5"
        role="tablist"
        aria-label={localize('com_social_imports_provider_filters')}
      >
        {sourceFilters.map((val) => {
          const active = sourceFilter === val;
          return (
            <button
              key={val}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSourceFilterChange(val)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                active
                  ? 'bg-surface-submit/10 border-transparent text-surface-submit'
                  : 'border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              {val === 'all'
                ? localize('com_social_imports_filter_all_platforms')
                : localize(sourceLabelKeys[val])}
            </button>
          );
        })}
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterChips.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={filter.remove}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              <span>{filter.label}</span>
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="px-2 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            {localize('com_social_imports_filter_clear')}
          </button>
        </div>
      ) : null}

      {filtersExpanded ? (
        <div className="flex flex-col gap-4 rounded-card border border-border-light bg-surface-primary p-4 shadow-surface sm:p-5">
          <div className="border-border-light/60 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {localize('com_social_imports_filter_advanced')}
            </span>
            {activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-semibold text-text-destructive hover:underline"
              >
                {localize('com_social_imports_filter_clear')}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {localize('com_social_imports_filter_status')}
              </span>
              <ToolbarSelect
                value={viewFilter}
                onChange={(value) => onViewFilterChange(value as ViewFilter)}
                ariaLabel={localize('com_social_imports_filter_status')}
                options={statusOptions}
                active={viewFilter !== 'all'}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {localize('com_social_imports_filter_sort')}
              </span>
              <ToolbarSelect
                value={sortBy}
                onChange={onSortByChange}
                ariaLabel={localize('com_social_imports_filter_sort')}
                options={sortOptions}
                active={sortBy !== 'newest'}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {localize('com_social_imports_filter_category')}
              </span>
              <ToolbarSelect
                value={categoryFilter}
                onChange={onCategoryFilterChange}
                ariaLabel={localize('com_social_imports_filter_category')}
                options={categoryOptions}
                active={categoryFilter !== 'all'}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {localize('com_social_imports_filter_creator')}
              </span>
              <ToolbarSelect
                value={creatorFilter}
                onChange={onCreatorFilterChange}
                ariaLabel={localize('com_social_imports_filter_creator')}
                options={creatorOptions}
                active={creatorFilter !== 'all'}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type SocialImportCardProps = {
  socialImport: SocialImport;
  detailsValue: string;
  detailsDirty: boolean;
  isDrafting: boolean;
  isRetrying: boolean;
  draftDisabled: boolean;
  updateDisabled: boolean;
  retryDisabled: boolean;
  localize: Localize;
  onOpen: (socialImport: SocialImport, detailsValue: string, detailsDirty: boolean) => void;
  onRecreate: (socialImport: SocialImport, detailsValue: string) => void;
  onMarkInspiration: (socialImport: SocialImport) => void;
  onRetry: (socialImport: SocialImport) => void;
  onDelete: (socialImport: SocialImport) => void;
};

export function SocialImportCard({
  socialImport,
  detailsValue,
  detailsDirty,
  isDrafting,
  isRetrying,
  draftDisabled,
  updateDisabled,
  retryDisabled,
  localize,
  onOpen,
  onRecreate,
  onMarkInspiration,
  onRetry,
  onDelete,
}: SocialImportCardProps) {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const title = displayTitle(socialImport, localize('com_social_imports_untitled'));
  const statusLabel = localize(statusLabelKeys[socialImport.status]);
  const providerLabel = localize(providerLabelKeys[socialImport.provider]);
  const source = sourceLabel(socialImport, providerLabel);
  const showStatus = ['failed', 'needs_review', 'processing', 'saved_recipe'].includes(
    socialImport.status,
  );
  let actionLabel:
    | 'com_social_imports_draft_with_rekky'
    | 'com_social_imports_open_saved_recipe'
    | 'com_social_imports_open_draft' = 'com_social_imports_draft_with_rekky';
  if (socialImport.savedRecipeId) {
    actionLabel = 'com_social_imports_open_saved_recipe';
  } else if (socialImport.draftConversationId && !detailsDirty) {
    actionLabel = 'com_social_imports_open_draft';
  }

  const openImport = () => {
    if (draftDisabled && !socialImport.savedRecipeId) {
      return;
    }
    onOpen(socialImport, detailsValue, detailsDirty);
  };

  let statusIcon = <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  if (socialImport.status === 'processing') {
    statusIcon = <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />;
  } else if (socialImport.status === 'failed' || socialImport.status === 'needs_review') {
    statusIcon = <CircleAlert className="size-3.5" aria-hidden="true" />;
  } else if (socialImport.status === 'saved_recipe') {
    statusIcon = <BookmarkCheck className="size-3.5" aria-hidden="true" />;
  }
  let thumbnailContent = (
    <span className="flex size-full items-center justify-center text-text-secondary">
      <Video className="size-8" aria-hidden="true" />
    </span>
  );
  if (socialImport.thumbnailUrl) {
    const directThumbnail =
      socialImport.thumbnailUrl.includes('ytimg.com') ||
      socialImport.thumbnailUrl.includes('youtube.com');
    const thumbnailSource = directThumbnail
      ? socialImport.thumbnailUrl
      : `/api/social-imports/image-proxy?url=${encodeURIComponent(socialImport.thumbnailUrl)}`;
    thumbnailContent = (
      <img
        src={thumbnailSource}
        alt=""
        className={cn(
          'absolute inset-0 block size-full object-cover transition-opacity duration-300',
          imageState === 'loaded' ? 'opacity-100' : 'opacity-0',
        )}
        decoding="async"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setImageState('loaded')}
        onError={() => setImageState('failed')}
      />
    );
  }
  if (imageState === 'failed') {
    thumbnailContent = (
      <span className="flex size-full flex-col items-center justify-center gap-2 text-text-secondary">
        <ImageOff className="size-7" aria-hidden="true" />
        <span className="text-xs">{localize('com_social_imports_image_unavailable')}</span>
      </span>
    );
  }

  return (
    <article className={collectionCard}>
      <div
        className={cn(collectionCardMedia, 'bg-surface-primary-alt')}
        data-testid="social-import-media"
      >
        {imageState === 'loading' && socialImport.thumbnailUrl ? (
          <div className="absolute inset-0 animate-pulse bg-surface-hover" aria-hidden="true" />
        ) : null}
        <button
          type="button"
          aria-label={localize(actionLabel)}
          className="absolute inset-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary"
          onClick={openImport}
        >
          {thumbnailContent}
        </button>
        {showStatus ? (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-overlay px-2.5 py-1 text-[11px] font-medium text-status-ink shadow-surface backdrop-blur-md">
            {statusIcon}
            <span>
              {socialImport.status === 'saved_recipe'
                ? localize('com_social_imports_in_cookbook')
                : statusLabel}
            </span>
          </div>
        ) : null}
        <Menu.MenuProvider>
          <Menu.MenuButton
            aria-label={localize('com_social_imports_source_actions')}
            className="rekky-progressive-action absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-overlay text-status-ink shadow-surface backdrop-blur-md transition-colors hover:bg-surface-primary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Menu.MenuButton>
          <Menu.Menu
            portal
            className="popover-ui z-dropdown min-w-48 rounded-card p-1 shadow-floating"
          >
            {socialImport.status !== 'inspiration' ? (
              <Menu.MenuItem
                disabled={updateDisabled}
                onClick={() => onMarkInspiration(socialImport)}
                className="select-item text-sm"
              >
                <Inbox className="icon-md" aria-hidden="true" />
                {localize('com_social_imports_keep_inspiration')}
              </Menu.MenuItem>
            ) : null}
            {socialImport.draftConversationId ? (
              <Menu.MenuItem
                disabled={draftDisabled}
                onClick={() => onRecreate(socialImport, detailsValue)}
                className="select-item text-sm"
              >
                <RotateCcw className="icon-md" aria-hidden="true" />
                {localize('com_social_imports_recreate_recipe')}
              </Menu.MenuItem>
            ) : null}
            {socialImport.status === 'failed' ? (
              <Menu.MenuItem
                disabled={retryDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry(socialImport);
                }}
                className="select-item text-sm"
              >
                {isRetrying ? (
                  <LoaderCircle className="icon-md animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="icon-md" aria-hidden="true" />
                )}
                {localize('com_social_imports_retry')}
              </Menu.MenuItem>
            ) : null}
            <Menu.MenuItem
              render={
                <a
                  href={socialImport.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="select-item text-sm"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="icon-md" aria-hidden="true" />
                  {localize('com_social_imports_open_source')}
                </a>
              }
            />
            <Menu.MenuItem onClick={() => onDelete(socialImport)} className="select-item text-sm">
              <Trash2 className="icon-md" aria-hidden="true" />
              {localize('com_ui_delete')}
            </Menu.MenuItem>
          </Menu.Menu>
        </Menu.MenuProvider>
      </div>

      <div className={collectionCardBody}>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-secondary">{source}</p>
          <button
            type="button"
            aria-label={localize(actionLabel)}
            className="mt-2 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            onClick={openImport}
          >
            <h2 className={collectionCardTitle}>{title}</h2>
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {isDrafting || isRetrying ? (
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              <span>
                {isDrafting
                  ? localize('com_social_imports_creating_recipe')
                  : localize('com_social_imports_status_processing')}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type ImportDialogProps = {
  open: boolean;
  sourceUrl: string;
  loading: boolean;
  localize: Localize;
  onOpenChange: (open: boolean) => void;
  onSourceUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ImportDialog({
  open,
  sourceUrl,
  loading,
  localize,
  onOpenChange,
  onSourceUrlChange,
  onSubmit,
}: ImportDialogProps) {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_social_imports_import_title')}
        className="max-w-[520px]"
        main={
          <form id="social-import-form" onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="relative">
              <Video
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
                aria-hidden="true"
              />
              <Input
                value={sourceUrl}
                onChange={(event) => onSourceUrlChange(event.target.value)}
                placeholder={localize('com_social_imports_url_placeholder')}
                aria-label={localize('com_social_imports_url_label')}
                className="min-h-11 rounded-lg border-border-light pl-10 shadow-none"
              />
            </div>
          </form>
        }
        selection={
          <button
            type="submit"
            form="social-import-form"
            disabled={!sourceUrl.trim() || loading}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border-none bg-surface-submit px-4 py-2 text-sm text-text-submit transition-colors hover:bg-surface-submit-hover disabled:cursor-not-allowed disabled:opacity-70 max-sm:order-first max-sm:w-full"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {localize('com_social_imports_save_source')}
          </button>
        }
      />
    </OGDialog>
  );
}

type DeleteImportDialogProps = {
  socialImport: SocialImport | null;
  loading: boolean;
  localize: Localize;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteImportDialog({
  socialImport,
  loading,
  localize,
  onOpenChange,
  onConfirm,
}: DeleteImportDialogProps) {
  return (
    <OGDialog open={socialImport != null} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_social_imports_delete_title')}
        className="max-w-[450px]"
        main={
          <p className="text-left text-sm text-text-primary">
            {localize('com_social_imports_delete_confirm', {
              0: socialImport
                ? displayTitle(socialImport, localize('com_social_imports_untitled'))
                : '',
            })}
          </p>
        }
        selection={
          <button
            type="button"
            disabled={loading}
            className="flex h-10 items-center justify-center gap-2 rounded-control border-none bg-surface-destructive px-4 py-2 text-sm text-status-ink transition-colors hover:bg-surface-destructive-hover disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onConfirm}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {localize('com_ui_delete')}
          </button>
        }
      />
    </OGDialog>
  );
}
