/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { CookingDraft } from 'librechat-data-provider';
import CookingWorkspace from './Workspace';

const mockMountTracker = {
  mounts: 0,
  unmounts: 0,
};
const mockSelectDocument = jest.fn();
const mockDeleteDocument = jest.fn();

jest.mock('~/components/Chat/ChatView', () => ({
  __esModule: true,
  default: function MockChatView({
    collapseRecipeMessages,
    conversationId,
  }: {
    collapseRecipeMessages?: boolean;
    conversationId?: string;
  }) {
    const ReactActual = jest.requireActual('react');
    ReactActual.useEffect(() => {
      mockMountTracker.mounts += 1;
      return () => {
        mockMountTracker.unmounts += 1;
      };
    }, []);

    return (
      <div
        data-testid="chat-view"
        data-collapse={collapseRecipeMessages ? 'true' : 'false'}
        data-conversation-id={conversationId}
      >
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

jest.mock('~/data-provider', () => ({
  useDeleteCookingDocumentMutation: () => ({ mutate: mockDeleteDocument, isLoading: false }),
  useSelectCookingDocumentMutation: () => ({ mutate: mockSelectDocument }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const draft = {
  _id: 'draft-1',
  user: 'user-1',
  conversationId: 'convo-1',
  prompt: 'recipe',
  status: 'active',
  documentType: 'recipe',
  selected: true,
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as CookingDraft;

describe('CookingWorkspace', () => {
  beforeEach(() => {
    mockMountTracker.mounts = 0;
    mockMountTracker.unmounts = 0;
    mockSelectDocument.mockClear();
    mockDeleteDocument.mockClear();
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

  it('does not show the previous conversation canvas after switching to new chat', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <CookingWorkspace
        conversationId="convo-1"
        draft={draft}
        markdown="# Recipe"
        isPreparingDraft={false}
        index={0}
      />,
    );

    expect(getByTestId('recipe-canvas')).toBeInTheDocument();

    rerender(
      <CookingWorkspace
        conversationId="new"
        markdown=""
        documents={[]}
        documentsLoaded={false}
        isPreparingDraft={false}
        index={0}
      />,
    );

    expect(queryByTestId('recipe-canvas')).not.toBeInTheDocument();
    expect(getByTestId('chat-view')).toHaveAttribute('data-conversation-id', 'new');
  });

  it('keeps the chat pane on the route conversation while documents use the active conversation', () => {
    render(
      <CookingWorkspace
        conversationId="real-convo-1"
        chatConversationId="new"
        draft={draft}
        markdown="# Recipe"
        isPreparingDraft={true}
        index={0}
      />,
    );

    expect(screen.getByTestId('chat-view')).toHaveAttribute('data-conversation-id', 'new');
    expect(mockSelectDocument).not.toHaveBeenCalled();
  });

  it('renders document tabs and selects or deletes a document from the canvas switcher', () => {
    const guide = {
      ...draft,
      _id: 'guide-1',
      documentType: 'guide' as const,
      selected: false,
      recipe: { ...draft.recipe, title: 'Starter Guide' },
    };

    render(
      <CookingWorkspace
        conversationId="convo-1"
        draft={draft}
        documents={[draft, guide]}
        selectedDocumentId={draft._id}
        markdown="# Recipe"
        isPreparingDraft={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Starter Guide/ }));
    expect(mockSelectDocument).toHaveBeenCalledWith('guide-1');

    const selectedDocumentTab = screen.getByRole('button', { name: /Recipe/ });
    expect(selectedDocumentTab).toHaveAttribute('aria-current', 'page');
    expect(selectedDocumentTab).toHaveClass('after:bg-surface-submit');
    expect(selectedDocumentTab.closest('div')).not.toHaveClass('border-surface-submit');

    fireEvent.click(screen.getAllByRole('button', { name: 'com_cooking_delete_document' })[0]);
    expect(mockDeleteDocument).not.toHaveBeenCalled();
    expect(screen.getByText('com_cooking_delete_document_title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_delete' }));
    expect(mockDeleteDocument).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('keeps document tabs visible while document data is temporarily unavailable', () => {
    const guide = {
      ...draft,
      _id: 'guide-1',
      documentType: 'guide' as const,
      selected: false,
      recipe: { ...draft.recipe, title: 'Starter Guide' },
    };
    const { rerender } = render(
      <CookingWorkspace
        conversationId="convo-1"
        draft={draft}
        documents={[draft, guide]}
        documentsLoaded={true}
        selectedDocumentId={draft._id}
        markdown="# Recipe"
        isPreparingDraft={false}
      />,
    );

    rerender(
      <CookingWorkspace
        conversationId="convo-1"
        documents={[]}
        documentsLoaded={false}
        markdown="# Recipe"
        isPreparingDraft={true}
      />,
    );

    expect(screen.getByRole('button', { name: /Recipe/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Starter Guide/ })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-canvas')).toHaveTextContent('# Recipe');
  });

  it('does not retain document tabs globally across a workspace remount', () => {
    const guide = {
      ...draft,
      _id: 'remount-guide-1',
      conversationId: 'remount-convo-1',
      documentType: 'guide' as const,
      selected: false,
      recipe: { ...draft.recipe, title: 'Remount Starter Guide' },
    };
    const remountDraft = {
      ...draft,
      _id: 'remount-draft-1',
      conversationId: 'remount-convo-1',
    };
    const { unmount } = render(
      <CookingWorkspace
        conversationId="remount-convo-1"
        draft={remountDraft}
        documents={[remountDraft, guide]}
        documentsLoaded={true}
        selectedDocumentId={remountDraft._id}
        markdown="# Recipe"
        isPreparingDraft={false}
      />,
    );

    unmount();

    render(
      <CookingWorkspace
        conversationId="remount-convo-1"
        documents={[]}
        documentsLoaded={false}
        markdown=""
        isPreparingDraft={true}
      />,
    );

    expect(screen.queryByRole('button', { name: /Recipe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remount Starter Guide/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('recipe-canvas')).not.toBeInTheDocument();
  });
});
