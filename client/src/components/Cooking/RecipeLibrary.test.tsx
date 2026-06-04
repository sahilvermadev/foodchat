import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { SavedRecipeSummary, SavedRecipesQuery } from 'librechat-data-provider';
import RecipeLibrary from './RecipeLibrary';

const mockDeleteRecipe = jest.fn();
const mockShowToast = jest.fn();
const mockFetchNextPage = jest.fn();
let mockInfiniteParams: SavedRecipesQuery | undefined;
let mockInfinitePages: Array<{
  recipes: SavedRecipeSummary[];
  total?: number;
  nextCursor?: string;
}>;

const mockSavedRecipe: SavedRecipeSummary = {
  _id: 'recipe-1',
  user: 'user-1',
  title: 'Thai Iced Tea',
  documentType: 'recipe',
  saveList: 'want_to_cook',
  illustrationStatus: 'complete',
  categorizationStatus: 'complete',
  categorizationVersion: 1,
  createdAt: '2026-05-25T00:00:00.000Z',
  updatedAt: '2026-05-25T00:00:00.000Z',
};

jest.mock('~/data-provider', () => ({
  useDeleteSavedRecipeMutation: () => ({ isLoading: false, mutate: mockDeleteRecipe }),
  useRecipesInfiniteQuery: (params: SavedRecipesQuery) => {
    mockInfiniteParams = params;
    return {
      data: { pages: mockInfinitePages },
      fetchNextPage: mockFetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
      isLoading: false,
    };
  },
  useRecipesQuery: () => ({ data: { recipes: [mockSavedRecipe], total: 1 }, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) => {
    const value = values?.[0] ?? values?.count;
    return value ? `${key}:${value}` : key;
  },
}));

jest.mock('~/components/ui', () => ({
  ProtectedImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

jest.mock('@librechat/client', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  OGDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  OGDialogTemplate: ({
    main,
    selection,
    title,
  }: {
    main?: React.ReactNode;
    selection?: React.ReactNode;
    title: string;
  }) => (
    <div role="dialog" aria-label={title}>
      {main}
      {selection}
    </div>
  ),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

describe('RecipeLibrary actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInfiniteParams = undefined;
    mockInfinitePages = [{ recipes: [mockSavedRecipe], total: 31, nextCursor: 'next-page' }];
  });

  test('confirms deletion from a recipe card action menu', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecipeLibrary />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_recipes_delete_recipe' }));
    expect(screen.getByRole('dialog', { name: 'com_recipes_delete_recipe' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_delete' }));

    expect(mockDeleteRecipe).toHaveBeenCalledWith(mockSavedRecipe, expect.any(Object));
  });

  test('shows the backend total and loads the next cursor page on request', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecipeLibrary />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_recipes_count_short_other:31')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_recipes_load_more' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  test('falls back to the loaded recipe count when an older backend omits the total', () => {
    mockInfinitePages = [{ recipes: [mockSavedRecipe] }];

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecipeLibrary />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_recipes_count_short_one')).toBeInTheDocument();
  });

  test('filters recipes by saved list', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecipeLibrary />
      </MemoryRouter>,
    );

    expect(mockInfiniteParams).not.toHaveProperty('saveList');

    fireEvent.click(screen.getByRole('tab', { name: 'com_recipes_save_list_cooked_already' }));

    expect(mockInfiniteParams).toEqual(expect.objectContaining({ saveList: 'cooked_already' }));
  });
});
