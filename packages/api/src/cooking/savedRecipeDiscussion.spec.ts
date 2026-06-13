import type { CookingDraft } from 'librechat-data-provider';
import {
  SavedRecipeDiscussionRollbackError,
  startSavedRecipeDiscussion,
} from './savedRecipeDiscussion';

const document: CookingDraft = {
  _id: 'document-1',
  user: 'user-1',
  conversationId: 'conversation-1',
  prompt: 'Discuss this recipe',
  status: 'active',
  documentType: 'recipe',
  selected: true,
  recipe: {
    title: 'Saved recipe',
    description: '',
    servings: 2,
    timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '1 item',
        item: 'item',
        quantityType: 'estimated',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Cook.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
    ],
    notes: [],
    tags: [],
  },
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z',
};

function dependencies(owned = true) {
  return {
    recipeIsOwned: jest.fn().mockResolvedValue(owned),
    createDocument: jest.fn().mockResolvedValue(document),
    deleteDocument: jest.fn().mockResolvedValue({ documents: [] }),
  };
}

const input = {
  user: 'user-1',
  savedRecipeId: '665f1f77bcf86cd799439011',
  conversationId: 'conversation-1',
  prompt: 'Discuss this recipe',
  title: 'Discuss this recipe',
  documentType: 'recipe' as const,
};

describe('startSavedRecipeDiscussion', () => {
  test('verifies ownership, creates the document, and persists recipe provenance', async () => {
    const deps = dependencies();
    const persistConversation = jest.fn().mockResolvedValue(undefined);

    await expect(startSavedRecipeDiscussion(input, persistConversation, deps)).resolves.toBe(
      document,
    );

    expect(persistConversation).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      endpoint: 'agents',
      title: 'Discuss this recipe',
      cookingCategory: 'saved_recipe',
      savedRecipeId: '665f1f77bcf86cd799439011',
    });
    expect(deps.deleteDocument).not.toHaveBeenCalled();
  });

  test('does not create anything when the recipe is not owned', async () => {
    const deps = dependencies(false);
    const persistConversation = jest.fn();

    await expect(startSavedRecipeDiscussion(input, persistConversation, deps)).resolves.toBeNull();

    expect(deps.createDocument).not.toHaveBeenCalled();
    expect(persistConversation).not.toHaveBeenCalled();
  });

  test('removes the new document when conversation persistence fails', async () => {
    const deps = dependencies();
    const persistenceError = new Error('conversation write failed');

    await expect(
      startSavedRecipeDiscussion(input, jest.fn().mockRejectedValue(persistenceError), deps),
    ).rejects.toBe(persistenceError);

    expect(deps.deleteDocument).toHaveBeenCalledWith('user-1', 'document-1');
  });

  test('preserves both failures when persistence and rollback fail', async () => {
    const deps = dependencies();
    const persistenceError = new Error('conversation write failed');
    const rollbackError = new Error('document rollback failed');
    deps.deleteDocument.mockRejectedValue(rollbackError);

    const result = startSavedRecipeDiscussion(
      input,
      jest.fn().mockRejectedValue(persistenceError),
      deps,
    );

    await expect(result).rejects.toMatchObject({
      name: 'SavedRecipeDiscussionRollbackError',
      persistenceError,
      rollbackError,
    } satisfies Partial<SavedRecipeDiscussionRollbackError>);
  });
});
