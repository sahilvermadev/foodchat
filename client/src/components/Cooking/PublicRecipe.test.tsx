import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { PublicRecipe as PublicRecipeType } from 'librechat-data-provider';
import PublicRecipe from './PublicRecipe';

let mockAuthenticated = false;
let mockUserId = 'viewer-1';
const mockCopy = jest.fn();
const ownedCopyLabel = 'owned-copy';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

const publicRecipe: PublicRecipeType = {
  _id: '665f1f77bcf86cd799439011',
  title: 'Shared soup',
  documentType: 'recipe',
  shortDescription: 'A soup shared by Mina.',
  illustrationStatus: 'complete',
  documentMarkdown: '# Shared soup',
  author: { id: 'owner-1', name: 'Mina' },
  updatedAt: '2026-08-01T00:00:00.000Z',
};

jest.mock('~/data-provider', () => ({
  useAddShoppingItemsMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useCopyPublicRecipeMutation: () => ({ isLoading: false, mutate: mockCopy }),
  usePublicRecipeQuery: () => ({ data: publicRecipe, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({
    isAuthenticated: mockAuthenticated,
    user: mockAuthenticated ? { id: mockUserId } : undefined,
  }),
  useLocalize: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

describe('public recipe sharing', () => {
  beforeEach(() => {
    mockAuthenticated = false;
    mockUserId = 'viewer-1';
    mockCopy.mockReset();
  });

  test('renders owner attribution and asks anonymous visitors to sign in before copying', () => {
    render(
      <MemoryRouter initialEntries={['/r/665f1f77bcf86cd799439011']}>
        <Routes>
          <Route
            path="/r/:recipeId"
            element={
              <>
                <LocationProbe />
                <PublicRecipe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'com_landing_home' })).toHaveClass('rekky-wordmark');
    expect(screen.getByRole('main')).toHaveClass('rekky-recipe-surface');

    expect(screen.getByText('Mina')).toBeInTheDocument();
    fireEvent.click(screen.getByText('com_public_save_copy'));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/r/665f1f77bcf86cd799439011?auth=login',
    );
    expect(mockCopy).not.toHaveBeenCalled();
  });

  test('gives owners a quiet, explicit editing action', () => {
    mockAuthenticated = true;
    mockUserId = 'owner-1';

    render(
      <MemoryRouter initialEntries={['/r/665f1f77bcf86cd799439011']}>
        <Routes>
          <Route path="/r/:recipeId" element={<PublicRecipe />} />
          <Route path="/recipes/:recipeId" element={<div>{ownedCopyLabel}</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const editAction = screen.getByRole('button', { name: 'com_public_edit_in_rekky' });
    expect(editAction).toHaveClass('border-border-light');
    expect(editAction).not.toHaveClass('bg-surface-submit');
    fireEvent.click(editAction);
    expect(screen.getByText(ownedCopyLabel)).toBeInTheDocument();
    expect(mockCopy).not.toHaveBeenCalled();
  });

  test('copies into the signed-in user cookbook before navigating to editing surfaces', () => {
    mockAuthenticated = true;
    mockCopy.mockImplementation((_recipeId, options) => {
      options.onSuccess({ _id: 'copy-1' });
    });

    render(
      <MemoryRouter initialEntries={['/r/665f1f77bcf86cd799439011']}>
        <Routes>
          <Route path="/r/:recipeId" element={<PublicRecipe />} />
          <Route path="/recipes/:recipeId" element={<div>{ownedCopyLabel}</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('com_public_save_copy'));
    expect(mockCopy).toHaveBeenCalledWith(
      '665f1f77bcf86cd799439011',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText(ownedCopyLabel)).toBeInTheDocument();
  });
});
