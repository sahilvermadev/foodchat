import type { SocialImport } from 'librechat-data-provider';

import {
  activeImportFilterCount,
  filterAndSortImports,
  initialImportFilters,
  isYouTubePlaylistUrl,
} from './library';

const socialImport = (overrides: Partial<SocialImport>): SocialImport => ({
  _id: 'one',
  user: 'user',
  sourceUrl: 'https://example.com',
  canonicalUrl: 'https://example.com',
  provider: 'web',
  embedHtmlAllowed: false,
  status: 'draft_ready',
  provenance: 'source_exact',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('import library', () => {
  test('recognizes YouTube playlist URLs without treating videos as playlists', () => {
    expect(isYouTubePlaylistUrl('https://youtube.com/playlist?list=PL123')).toBe(true);
    expect(isYouTubePlaylistUrl('https://youtube.com/watch?v=123')).toBe(false);
    expect(isYouTubePlaylistUrl('not a url')).toBe(false);
  });

  test('filters by website-equivalent category keywords and creator', () => {
    const imports = [
      socialImport({ _id: 'cake', creatorName: 'Tasty', title: 'Chocolate cake' }),
      socialImport({ _id: 'soup', creatorName: 'NYT', title: 'Tomato broth' }),
    ];
    expect(
      filterAndSortImports(imports, {
        category: 'dessert',
        creator: 'Tasty',
        sort: 'newest',
      }).map((item) => item._id),
    ).toEqual(['cake']);
  });

  test('sorts titles and counts every active filter', () => {
    const imports = [
      socialImport({ title: 'Ziti' }),
      socialImport({ _id: 'two', title: 'Apple pie' }),
    ];
    expect(
      filterAndSortImports(imports, { category: 'all', creator: 'all', sort: 'title_asc' }).map(
        (item) => item.title,
      ),
    ).toEqual(['Apple pie', 'Ziti']);
    expect(
      activeImportFilterCount({
        ...initialImportFilters,
        category: 'dessert',
        source: 'web',
        view: 'ready',
      }),
    ).toBe(3);
  });
});
