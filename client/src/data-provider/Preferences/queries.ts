import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { PreferencesDocument } from 'librechat-data-provider';

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
