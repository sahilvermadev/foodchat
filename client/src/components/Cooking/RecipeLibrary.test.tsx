import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { SavedRecipeSummary } from 'librechat-data-provider';
import RecipeLibrary from './RecipeLibrary';

const mockDeleteRecipe = jest.fn();
const mockShowToast = jest.fn();

const mockSavedRecipe: SavedRecipeSummary = {
  _id: 'recipe-1',
  user: 'user-1',
  title: 'Thai Iced Tea',
  documentType: 'recipe',
  illustrationStatus: 'complete',
  categorizationStatus: 'complete',
  categorizationVersion: 1,
  createdAt: '2026-05-25T00:00:00.000Z',
  updatedAt: '2026-05-25T00:00:00.000Z',
};

jest.mock('~/data-provider', () => ({
  useDeleteSavedRecipeMutation: () => ({ isLoading: false, mutate: mockDeleteRecipe }),
  useRecipesQuery: () => ({ data: { recipes: [mockSavedRecipe] }, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    values?.[0] ? `${key}:${values[0]}` : key,
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
});
