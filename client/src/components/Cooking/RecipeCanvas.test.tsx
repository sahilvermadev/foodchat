import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { CookingDraft } from 'librechat-data-provider';
import RecipeCanvas, { KitchenTimer } from './RecipeCanvas';

const mockSaveRecipe = jest.fn();

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-body">{children}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-body">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownComponents', () => ({
  code: ({ children }: { children: React.ReactNode }) => <code>{children}</code>,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{props.children}</a>,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props} />,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

jest.mock('~/components/Web/Citation', () => ({
  Citation: () => null,
  CompositeCitation: () => null,
  HighlightedText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('~/components/MCPUIResource', () => ({
  MCPUIResource: () => null,
  MCPUIResourceCarousel: () => null,
  mcpUIResourcePlugin: () => () => undefined,
}));

jest.mock('~/Providers', () => ({
  CodeBlockProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/components/Web', () => ({
  unicodeCitation: () => () => undefined,
}));

jest.mock('~/data-provider', () => ({
  useSaveRecipeMutation: () => ({ isLoading: false, mutate: mockSaveRecipe }),
  useSavedRecipeByDraftQuery: () => ({ data: null }),
  useUpdateSavedRecipeMutation: () => ({ isLoading: false, mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string>) => {
    const translations: Record<string, string> = {
      com_cooking_timer: 'Timer',
      com_cooking_named_timer: '{{0}} timer',
      com_cooking_start_named_timer: 'Start {{0}}',
      com_cooking_pause_named_timer: 'Pause {{0}}',
      com_cooking_restart_named_timer: 'Restart {{0}}',
      com_cooking_reset_named_timer: 'Reset {{0}}',
      com_cooking_reset_timer: 'Reset',
    };
    return (translations[key] ?? key).replace('{{0}}', values?.[0] ?? '');
  },
}));

jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" role="menuitem" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

function renderCanvas(markdown: string) {
  render(<RecipeCanvas markdown={markdown} conversationId="convo-1" isPreparingDraft={false} />);
}

function draftWithIngredients(ingredients: CookingDraft['recipe']['ingredients']): CookingDraft {
  return {
    _id: 'draft-1',
    user: 'user-1',
    conversationId: 'convo-1',
    prompt: 'cook',
    status: 'active',
    documentType: 'recipe',
    selected: true,
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

describe('RecipeCanvas recipe data display', () => {
  beforeEach(() => {
    mockSaveRecipe.mockClear();
  });

  test('renders bullet Recipe Data lines as metric tiles', () => {
    renderCanvas(`# Dal

## Recipe Data
- Servings: 4
- Prep time: 15 minutes

## Ingredients
- lentils`);

    const metricsElement = screen.getByTestId('recipe-metrics');
    const metrics = within(metricsElement);

    expect(metricsElement).toHaveClass('grid-cols-2');
    expect(metrics.getByText('Servings')).toBeInTheDocument();
    expect(metrics.getByText('4')).toBeInTheDocument();
    expect(metrics.getByText('Prep time')).toBeInTheDocument();
    expect(metrics.getByText('15 minutes')).toBeInTheDocument();
  });

  test('renders bold Recipe Data labels as metric tiles', () => {
    renderCanvas(`# Dal

## Recipe Data
**Prep time:** 15 minutes
**Cook time:** 30 minutes

## Instructions
1. Simmer.`);

    const metrics = within(screen.getByTestId('recipe-metrics'));

    expect(metrics.getByText('Prep time')).toBeInTheDocument();
    expect(metrics.getByText('15 minutes')).toBeInTheDocument();
    expect(metrics.getByText('Cook time')).toBeInTheDocument();
    expect(metrics.getByText('30 minutes')).toBeInTheDocument();
  });

  test('leaves markdown without Recipe Data unchanged', () => {
    const markdown = `Opening note.

## Ingredients
- lentils`;

    renderCanvas(markdown);

    expect(screen.queryByTestId('recipe-metrics')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-body').textContent).toBe(markdown);
  });

  test('does not duplicate the parsed Recipe Data section in the markdown body', () => {
    renderCanvas(`# Dal

## Recipe Data
| Label | Value |
| --- | --- |
| Servings | 4 |

## Ingredients
- lentils`);

    expect(screen.getByTestId('recipe-metrics')).toHaveTextContent('Servings');
    expect(screen.getByTestId('markdown-body')).not.toHaveTextContent('Recipe Data');
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('## Ingredients');
  });

  test('falls back to markdown ingredients when structured ingredients are placeholders', () => {
    const markdown = `# Changezi Chicken

## Ingredients
- 500g chicken
- 1 cup yogurt

## Instructions
1. Simmer.`;
    const draft = draftWithIngredients([
      {
        id: 'ingredient-1',
        originalText: '1 item',
        quantity: 1,
        item: 'item',
        quantityType: 'measured',
      },
    ]);

    render(
      <RecipeCanvas
        markdown={markdown}
        conversationId="convo-1"
        isPreparingDraft={false}
        draft={draft}
      />,
    );

    expect(screen.queryByTestId('structured-ingredients')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('## Ingredients');
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('500g chicken');
  });

  test('replaces markdown ingredients when structured ingredients are displayable', () => {
    const markdown = `# Changezi Chicken

## Ingredients
- stale markdown chicken

## Instructions
1. Simmer.`;
    const draft = draftWithIngredients([
      {
        id: 'ingredient-1',
        originalText: '500g chicken',
        quantity: 500,
        unit: 'g',
        item: 'chicken',
        quantityType: 'measured',
      },
    ]);

    render(
      <RecipeCanvas
        markdown={markdown}
        conversationId="convo-1"
        isPreparingDraft={false}
        draft={draft}
      />,
    );

    expect(screen.getByTestId('structured-ingredients')).toHaveTextContent('chicken');
    expect(screen.getByLabelText('500g chicken').closest('label')).toHaveClass(
      'grid-cols-[minmax(3.75rem,auto)_minmax(0,1fr)]',
    );
    expect(screen.getByTestId('markdown-body')).not.toHaveTextContent('stale markdown chicken');
    expect(screen.getByTestId('markdown-body')).toHaveTextContent('## Instructions');
  });

  test('saves a new recipe to the selected recipe list from the save button menu', () => {
    const markdown = `# Changezi Chicken

## Ingredients
- 500g chicken`;
    const draft = draftWithIngredients([]);

    render(
      <RecipeCanvas
        markdown={markdown}
        conversationId="convo-1"
        isPreparingDraft={false}
        draft={draft}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'com_recipes_save_recipe' });
    const copyButton = screen.getByRole('button', { name: 'com_cooking_copy_markdown' });

    expect(saveButton).toHaveClass('size-11', 'bg-transparent', 'text-surface-submit');
    expect(within(saveButton).getByText('com_recipes_save_recipe')).toHaveClass(
      'hidden',
      'sm:inline',
    );
    expect(copyButton).toHaveClass('size-11');
    expect(
      screen
        .getByRole('heading', { name: 'Changezi Chicken' })
        .compareDocumentPosition(copyButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_recipes_save_list_cooked_already/ }));

    expect(mockSaveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDraftId: 'draft-1',
        saveList: 'cooked_already',
      }),
    );
  });
});

describe('KitchenTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-07T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses elapsed wall-clock time after a delayed browser tick', () => {
    render(<KitchenTimer seconds={10} label="Sear" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Sear timer' }));

    act(() => {
      jest.setSystemTime(new Date('2026-06-07T10:00:09.100Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('0:01')).toBeInTheDocument();

    act(() => {
      jest.setSystemTime(new Date('2026-06-07T10:00:10.100Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart Sear timer' })).toBeInTheDocument();
  });
});
