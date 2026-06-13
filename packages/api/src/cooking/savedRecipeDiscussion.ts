import type { CookingDocumentType, CookingDraft, StructuredRecipe } from 'librechat-data-provider';
import { ownsRecipe } from '../recipes/service';
import { createCookingDocument, deleteCookingDocument } from './service';

export type SavedRecipeConversation = {
  conversationId: string;
  endpoint: 'agents';
  title: string;
  cookingCategory: 'saved_recipe';
  savedRecipeId: string;
};

type StartSavedRecipeDiscussionInput = {
  user: string;
  savedRecipeId: string;
  conversationId: string;
  prompt: string;
  title: string;
  documentMarkdown?: string;
  documentType?: CookingDocumentType;
  recipe?: StructuredRecipe;
};

type SavedRecipeDiscussionDependencies = {
  recipeIsOwned: (user: string, recipeId: string) => Promise<boolean>;
  createDocument: typeof createCookingDocument;
  deleteDocument: typeof deleteCookingDocument;
};

const defaultDependencies: SavedRecipeDiscussionDependencies = {
  recipeIsOwned: ownsRecipe,
  createDocument: createCookingDocument,
  deleteDocument: deleteCookingDocument,
};

export class SavedRecipeDiscussionRollbackError extends Error {
  constructor(
    readonly persistenceError: unknown,
    readonly rollbackError: unknown,
  ) {
    super('Saved recipe discussion failed and its document could not be rolled back.');
    this.name = 'SavedRecipeDiscussionRollbackError';
  }
}

export async function startSavedRecipeDiscussion(
  input: StartSavedRecipeDiscussionInput,
  persistConversation: (conversation: SavedRecipeConversation) => Promise<unknown>,
  dependencies: SavedRecipeDiscussionDependencies = defaultDependencies,
): Promise<CookingDraft | null> {
  const owned = await dependencies.recipeIsOwned(input.user, input.savedRecipeId);
  if (!owned) {
    return null;
  }

  const document = await dependencies.createDocument(
    input.user,
    input.prompt,
    input.conversationId,
    input.documentMarkdown,
    input.documentType,
    input.recipe,
  );

  try {
    await persistConversation({
      conversationId: input.conversationId,
      endpoint: 'agents',
      title: input.title,
      cookingCategory: 'saved_recipe',
      savedRecipeId: input.savedRecipeId,
    });
  } catch (persistenceError) {
    try {
      await dependencies.deleteDocument(input.user, document._id);
    } catch (rollbackError) {
      throw new SavedRecipeDiscussionRollbackError(persistenceError, rollbackError);
    }
    throw persistenceError;
  }

  return document;
}
