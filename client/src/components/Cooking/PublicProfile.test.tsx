import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { PublicProfile as PublicProfileType } from 'librechat-data-provider';
import PublicProfile from './PublicProfile';

const profile: PublicProfileType = {
  author: { id: 'owner-1', name: 'Mina Rao', username: 'mina-cooks' },
  recipes: [
    {
      _id: 'recipe-1',
      title: 'Weeknight dal',
      documentType: 'recipe',
      illustrationStatus: 'complete',
      totalMinutes: 25,
      categorization: {
        cuisine: ['indian'],
        mealType: ['dinner'],
        dishType: ['stew'],
        diet: ['vegetarian'],
        occasion: [],
        equipment: [],
        potentialAllergens: [],
        mainIngredients: ['lentils'],
        techniques: ['simmering'],
        flavorProfile: ['savory'],
        source: 'hybrid',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      author: { id: 'owner-1', name: 'Mina Rao', username: 'mina-cooks' },
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  total: 1,
};

jest.mock('~/data-provider', () => ({
  usePublicProfileQuery: () => ({
    data: { pages: [profile] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string | number>) => {
    if (key === 'com_cooking_minutes_short') return `${values?.[0]}m`;
    if (values?.name) return `${key}:${values.name}`;
    if (values?.count !== undefined) return `${values.count} recipes`;
    return key;
  },
}));

jest.mock('~/components/ui', () => ({
  ProtectedImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

describe('public profile', () => {
  test('presents a responsive identity and useful recipe metadata', () => {
    render(
      <MemoryRouter initialEntries={['/cooks/owner-1/mina-cooks']}>
        <Routes>
          <Route path="/cooks/:userId/:slug?" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Mina Rao' });
    expect(heading).toHaveClass('[overflow-wrap:anywhere]');
    expect(heading).not.toHaveClass('rekky-title');
    expect(screen.getByText('com_public_profile_intro:Mina Rao')).toBeInTheDocument();
    expect(screen.getByText('25m')).toBeInTheDocument();
    expect(screen.getByText('indian').closest('p')).toHaveClass('capitalize');
  });
});
