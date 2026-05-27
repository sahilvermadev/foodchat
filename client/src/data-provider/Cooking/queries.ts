import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  CookingDraft,
  ConversationCookingDocuments,
  CookingSession,
  SavedRecipe,
  SavedRecipesQuery,
  SavedRecipesResponse,
} from 'librechat-data-provider';

export const useCookingDraftByConversationQuery = (
  conversationId: string | undefined,
  config?: UseQueryOptions<CookingDraft>,
): QueryObserverResult<CookingDraft> => {
  const enabled = Boolean(conversationId);
  return useQuery<CookingDraft>(
    [QueryKeys.cookingDraft, 'conversation', conversationId],
    () => dataService.getCookingDraftByConversation(conversationId as string),
    {
      enabled: enabled && (config?.enabled ?? true),
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useCookingDocumentsByConversationQuery = (
  conversationId: string | undefined,
  config?: UseQueryOptions<ConversationCookingDocuments>,
): QueryObserverResult<ConversationCookingDocuments> => {
  const enabled = Boolean(conversationId);
  return useQuery<ConversationCookingDocuments>(
    [QueryKeys.cookingDocuments, 'conversation', conversationId],
    () => dataService.getCookingDocumentsByConversation(conversationId as string),
    {
      enabled: enabled && (config?.enabled ?? true),
      keepPreviousData: true,
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useCookingSessionQuery = (
  sessionId: string | undefined,
  config?: UseQueryOptions<CookingSession>,
): QueryObserverResult<CookingSession> => {
  const enabled = Boolean(sessionId);
  return useQuery<CookingSession>(
    [QueryKeys.cookingSession, sessionId],
    () => dataService.getCookingSession(sessionId as string),
    {
      enabled: enabled && (config?.enabled ?? true),
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useSavedRecipeByDraftQuery = (
  draftId: string | undefined,
  config?: UseQueryOptions<SavedRecipe>,
): QueryObserverResult<SavedRecipe> => {
  const enabled = Boolean(draftId);
  return useQuery<SavedRecipe>(
    [QueryKeys.recipe, 'draft', draftId],
    () => dataService.getSavedRecipeByDraft(draftId as string),
    {
      enabled: enabled && (config?.enabled ?? true),
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useRecipesQuery = (
  params: SavedRecipesQuery,
  config?: UseQueryOptions<SavedRecipesResponse>,
): QueryObserverResult<SavedRecipesResponse> => {
  return useQuery<SavedRecipesResponse>(
    [QueryKeys.recipes, params],
    () => dataService.getRecipes(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      ...config,
    },
  );
};

export const useRecipeQuery = (
  recipeId: string | undefined,
  config?: UseQueryOptions<SavedRecipe>,
): QueryObserverResult<SavedRecipe> => {
  const enabled = Boolean(recipeId);
  return useQuery<SavedRecipe>(
    [QueryKeys.recipe, recipeId],
    () => dataService.getRecipe(recipeId as string),
    {
      enabled: enabled && (config?.enabled ?? true),
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      ...config,
    },
  );
};
