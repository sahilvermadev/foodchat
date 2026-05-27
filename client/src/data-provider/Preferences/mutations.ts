import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  PreferencesChatRequest,
  PreferencesChatResponse,
  PreferencesDocument,
  ResolveSpecialtyIngredientRequest,
  SpecialtyIngredientCatalogItem,
  UpdatePreferencesRequest,
} from 'librechat-data-provider';

export const useUpdatePreferencesMutation = (): UseMutationResult<
  PreferencesDocument,
  unknown,
  UpdatePreferencesRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updatePreferences], {
    mutationFn: (payload: UpdatePreferencesRequest) => dataService.updatePreferences(payload),
    onSuccess: (preferences) => {
      queryClient.setQueryData([QueryKeys.preferences], preferences);
    },
  });
};

export const usePreferencesChatMutation = (): UseMutationResult<
  PreferencesChatResponse,
  unknown,
  PreferencesChatRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.preferencesChat], {
    mutationFn: (payload: PreferencesChatRequest) => dataService.chatPreferences(payload),
    onSuccess: (response) => {
      queryClient.setQueryData([QueryKeys.preferences], response.preferences);
    },
  });
};

export const useResolvePreferenceIngredientMutation = (): UseMutationResult<
  SpecialtyIngredientCatalogItem,
  unknown,
  ResolveSpecialtyIngredientRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.resolvePreferenceIngredient], {
    mutationFn: (payload: ResolveSpecialtyIngredientRequest) =>
      dataService.resolvePreferenceIngredient(payload),
    onSuccess: (ingredient) => {
      queryClient.setQueriesData<{ ingredients: SpecialtyIngredientCatalogItem[] }>(
        [QueryKeys.preferenceIngredients],
        (current) => {
          if (!current) {
            return current;
          }
          const exists = current.ingredients.some((item) => item._id === ingredient._id);
          return exists
            ? {
                ingredients: current.ingredients.map((item) =>
                  item._id === ingredient._id ? ingredient : item,
                ),
              }
            : { ingredients: [ingredient, ...current.ingredients] };
        },
      );
    },
  });
};
