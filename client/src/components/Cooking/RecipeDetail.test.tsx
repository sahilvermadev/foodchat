import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { SavedRecipe } from 'librechat-data-provider';
import RecipeDetail from './RecipeDetail';

let mockRecipe: SavedRecipe;
const mockCreateCookingDocument = jest.fn();

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-body">{content}</div>,
}));

jest.mock('~/data-provider', () => ({
  useCreateCookingDocumentMutation: () => ({
    isLoading: false,
    mutate: mockCreateCookingDocument,
  }),
  useRecipeQuery: () => ({ data: mockRecipe, isLoading: false }),
  useUpdateSavedRecipeMutation: () => ({ isLoading: false, mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  TextareaAutosize: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

function savedRecipe(ingredients: NonNullable<SavedRecipe['recipe']>['ingredients']): SavedRecipe {
  return {
    _id: '665f1f77bcf86cd799439011',
    user: 'user-1',
    title: 'Changezi Chicken',
    documentType: 'recipe',
    saveList: 'want_to_cook',
    documentMarkdown: `# Changezi Chicken

## Ingredients
- stale markdown chicken

## Instructions
1. Simmer.`,
    illustrationStatus: 'complete',
    categorizationStatus: 'complete',
    categorizationVersion: 1,
    recipe: {
      title: 'Changezi Chicken',
      description: '',
      servings: 4,
      timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
      ingredients,
      steps: [],
      notes: [],
      tags: [],
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function renderDetail() {
  render(
    <MemoryRouter
      initialEntries={['/recipes/recipe-1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RecipeDetail structured ingredients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'conversation-saved-recipe'),
    });
  });

  test('falls back to markdown ingredients for placeholder structured data', () => {
    mockRecipe = savedRecipe([
      {
        id: 'ingredient-1',
        originalText: '1 item',
        item: 'item',
        quantityType: 'measured',
      },
    ]);

    renderDetail();

    expect(screen.queryByTestId('structured-ingredients')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('stale markdown chicken');
  });

  test('replaces markdown ingredients for displayable structured data', () => {
    mockRecipe = savedRecipe([
      {
        id: 'ingredient-1',
        originalText: '500g chicken',
        quantity: 500,
        unit: 'g',
        item: 'chicken',
        quantityType: 'measured',
      },
    ]);

    renderDetail();

    expect(screen.getByTestId('structured-ingredients')).toHaveTextContent('chicken');
    expect(screen.getByTestId('markdown-body')).not.toHaveTextContent('stale markdown chicken');
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('## Instructions');
  });

  test('identifies chats started from a saved recipe', () => {
    mockRecipe = savedRecipe([]);

    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'com_recipes_discuss_ai' }));

    expect(mockCreateCookingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-saved-recipe',
        savedRecipeId: '665f1f77bcf86cd799439011',
        documentType: 'recipe',
      }),
      expect.any(Object),
    );
  });
});
