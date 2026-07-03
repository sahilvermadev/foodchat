import * as Menu from '@ariakit/react/menu';
import {
  ExternalLink,
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
import type { FormEvent, KeyboardEvent } from 'react';
import type { SocialImport, SocialPlaylistSubscription } from 'librechat-data-provider';
import type { Localize, SourceFilter, ViewFilter } from './helpers';
import {
  dateLabel,
  displayTitle,
  needsHelpImport,
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

export function SocialImportSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="rounded-lg border border-border-light bg-surface-primary p-5">
          <div className="h-5 w-28 rounded-md bg-surface-hover" />
          <div className="mt-5 h-7 w-4/5 rounded-md bg-surface-hover" />
          <div className="mt-3 h-4 w-full rounded-md bg-surface-hover" />
          <div className="mt-2 h-4 w-2/3 rounded-md bg-surface-hover" />
          <div className="mt-6 flex gap-2">
            <div className="h-9 w-28 rounded-lg bg-surface-hover" />
            <div className="h-9 w-24 rounded-lg bg-surface-hover" />
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
  const totalSaved = subscriptions.reduce(
    (sum, subscription) => sum + subscription.importCount,
    0,
  );
  const summaryTitle = localize(
    subscriptions.length === 1
      ? 'com_social_imports_playlist_summary_one'
      : 'com_social_imports_playlist_summary_other',
    { count: subscriptions.length },
  );
  const summaryMeta = [
    localize('com_social_imports_playlist_summary_saved', { count: totalSaved }),
    playlistSummaryStatus(subscriptions, localize),
  ].join(' / ');

  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
      <div className="flex size-5 shrink-0 items-center justify-center text-text-tertiary">
        <ListVideo className="size-4" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="truncate font-semibold text-text-primary">
          {summaryTitle}
        </span>
        <span className="text-text-tertiary" aria-hidden="true">
          /
        </span>
        <span className="truncate text-xs text-text-secondary sm:text-sm">
          {summaryMeta}
        </span>
        <Menu.MenuProvider>
          <Menu.MenuButton
            aria-label={localize('com_social_imports_playlist_actions')}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Menu.MenuButton>
          <Menu.Menu
            portal
            className="popover-ui z-[125] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-1 rounded-lg p-2"
          >
            {subscriptions.map((subscription) => (
              <div
                key={subscription._id}
                className="rounded-md border border-border-light/70 p-2"
              >
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
  activeFiltersCountInPanel: number;
};

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
  activeFiltersCountInPanel,
}: FilterToolbarProps) {
  const hiddenCountMobile = [
    categoryFilter !== 'all',
    creatorFilter !== 'all',
    viewFilter !== 'all',
    sortBy !== 'newest',
  ].filter(Boolean).length;

  const hiddenCountDesktop = [
    viewFilter !== 'all',
    sortBy !== 'newest',
  ].filter(Boolean).length;

  return (
    <div className="sticky top-0 z-20 -mx-4 mt-2 flex flex-col gap-2 bg-surface-primary-alt/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-14 lg:px-14">
      <div className="flex items-center justify-between gap-2.5">
        {showSearch ? (
          <div className="relative flex-1 min-w-[150px] max-w-[420px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by title, creator, or URL..."
              aria-label="Search imports"
              className="min-h-9 rounded-lg border-border-light bg-surface-primary pl-9 text-xs sm:text-sm shadow-none placeholder:text-text-secondary/70"
            />
          </div>
        ) : null}
        
        <div className="flex items-center gap-2">
          {/* Category Select Pill (Visible Outside on Desktop only) */}
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
            aria-label="Category"
            className="rekky-select hidden md:inline-flex h-9 rounded-lg border border-border-light/80 bg-surface-primary pl-3 pr-8 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition focus:outline-none focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
          >
            {recipeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === 'all' ? 'All Categories' : c.label}
              </option>
            ))}
          </select>

          {/* Creator Select Pill (Visible Outside on Desktop only) */}
          <select
            value={creatorFilter}
            onChange={(e) => onCreatorFilterChange(e.target.value)}
            aria-label="Creator"
            className="rekky-select hidden md:inline-flex h-9 rounded-lg border border-border-light/80 bg-surface-primary pl-3 pr-8 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition focus:outline-none focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
          >
            <option value="all">All Creators</option>
            {creators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={onToggleFilters}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-lg border text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring-primary",
              "px-3 md:px-4",
              filtersExpanded
                ? "border-transparent bg-text-primary text-surface-primary-alt"
                : "border-border-light bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="hidden md:inline">More Filters</span>
            
            {/* Mobile Badge */}
            {hiddenCountMobile > 0 ? (
              <span className="inline-flex md:hidden size-4 items-center justify-center rounded-full text-[9px] font-bold text-white bg-surface-submit">
                {hiddenCountMobile}
              </span>
            ) : null}
            
            {/* Desktop Badge */}
            {hiddenCountDesktop > 0 ? (
              <span className="hidden md:inline-flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white bg-surface-submit">
                {hiddenCountDesktop}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Platform Chips Row (Horizontal Swipe on Mobile) */}
      <div 
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1.5 pt-1 no-scrollbar -mx-4 px-4 sm:-mx-8 sm:px-8 lg:-mx-14 lg:px-14" 
        role="tablist" 
        aria-label="Platform filter"
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
                "h-7.5 shrink-0 rounded-full border px-3 text-[11px] font-semibold transition-colors focus:outline-none",
                active
                  ? "border-surface-submit bg-surface-submit text-white"
                  : "border-border-light bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
            >
              {val === 'all' ? 'All Platforms' : localize(sourceLabelKeys[val])}
            </button>
          );
        })}
      </div>

      {filtersExpanded ? (
        <div className="mt-2 flex flex-col gap-4 rounded-xl border border-border-light bg-surface-primary p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light/60 pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Advanced Filters
            </span>
            {activeFiltersCount > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-semibold text-text-destructive hover:underline"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
          
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2">
            {/* Column 1: Status */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Status</span>
              <select
                value={viewFilter}
                onChange={(e) => onViewFilterChange(e.target.value as ViewFilter)}
                className="rekky-select h-8.5 rounded-lg border border-border-light bg-surface-primary-alt px-3 text-xs text-text-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                {viewFilters.map((val) => (
                  <option key={val} value={val}>
                    {localize(viewLabelKeys[val])}
                  </option>
                ))}
              </select>
            </div>

            {/* Column 2: Sort By */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Sort By</span>
              <select
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value)}
                className="rekky-select h-8.5 rounded-lg border border-border-light bg-surface-primary-alt px-3 text-xs text-text-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                <option value="newest">Newest Saved</option>
                <option value="oldest">Oldest Saved</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="title_desc">Title (Z-A)</option>
                <option value="creator_asc">Creator (A-Z)</option>
              </select>
            </div>

            {/* Column 3: Category (Visible ONLY on Mobile/Tablet) */}
            <div className="flex flex-col gap-1.5 md:hidden">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                className="rekky-select h-8.5 rounded-lg border border-border-light bg-surface-primary-alt px-3 text-xs text-text-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                {recipeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id === 'all' ? 'All Categories' : c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Column 4: Creator (Visible ONLY on Mobile/Tablet) */}
            <div className="flex flex-col gap-1.5 md:hidden">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Creator</span>
              <select
                value={creatorFilter}
                onChange={(e) => onCreatorFilterChange(e.target.value)}
                className="rekky-select h-8.5 rounded-lg border border-border-light bg-surface-primary-alt px-3 text-xs text-text-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              >
                <option value="all">All Creators</option>
                {creators.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
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
  onDetailsChange: (importId: string, value: string) => void;
  onSaveDetails: (socialImport: SocialImport) => void;
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
  onDetailsChange,
  onSaveDetails,
  onRetry,
  onDelete,
}: SocialImportCardProps) {
  const title = displayTitle(socialImport, localize('com_social_imports_untitled'));
  const statusLabel = localize(statusLabelKeys[socialImport.status]);
  const providerLabel = localize(providerLabelKeys[socialImport.provider]);
  const source = sourceLabel(socialImport, providerLabel);
  const hasExtractedText = Boolean(socialImport.extractedText?.trim());
  const showDetails = needsHelpImport(socialImport) || Boolean(detailsValue.trim());
  const actionLabel = socialImport.savedRecipeId
    ? 'com_social_imports_open_saved_recipe'
    : socialImport.draftConversationId && !detailsDirty
      ? 'com_social_imports_open_draft'
      : 'com_social_imports_draft_with_rekky';

  const openImport = () => {
    if (draftDisabled && !socialImport.savedRecipeId) {
      return;
    }
    onOpen(socialImport, detailsValue, detailsDirty);
  };

  const openImportFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    openImport();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={localize(actionLabel)}
      className="group flex min-h-[250px] cursor-pointer flex-col overflow-hidden rounded-lg border border-border-light bg-surface-primary transition-colors hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary sm:min-h-[300px]"
      onClick={openImport}
      onKeyDown={openImportFromKeyboard}
    >
      <div className="relative aspect-video bg-surface-primary-alt">
        {socialImport.thumbnailUrl ? (
          <img
            src={
              socialImport.thumbnailUrl.includes('ytimg.com') || socialImport.thumbnailUrl.includes('youtube.com')
                ? socialImport.thumbnailUrl
                : `/api/social-imports/image-proxy?url=${encodeURIComponent(socialImport.thumbnailUrl)}`
            }
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-secondary">
            <Video className="size-8" aria-hidden="true" />
          </div>
        )}
        {socialImport.status !== 'draft_ready' ? (
          <div className="absolute left-2.5 top-2.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium leading-5 text-white">
            {statusLabel}
          </div>
        ) : null}
        <Menu.MenuProvider>
          <Menu.MenuButton
            aria-label={localize('com_social_imports_source_actions')}
            className="absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/75 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Menu.MenuButton>
          <Menu.Menu portal className="popover-ui z-[125] min-w-48 rounded-lg p-1">
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

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase text-text-secondary">{source}</p>
          <h2 className="mt-1.5 line-clamp-2 text-base font-medium leading-snug text-text-primary sm:mt-2 sm:text-lg">
            {title}
          </h2>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-3 sm:pt-4">
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
                autoFocus
              />
            </div>
          </form>
        }
        selection={
          <button
            type="submit"
            form="social-import-form"
            disabled={!sourceUrl.trim() || loading}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border-none bg-surface-submit px-4 py-2 text-sm text-white transition-colors hover:bg-surface-submit-hover disabled:cursor-not-allowed disabled:opacity-70 max-sm:order-first max-sm:w-full"
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
            className="flex h-10 items-center justify-center gap-2 rounded-lg border-none bg-surface-destructive px-4 py-2 text-sm text-white transition-colors hover:bg-surface-destructive-hover disabled:cursor-not-allowed disabled:opacity-70"
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
