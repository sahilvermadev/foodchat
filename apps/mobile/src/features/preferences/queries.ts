import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PreferencesDocument, UpdatePreferencesRequest } from 'librechat-data-provider';

import { apiFetch } from '@/lib/api/client';

export const preferenceKeys = { profile: ['preferences'] as const };

export function usePreferences() {
  return useQuery({
    queryKey: preferenceKeys.profile,
    queryFn: () => apiFetch<PreferencesDocument>('/api/preferences'),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePreferencesRequest) =>
      apiFetch<PreferencesDocument>('/api/preferences', { method: 'PUT', body: payload }),
    onSuccess: (preferences) => queryClient.setQueryData(preferenceKeys.profile, preferences),
  });
}
