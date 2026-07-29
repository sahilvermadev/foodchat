import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { SocialImport } from 'librechat-data-provider';
import type { Localize } from './helpers';
import { FilterToolbar, SocialImportCard } from './components';

const localize: Localize = (key) => key;
const noop = () => undefined;

const portraitImport: SocialImport = {
  _id: 'import-portrait',
  user: 'user-1',
  sourceUrl: 'https://example.com/hummus',
  canonicalUrl: 'https://example.com/hummus',
  provider: 'web',
  title: 'Loaded Hummus',
  thumbnailUrl: 'https://images.example.com/portrait.jpg',
  embedHtmlAllowed: false,
  status: 'draft_ready',
  provenance: 'source_exact',
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('SocialImportCard media sizing', () => {
  test('removes arbitrary image dimensions from grid layout sizing', () => {
    render(
      <SocialImportCard
        socialImport={portraitImport}
        detailsValue=""
        detailsDirty={false}
        isDrafting={false}
        isRetrying={false}
        draftDisabled={false}
        updateDisabled={false}
        retryDisabled={false}
        localize={localize}
        onOpen={noop}
        onRecreate={noop}
        onMarkInspiration={noop}
        onRetry={noop}
        onDelete={noop}
      />,
    );

    expect(screen.getByTestId('social-import-media')).toHaveClass(
      'aspect-[3/2]',
      'w-full',
      'shrink-0',
      'overflow-hidden',
    );
    const image = screen.getByTestId('social-import-media').querySelector('img');
    expect(image).toHaveClass('absolute', 'inset-0', 'size-full', 'object-cover');
    fireEvent.error(image as HTMLImageElement);
    expect(screen.getByText('com_social_imports_image_unavailable')).toBeInTheDocument();
  });
});

describe('FilterToolbar', () => {
  test('keeps secondary filters behind one progressive-disclosure control', () => {
    const onToggleFilters = jest.fn();
    const toolbar = (filtersExpanded: boolean) => (
      <FilterToolbar
        viewFilter="all"
        sourceFilter="all"
        query=""
        showSearch
        localize={localize}
        onViewFilterChange={jest.fn()}
        onSourceFilterChange={jest.fn()}
        onQueryChange={jest.fn()}
        categoryFilter="all"
        onCategoryFilterChange={jest.fn()}
        creatorFilter="all"
        onCreatorFilterChange={jest.fn()}
        sortBy="newest"
        onSortByChange={jest.fn()}
        creators={['Rekky Kitchen']}
        filtersExpanded={filtersExpanded}
        onToggleFilters={onToggleFilters}
        onClearAll={jest.fn()}
        activeFiltersCount={0}
      />
    );
    const { rerender } = render(toolbar(false));

    expect(screen.queryByLabelText('com_social_imports_filter_category')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_social_imports_filters' }));
    expect(onToggleFilters).toHaveBeenCalledTimes(1);

    rerender(toolbar(true));

    expect(screen.getByLabelText('com_social_imports_filter_category')).toBeInTheDocument();
    expect(screen.getByLabelText('com_social_imports_filter_creator')).toBeInTheDocument();
  });
});
