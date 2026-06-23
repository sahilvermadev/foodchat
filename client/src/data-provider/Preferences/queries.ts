import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  TUser,
  PreferencesDocument,
  SpecialtyIngredientCatalogResponse,
} from 'librechat-data-provider';
import store from '~/store';

export const usePreferencesQuery = (
  config?: UseQueryOptions<PreferencesDocument>,
): QueryObserverResult<PreferencesDocument> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  const user = useRecoilValue<TUser | undefined>(store.user);
  return useQuery<PreferencesDocument>(
    [QueryKeys.preferences],
    () => dataService.getPreferences(),
    {
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled && !!user,
    },
  );
};

export const usePreferenceIngredientsQuery = (
  query: string,
  config?: UseQueryOptions<SpecialtyIngredientCatalogResponse>,
): QueryObserverResult<SpecialtyIngredientCatalogResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  const user = useRecoilValue<TUser | undefined>(store.user);
  return useQuery<SpecialtyIngredientCatalogResponse>(
    [QueryKeys.preferenceIngredients, query.trim().toLowerCase()],
    () => dataService.listPreferenceIngredients(query),
    {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled && !!user,
    },
  );
};
