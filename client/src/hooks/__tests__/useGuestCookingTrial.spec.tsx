import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useGuestCookingTrial from '../useGuestCookingTrial';

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: false, isAuthResolved: true }),
}));

const fetchMock = jest.fn();
Object.defineProperty(global, 'fetch', {
  configurable: true,
  value: fetchMock,
  writable: true,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useGuestCookingTrial', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('hydrates trial state from the server-authoritative status endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ used: true }),
    });

    const { result } = renderHook(() => useGuestCookingTrial(), { wrapper: createWrapper() });

    expect(result.current.resolved).toBe(false);
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.used).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/cooking/guest/status', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('updates shared query state after successful and failed streamed attempts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ used: false }),
    });

    const { result } = renderHook(() => useGuestCookingTrial(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.resolved).toBe(true));

    act(() => result.current.markUsed());
    await waitFor(() => expect(result.current.used).toBe(true));

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.used).toBe(false));
  });
});
