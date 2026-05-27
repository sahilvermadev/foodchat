import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  PreferencesDocument,
  SpecialtyIngredientCatalogResponse,
} from 'librechat-data-provider';

export const usePreferencesQuery = (
  config?: UseQueryOptions<PreferencesDocument>,
): QueryObserverResult<PreferencesDocument> => {
  return useQuery<PreferencesDocument>(
    [QueryKeys.preferences],
    () => dataService.getPreferences(),
    {
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const usePreferenceIngredientsQuery = (
  query: string,
  config?: UseQueryOptions<SpecialtyIngredientCatalogResponse>,
): QueryObserverResult<SpecialtyIngredientCatalogResponse> => {
  return useQuery<SpecialtyIngredientCatalogResponse>(
    [QueryKeys.preferenceIngredients, query.trim().toLowerCase()],
    () => dataService.listPreferenceIngredients(query),
    {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      ...config,
    },
  );
};
