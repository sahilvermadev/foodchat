/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { CookingDraft } from 'librechat-data-provider';
import CookingWorkspace from './Workspace';

const mockMountTracker = {
  mounts: 0,
  unmounts: 0,
};

jest.mock('~/components/Chat/ChatView', () => ({
  __esModule: true,
  default: function MockChatView({ collapseRecipeMessages }: { collapseRecipeMessages?: boolean }) {
    const ReactActual = jest.requireActual('react');
    ReactActual.useEffect(() => {
      mockMountTracker.mounts += 1;
      return () => {
        mockMountTracker.unmounts += 1;
      };
    }, []);

    return (
      <div data-testid="chat-view" data-collapse={collapseRecipeMessages ? 'true' : 'false'}>
        chat
      </div>
    );
  },
}));

jest.mock('./RecipeCanvas', () => ({
  __esModule: true,
  default: ({ markdown }: { markdown?: string }) => (
    <div data-testid="recipe-canvas">{markdown || 'canvas'}</div>
  ),
}));

const draft = {
  _id: 'draft-1',
  user: 'user-1',
  conversationId: 'convo-1',
  prompt: 'recipe',
  status: 'active',
  documentMarkdown: '# Recipe',
  recipe: {
    title: 'Recipe',
    description: '',
    servings: 2,
    timing: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
    ingredients: [],
    steps: [],
    notes: [],
    tags: [],
  },
  expiresAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as CookingDraft;

describe('CookingWorkspace', () => {
  beforeEach(() => {
    mockMountTracker.mounts = 0;
    mockMountTracker.unmounts = 0;
  });

  it('does not remount chat when the recipe canvas opens', () => {
    const { rerender, queryByTestId, getByTestId } = render(
      <CookingWorkspace conversationId="convo-1" markdown="" isPreparingDraft={false} index={0} />,
    );

    expect(getByTestId('chat-view')).toHaveAttribute('data-collapse', 'true');
    expect(queryByTestId('recipe-canvas')).not.toBeInTheDocument();

    rerender(
      <CookingWorkspace
        conversationId="convo-1"
        draft={draft}
        markdown="# Recipe"
        isPreparingDraft={false}
        index={0}
      />,
    );

    expect(getByTestId('chat-view')).toHaveAttribute('data-collapse', 'true');
    expect(getByTestId('recipe-canvas')).toBeInTheDocument();
    expect(mockMountTracker.mounts).toBe(1);
    expect(mockMountTracker.unmounts).toBe(0);
  });

  it('uses parsed assistant markdown as the canvas source when persisted draft markdown is missing', () => {
    const draftWithoutMarkdown = { ...draft, documentMarkdown: '' };
    const { getByTestId } = render(
      <CookingWorkspace
        conversationId="convo-1"
        draft={draftWithoutMarkdown}
        markdown="# Parsed Artifact"
        isPreparingDraft={false}
        index={0}
      />,
    );

    expect(getByTestId('recipe-canvas')).toHaveTextContent('# Parsed Artifact');
  });

  it('opens the canvas as soon as parsed assistant markdown exists', () => {
    const { getByTestId } = render(
      <CookingWorkspace
        conversationId="convo-1"
        markdown="# Fresh Artifact"
        isPreparingDraft={false}
        index={0}
      />,
    );

    expect(getByTestId('chat-view')).toHaveAttribute('data-collapse', 'true');
    expect(getByTestId('recipe-canvas')).toHaveTextContent('# Fresh Artifact');
  });

  it('keeps a new chat in chat-first mode while a draft is only preparing', () => {
    const { getByTestId, queryByTestId } = render(
      <CookingWorkspace conversationId="new" markdown="" isPreparingDraft={true} index={0} />,
    );

    expect(getByTestId('chat-view')).toHaveAttribute('data-collapse', 'true');
    expect(queryByTestId('recipe-canvas')).not.toBeInTheDocument();
  });
});
