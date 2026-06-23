import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiBaseUrl } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

export const guestTrialQueryKey = ['guestCookingTrial'];

type GuestTrialStatus = {
  used: boolean;
};

async function getGuestTrialStatus(): Promise<GuestTrialStatus> {
  const response = await fetch(`${apiBaseUrl()}/api/cooking/guest/status`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error('Unable to load guest trial status.');
  }
  return response.json() as Promise<GuestTrialStatus>;
}

export default function useGuestCookingTrial() {
  const { isAuthenticated, isAuthResolved } = useAuthContext();
  const queryClient = useQueryClient();
  const statusQuery = useQuery<GuestTrialStatus>({
    queryKey: guestTrialQueryKey,
    queryFn: getGuestTrialStatus,
    enabled: isAuthResolved && !isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const markUsed = useCallback(() => {
    queryClient.setQueryData<GuestTrialStatus>(guestTrialQueryKey, { used: true });
  }, [queryClient]);

  const reset = useCallback(() => {
    queryClient.setQueryData<GuestTrialStatus>(guestTrialQueryKey, { used: false });
  }, [queryClient]);

  return {
    used: !isAuthenticated && statusQuery.data?.used === true,
    resolved: isAuthenticated || (statusQuery.isSuccess && !statusQuery.isFetching),
    markUsed,
    reset,
  };
}
