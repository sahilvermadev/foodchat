import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  CookingDraft,
  CookingSession,
  CookingSessionEvent,
  GenerateCookingDraftRequest,
  SavedRecipe,
  SaveRecipeRequest,
  UpdateCookingDraftRequest,
  UpdateSavedRecipeRequest,
  StartCookingSessionRequest,
  CompleteCookingSessionRequest,
} from 'librechat-data-provider';

export const useGenerateCookingDraftMutation = (): UseMutationResult<
  CookingDraft,
  unknown,
  GenerateCookingDraftRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.generateCookingDraft], {
    mutationFn: (payload: GenerateCookingDraftRequest) => dataService.generateCookingDraft(payload),
    onSuccess: (draft) => {
      if (draft.conversationId) {
        queryClient.setQueryData(
          [QueryKeys.cookingDraft, 'conversation', draft.conversationId],
          draft,
        );
      }
      queryClient.setQueryData([QueryKeys.cookingDraft, draft._id], draft);
    },
  });
};

export const useUpdateCookingDraftMutation = (): UseMutationResult<
  CookingDraft,
  unknown,
  { draftId: string; payload: UpdateCookingDraftRequest }
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updateCookingDraft], {
    mutationFn: ({ draftId, payload }) => dataService.updateCookingDraft(draftId, payload),
    onSuccess: (draft) => {
      queryClient.setQueryData([QueryKeys.cookingDraft, draft._id], draft);
      if (draft.conversationId) {
        queryClient.setQueryData(
          [QueryKeys.cookingDraft, 'conversation', draft.conversationId],
          draft,
        );
      }
    },
  });
};

export const useStartCookingSessionMutation = (): UseMutationResult<
  CookingSession,
  unknown,
  StartCookingSessionRequest
> => {
  return useMutation([MutationKeys.startCookingSession], {
    mutationFn: (payload: StartCookingSessionRequest) => dataService.startCookingSession(payload),
  });
};

export const useAppendCookingSessionEventMutation = (): UseMutationResult<
  CookingSession,
  unknown,
  { sessionId: string; event: CookingSessionEvent }
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.appendCookingSessionEvent], {
    mutationFn: ({ sessionId, event }) => dataService.appendCookingSessionEvent(sessionId, event),
    onSuccess: (session) => {
      queryClient.setQueryData([QueryKeys.cookingSession, session._id], session);
    },
  });
};

export const useCompleteCookingSessionMutation = (): UseMutationResult<
  CookingSession,
  unknown,
  { sessionId: string; payload: CompleteCookingSessionRequest }
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.completeCookingSession], {
    mutationFn: ({ sessionId, payload }) => dataService.completeCookingSession(sessionId, payload),
    onSuccess: (session) => {
      queryClient.setQueryData([QueryKeys.cookingSession, session._id], session);
    },
  });
};

export const useSaveRecipeMutation = (): UseMutationResult<
  SavedRecipe,
  unknown,
  SaveRecipeRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.saveRecipe], {
    mutationFn: (payload: SaveRecipeRequest) => dataService.saveRecipe(payload),
    onSuccess: (recipe) => {
      queryClient.setQueryData([QueryKeys.recipe, recipe._id], recipe);
      if (recipe.sourceDraftId) {
        queryClient.setQueryData([QueryKeys.recipe, 'draft', recipe.sourceDraftId], recipe);
      }
      queryClient.invalidateQueries([QueryKeys.recipes]);
    },
  });
};

export const useUpdateSavedRecipeMutation = (): UseMutationResult<
  SavedRecipe,
  unknown,
  { recipeId: string; payload: UpdateSavedRecipeRequest }
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updateSavedRecipe], {
    mutationFn: ({ recipeId, payload }) => dataService.updateSavedRecipe(recipeId, payload),
    onSuccess: (recipe) => {
      queryClient.setQueryData([QueryKeys.recipe, recipe._id], recipe);
      if (recipe.sourceDraftId) {
        queryClient.setQueryData([QueryKeys.recipe, 'draft', recipe.sourceDraftId], recipe);
      }
      queryClient.invalidateQueries([QueryKeys.recipes]);
    },
  });
};
