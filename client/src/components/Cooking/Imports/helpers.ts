import type {
  SocialImport,
  SocialImportProvider,
  SocialImportStatus,
  SocialPlaylistSubscription,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

export type Localize = (key: TranslationKeys, values?: Record<string, string | number>) => string;

export type SourceFilter = 'all' | SocialImportProvider;

export type TimelineGroup = {
  id: string;
  labelKey: TranslationKeys;
  imports: SocialImport[];
};

export type ViewFilter = 'all' | 'ready' | 'needs_help' | 'processing' | 'saved';

export const viewFilters: ViewFilter[] = ['all', 'ready', 'needs_help', 'processing', 'saved'];

export const sourceFilters: SourceFilter[] = ['all', 'youtube', 'instagram', 'tiktok', 'web'];

export const recipeCategories = [
  { id: 'all', label: 'All Categories' },
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  {
    id: 'dessert',
    label: 'Desserts & Baking',
    keywords: [
      'cake',
      'dessert',
      'brownie',
      'chocolate',
      'donut',
      'sweet',
      'mousse',
      'caramel',
      'fondant',
      'cookie',
      'custard',
      'pudding',
      'tart',
      'pie',
    ],
  },
  { id: 'pizza', label: 'Pizza', keywords: ['pizza'] },
  {
    id: 'pasta',
    label: 'Pasta & Noodles',
    keywords: ['pasta', 'noodle', 'spaghetti', 'lasagna', 'pad thai', 'macaroni'],
  },
  {
    id: 'bread',
    label: 'Bread & Dough',
    keywords: ['bread', 'pita', 'dough', 'bun', 'croissant', 'bagel'],
  },
  {
    id: 'sauce',
    label: 'Sauces & Dips',
    keywords: [
      'sauce',
      'dip',
      'gravy',
      'pesto',
      'hummus',
      'tzatziki',
      'demiglace',
      'demi-glace',
      'spread',
      'chutney',
      'aioli',
    ],
  },
  {
    id: 'sandwich',
    label: 'Sandwiches & Burgers',
    keywords: ['sandwich', 'burger', 'sub', 'hoagie', 'panini'],
  },
  {
    id: 'breakfast',
    label: 'Breakfast & Eggs',
    keywords: ['breakfast', 'egg', 'toast', 'pancake', 'omelette', 'omurice', 'french toast'],
  },
  { id: 'soup', label: 'Soups & Stews', keywords: ['soup', 'broth', 'stew', 'ramen'] },
];

export const viewLabelKeys: Record<ViewFilter, TranslationKeys> = {
  all: 'com_social_imports_filter_all',
  ready: 'com_social_imports_filter_ready',
  needs_help: 'com_social_imports_filter_needs_help',
  processing: 'com_social_imports_filter_processing',
  saved: 'com_social_imports_filter_saved',
};

export const statusLabelKeys: Record<SocialImportStatus, TranslationKeys> = {
  saved: 'com_social_imports_status_saved',
  processing: 'com_social_imports_status_processing',
  draft_ready: 'com_social_imports_status_draft_ready',
  needs_review: 'com_social_imports_status_needs_review',
  saved_recipe: 'com_social_imports_status_saved_recipe',
  inspiration: 'com_social_imports_status_inspiration',
  failed: 'com_social_imports_status_failed',
};

export const providerLabelKeys: Record<SocialImportProvider, TranslationKeys> = {
  youtube: 'com_social_imports_provider_youtube',
  instagram: 'com_social_imports_provider_instagram',
  tiktok: 'com_social_imports_provider_tiktok',
  web: 'com_social_imports_provider_web',
  unknown: 'com_social_imports_provider_unknown',
};

export const sourceLabelKeys: Record<SourceFilter, TranslationKeys> = {
  all: 'com_social_imports_provider_all',
  youtube: 'com_social_imports_provider_youtube',
  instagram: 'com_social_imports_provider_instagram',
  tiktok: 'com_social_imports_provider_tiktok',
  web: 'com_social_imports_provider_web',
  unknown: 'com_social_imports_provider_unknown',
};

export function displayTitle(socialImport: SocialImport, fallback: string): string {
  return socialImport.title?.trim() || socialImport.providerContentId || fallback;
}

export function sourceLabel(socialImport: SocialImport, providerLabel: string): string {
  return [socialImport.creatorName, providerLabel].filter(Boolean).join(' / ') || providerLabel;
}

export function needsHelpImport(socialImport: SocialImport): boolean {
  if (socialImport.status === 'failed' || socialImport.status === 'needs_review') {
    return true;
  }
  return socialImport.status === 'saved' && !socialImport.extractedText?.trim();
}

function startOfLocalDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysSince(value: string): number {
  const today = startOfLocalDay(new Date());
  const date = startOfLocalDay(new Date(value));
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000);
}

function timelineLabelKey(value: string): TranslationKeys {
  const days = daysSince(value);
  if (days <= 0) {
    return 'com_social_imports_timeline_today';
  }
  if (days === 1) {
    return 'com_social_imports_timeline_yesterday';
  }
  if (days < 7) {
    return 'com_social_imports_timeline_this_week';
  }
  return 'com_social_imports_timeline_older';
}

export function groupImportsByTimeline(imports: SocialImport[]): TimelineGroup[] {
  const order: TranslationKeys[] = [
    'com_social_imports_timeline_today',
    'com_social_imports_timeline_yesterday',
    'com_social_imports_timeline_this_week',
    'com_social_imports_timeline_older',
  ];
  const groups = new Map<TranslationKeys, SocialImport[]>();
  imports
    .slice()
    .sort(
      (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    )
    .forEach((socialImport) => {
      const labelKey = timelineLabelKey(socialImport.createdAt);
      groups.set(labelKey, [...(groups.get(labelKey) ?? []), socialImport]);
    });
  return order
    .map((labelKey) => ({
      id: labelKey,
      labelKey,
      imports: groups.get(labelKey) ?? [],
    }))
    .filter((group) => group.imports.length > 0);
}

export function playlistStatusLabel(subscription: SocialPlaylistSubscription): TranslationKeys {
  if (subscription.status === 'paused') {
    return 'com_social_imports_playlist_paused_meta';
  }
  if (subscription.status === 'failed') {
    return 'com_social_imports_playlist_needs_attention_meta';
  }
  return 'com_social_imports_playlist_active_meta';
}

export function sharedSourceFromParams(searchParams: URLSearchParams): string {
  const candidates = [
    searchParams.get('url'),
    searchParams.get('text'),
    searchParams.get('title'),
  ].map((value) => value?.trim() ?? '');
  return candidates.find((value) => /https?:\/\//i.test(value)) ?? '';
}

export function sharedDetailsFromParams(searchParams: URLSearchParams): string | undefined {
  const text = searchParams.get('text')?.trim();
  if (!text) {
    return undefined;
  }
  const textWithoutUrls = text.replace(/https?:\/\/[^\s<>"']+/gi, '').trim();
  return textWithoutUrls ? text : undefined;
}

export function isYouTubePlaylistUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      (host === 'youtube.com' || host === 'm.youtube.com') && Boolean(url.searchParams.get('list'))
    );
  } catch {
    return false;
  }
}

type ApiError = {
  response?: {
    data?: {
      error?: unknown;
      message?: unknown;
    };
  };
};

export function errorMessage(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') {
    return undefined;
  }
  const data = (error as ApiError).response?.data;
  const message = data?.error ?? data?.message;
  return typeof message === 'string' && message.trim() ? message : undefined;
}
