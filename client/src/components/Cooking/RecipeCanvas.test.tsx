/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import RecipeCanvas from './RecipeCanvas';

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-body">{content}</div>,
}));

jest.mock('~/data-provider', () => ({
  useSaveRecipeMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useSavedRecipeByDraftQuery: () => ({ data: null }),
  useUpdateSavedRecipeMutation: () => ({ isLoading: false, mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
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
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

function renderCanvas(markdown: string) {
  render(<RecipeCanvas markdown={markdown} conversationId="convo-1" isPreparingDraft={false} />);
}

describe('RecipeCanvas recipe data display', () => {
  test('renders bullet Recipe Data lines as metric tiles', () => {
    renderCanvas(`# Dal

## Recipe Data
- Servings: 4
- Prep time: 15 minutes

## Ingredients
- lentils`);

    const metrics = within(screen.getByTestId('recipe-metrics'));

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
});
