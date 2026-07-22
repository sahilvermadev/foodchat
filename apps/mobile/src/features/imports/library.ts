import type { SocialImport, SocialImportProvider } from 'librechat-data-provider';

export type ImportView = 'all' | 'ready' | 'needs_help' | 'processing' | 'saved';
export type SourceFilter = 'all' | SocialImportProvider;
export type ImportSort = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'creator_asc';

export type ImportFilters = {
  category: string;
  creator: string;
  sort: ImportSort;
  source: SourceFilter;
  view: ImportView;
};

export const initialImportFilters: ImportFilters = {
  category: 'all',
  creator: 'all',
  sort: 'newest',
  source: 'all',
  view: 'all',
};

export const viewFilters: ImportView[] = ['all', 'ready', 'needs_help', 'processing', 'saved'];
export const sourceFilters: SourceFilter[] = ['all', 'youtube', 'instagram', 'tiktok', 'web'];
export const sortFilters: ImportSort[] = [
  'newest',
  'oldest',
  'title_asc',
  'title_desc',
  'creator_asc',
];

export const recipeCategories = [
  { id: 'all', keywords: [] },
  { id: 'chicken', keywords: ['chicken'] },
  {
    id: 'dessert',
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
  { id: 'pizza', keywords: ['pizza'] },
  {
    id: 'pasta',
    keywords: ['pasta', 'noodle', 'spaghetti', 'lasagna', 'pad thai', 'macaroni'],
  },
  { id: 'bread', keywords: ['bread', 'pita', 'dough', 'bun', 'croissant', 'bagel'] },
  {
    id: 'sauce',
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
  { id: 'sandwich', keywords: ['sandwich', 'burger', 'sub', 'hoagie', 'panini'] },
  {
    id: 'breakfast',
    keywords: ['breakfast', 'egg', 'toast', 'pancake', 'omelette', 'omurice', 'french toast'],
  },
  { id: 'soup', keywords: ['soup', 'broth', 'stew', 'ramen'] },
] as const;

export const displayImportTitle = (item: SocialImport) =>
  item.title?.trim() || item.providerContentId || item.canonicalUrl;

export const importSource = (item: SocialImport, provider: string) =>
  [item.creatorName?.trim(), provider].filter(Boolean).join(' / ') || provider;

export const isYouTubePlaylistUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      (host === 'youtube.com' || host === 'm.youtube.com') && Boolean(url.searchParams.get('list'))
    );
  } catch {
    return false;
  }
};

export const creatorsFromImports = (imports: SocialImport[]) =>
  Array.from(
    imports.reduce((creators, item) => {
      if (item.creatorName?.trim()) creators.add(item.creatorName.trim());
      return creators;
    }, new Set<string>()),
  ).sort((first, second) => first.localeCompare(second));

export const filterAndSortImports = (
  imports: SocialImport[],
  filters: Pick<ImportFilters, 'category' | 'creator' | 'sort'>,
) => {
  const category = recipeCategories.find((item) => item.id === filters.category);
  const filtered = imports.filter((item) => {
    if (filters.creator !== 'all' && item.creatorName?.trim() !== filters.creator) return false;
    if (!category || category.id === 'all') return true;
    const text = `${item.title ?? ''} ${item.extractedText ?? ''}`.toLowerCase();
    return category.keywords.some((keyword) => text.includes(keyword));
  });

  return filtered.sort((first, second) => {
    if (filters.sort === 'oldest') {
      return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    }
    if (filters.sort === 'title_asc') {
      return displayImportTitle(first).localeCompare(displayImportTitle(second));
    }
    if (filters.sort === 'title_desc') {
      return displayImportTitle(second).localeCompare(displayImportTitle(first));
    }
    if (filters.sort === 'creator_asc') {
      return (first.creatorName ?? '').localeCompare(second.creatorName ?? '');
    }
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  });
};

export const activeImportFilterCount = (filters: ImportFilters) =>
  Number(filters.view !== 'all') +
  Number(filters.source !== 'all') +
  Number(filters.category !== 'all') +
  Number(filters.creator !== 'all') +
  Number(filters.sort !== 'newest');
