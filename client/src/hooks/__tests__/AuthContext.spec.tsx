/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import type { TStartupConfig } from 'librechat-data-provider';
import type { TAuthConfig } from '~/common';

import { AuthContextProvider, useAuthContext } from '../AuthContext';
import { startupConfigKey } from '~/data-provider';
import { EXPLICIT_LOGOUT_KEY, SESSION_KEY, markExplicitLogout } from '~/utils';
import store from '~/store';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockApiBaseUrl = jest.fn(() => '');

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  setTokenHeader: jest.fn(),
  apiBaseUrl: () => mockApiBaseUrl(),
}));

let mockCapturedLoginOptions: {
  onSuccess: (...args: unknown[]) => void;
  onError: (...args: unknown[]) => void;
};

let mockCapturedLogoutOptions: {
  onSuccess: (...args: unknown[]) => void;
  onError: (...args: unknown[]) => void;
};

const mockRefreshMutate = jest.fn();
const mockLogoutMutate = jest.fn();

jest.mock('~/data-provider', () => ({
  startupConfigKey: (isAuthenticated: boolean) => ['startupConfig', isAuthenticated],
  useLoginUserMutation: jest.fn(
    (options: {
      onSuccess: (...args: unknown[]) => void;
      onError: (...args: unknown[]) => void;
    }) => {
      mockCapturedLoginOptions = options;
      return { mutate: jest.fn() };
    },
  ),
  useLogoutUserMutation: jest.fn(
    (options: {
      onSuccess: (...args: unknown[]) => void;
      onError: (...args: unknown[]) => void;
    }) => {
      mockCapturedLogoutOptions = options;
      return { mutate: mockLogoutMutate };
    },
  ),
  useRefreshTokenMutation: jest.fn(() => ({ mutate: mockRefreshMutate })),
  useGetUserQuery: jest.fn(() => ({
    data: undefined,
    isError: false,
    error: null,
  })),
  useGetRole: jest.fn(() => ({ data: null })),
  useListRoles: jest.fn(() => ({ data: undefined })),
}));

const authConfig: TAuthConfig = { loginRedirect: '/login', test: true };

function TestConsumer() {
  const ctx = useAuthContext();
  const queriesEnabled = useRecoilValue(store.queriesEnabled);
  return (
    <div
      data-testid="consumer"
      data-authenticated={ctx.isAuthenticated}
      data-auth-resolved={ctx.isAuthResolved}
      data-logging-out={ctx.isLoggingOut}
      data-queries-enabled={queriesEnabled}
      data-roles={JSON.stringify(ctx.roles ?? {})}
    >
      <button data-testid="logout" type="button" onClick={() => ctx.logout()} />
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <AuthContextProvider authConfig={authConfig}>
            <TestConsumer />
          </AuthContextProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

/** Renders without test:true so silentRefresh actually runs */
function renderProviderLive() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <AuthContextProvider authConfig={{ loginRedirect: '/login' }}>
            <TestConsumer />
          </AuthContextProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('AuthContextProvider — login onError redirect handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/login');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('preserves a valid redirect_to param across login failure', () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Fc%2Fabc123');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect_to=%2Fc%2Fabc123', {
      replace: true,
    });
  });

  it('drops redirect_to when it contains an absolute URL (open-redirect prevention)', () => {
    window.history.replaceState({}, '', '/login?redirect_to=https%3A%2F%2Fevil.com');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('drops redirect_to when it points to /login (recursive redirect prevention)', () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Flogin');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('navigates to plain /login when no redirect_to param exists', () => {
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Server error' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('preserves redirect_to with query params and hash', () => {
    const target = '/c/abc123?model=gpt-4#section';
    window.history.replaceState({}, '', `/login?redirect_to=${encodeURIComponent(target)}`);

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    const navigatedUrl = mockNavigate.mock.calls[0][0] as string;
    const params = new URLSearchParams(navigatedUrl.split('?')[1]);
    expect(decodeURIComponent(params.get('redirect_to')!)).toBe(target);
  });
});

describe('AuthContextProvider — login success navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
  });

  afterEach(() => {
    jest.useRealTimers();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('navigates a regular login to a safe deep link', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/login?redirect_to=%2Frecipes%2Frecipe-1');
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        user: { id: '1', role: 'USER' },
        token: 'token',
      });
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/recipes/recipe-1', { replace: true });
  });

  it('routes a pending second factor to the public 2FA screen', () => {
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        twoFAPending: true,
        tempToken: 'temporary+token',
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login/2fa?tempToken=temporary%2Btoken', {
      replace: true,
    });
  });
});

describe('AuthContextProvider — logout onSuccess/onError handling', () => {
  const mockSetTokenHeader = jest.requireMock('librechat-data-provider').setTokenHeader;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/c/some-chat');
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('immediately leaves the protected route while server revocation is pending', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        user: { id: '1', role: 'USER' },
        token: 'token',
      });
      jest.advanceTimersByTime(100);
    });
    mockNavigate.mockClear();

    act(() => {
      getByTestId('logout').click();
    });

    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
    expect(getByTestId('consumer')).toHaveAttribute('data-logging-out', 'true');
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('immediately restores public queries and preserves startup config for landing auth', () => {
    jest.useFakeTimers();
    const { getByTestId, queryClient } = renderProvider();
    const startupConfig = {
      emailLoginEnabled: true,
      registrationEnabled: true,
    } as TStartupConfig;

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        user: { id: '1', role: 'USER' },
        token: 'token',
      });
      jest.advanceTimersByTime(100);
    });
    queryClient.setQueryData(startupConfigKey(false), startupConfig);

    act(() => {
      getByTestId('logout').click();
    });

    expect(getByTestId('consumer')).toHaveAttribute('data-queries-enabled', 'true');
    expect(queryClient.getQueryData(startupConfigKey(false))).toBe(startupConfig);
  });

  it('signs out this tab when another tab broadcasts an explicit logout', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        user: { id: '1', role: 'USER' },
        token: 'token',
      });
      jest.advanceTimersByTime(100);
    });
    mockNavigate.mockClear();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: EXPLICIT_LOGOUT_KEY, newValue: Date.now().toString() }),
      );
    });

    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('cannot be signed back in by a pending authentication update', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        user: { id: '1', role: 'USER' },
        token: 'token',
      });
      getByTestId('logout').click();
      jest.advanceTimersByTime(100);
    });

    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
    expect(mockNavigate).toHaveBeenLastCalledWith('/', { replace: true });
  });

  it('calls window.location.replace and setTokenHeader(undefined) when redirect is present', () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({
        message: 'Logout successful',
        redirect: 'https://idp.example.com/logout?id_token_hint=abc',
      });
    });

    expect(replaceSpy).toHaveBeenCalledWith('https://idp.example.com/logout?id_token_hint=abc');
    expect(mockSetTokenHeader).toHaveBeenCalledWith(undefined);
  });

  it('does not call window.location.replace when redirect is absent', async () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({ message: 'Logout successful' });
    });

    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('does not trigger silentRefresh after OIDC redirect', () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProviderLive();
    mockRefreshMutate.mockClear();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({
        message: 'Logout successful',
        redirect: 'https://idp.example.com/logout?id_token_hint=abc',
      });
    });

    expect(replaceSpy).toHaveBeenCalled();
    expect(mockRefreshMutate).not.toHaveBeenCalled();
  });
});

describe('AuthContextProvider — silentRefresh post-login redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('navigates to stored sessionStorage redirect after successful token refresh', () => {
    jest.useFakeTimers();
    sessionStorage.setItem(SESSION_KEY, '/c/new?endpoint=bedrock&model=claude-sonnet-4-6');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new?endpoint=bedrock&model=claude-sonnet-4-6', {
      replace: true,
    });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    jest.useRealTimers();
  });

  it('does not silently restore a session after an explicit logout', () => {
    markExplicitLogout();

    const { getByTestId } = renderProviderLive();

    expect(mockRefreshMutate).not.toHaveBeenCalled();
    expect(getByTestId('consumer')).toHaveAttribute('data-auth-resolved', 'true');
    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
  });

  it('does not expose a guest state while the initial refresh is pending', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderProviderLive();
    const consumer = getByTestId('consumer');

    expect(consumer.getAttribute('data-authenticated')).toBe('false');
    expect(consumer.getAttribute('data-auth-resolved')).toBe('false');

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
      jest.advanceTimersByTime(100);
    });

    expect(consumer.getAttribute('data-authenticated')).toBe('true');
    expect(consumer.getAttribute('data-auth-resolved')).toBe('true');
    jest.useRealTimers();
  });

  it('resolves as unauthenticated when refresh returns no token', () => {
    const { getByTestId } = renderProviderLive();
    const consumer = getByTestId('consumer');
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess(undefined);
    });

    expect(consumer.getAttribute('data-authenticated')).toBe('false');
    expect(consumer.getAttribute('data-auth-resolved')).toBe('true');
  });

  it('navigates to current URL when no stored redirect exists', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/c/new');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    jest.useRealTimers();
  });

  it('does not re-trigger silentRefresh after successful redirect', () => {
    jest.useFakeTimers();
    sessionStorage.setItem(SESSION_KEY, '/c/abc?endpoint=bedrock');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];
    mockRefreshMutate.mockClear();

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/c/abc?endpoint=bedrock', { replace: true });
    expect(mockRefreshMutate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('falls back to current URL for unsafe stored redirect', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/c/new');
    sessionStorage.setItem(SESSION_KEY, 'https://evil.com/steal');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith('https://evil.com/steal', expect.anything());
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — silentRefresh subdirectory deployment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockApiBaseUrl.mockReturnValue('/chat');
  });

  afterEach(() => {
    mockApiBaseUrl.mockReturnValue('');
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('strips base path from window.location.pathname before navigating (prevents /chat/chat doubling)', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/chat/c/abc123?model=gpt-4');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/abc123?model=gpt-4', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/chat/c/'),
      expect.anything(),
    );
    jest.useRealTimers();
  });

  it('falls back to root when window.location.pathname equals the base path', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/chat');

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — logout error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/c/some-chat');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('clears auth state on logout error without external redirect', () => {
    jest.useFakeTimers();
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});
    const { getByTestId } = renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onError(new Error('Logout failed'));
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(getByTestId('consumer').getAttribute('data-authenticated')).toBe('false');
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — custom role detection and fetching', () => {
  const mockUseGetRole = jest.requireMock('~/data-provider').useGetRole;
  const staffPermissions = {
    name: 'STAFF',
    permissions: { PROMPTS: { USE: true, CREATE: false } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('calls useGetRole with the custom role name and enabled: true for custom role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'STAFF' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const staffCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === 'STAFF');
    expect(staffCalls.length).toBeGreaterThan(0);
    const lastStaffCall = staffCalls[staffCalls.length - 1];
    expect(lastStaffCall[1]).toEqual(expect.objectContaining({ enabled: true }));

    jest.useRealTimers();
  });

  it('calls useGetRole with enabled: false for USER role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const sentinelCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === '_');
    expect(sentinelCalls.length).toBeGreaterThan(0);
    for (const call of sentinelCalls) {
      expect(call[1]).toEqual(expect.objectContaining({ enabled: false }));
    }

    jest.useRealTimers();
  });

  it('calls useGetRole with enabled: false for ADMIN role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'ADMIN' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const sentinelCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === '_');
    expect(sentinelCalls.length).toBeGreaterThan(0);
    for (const call of sentinelCalls) {
      expect(call[1]).toEqual(expect.objectContaining({ enabled: false }));
    }

    jest.useRealTimers();
  });

  it('includes custom role data in the roles context map when loaded', () => {
    jest.useFakeTimers();
    mockUseGetRole.mockImplementation((name: string, opts?: { enabled?: boolean }) => {
      if (name === 'STAFF' && opts?.enabled) {
        return { data: staffPermissions };
      }
      return { data: null };
    });

    const { getByTestId } = renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'STAFF' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const rolesAttr = getByTestId('consumer').getAttribute('data-roles') ?? '{}';
    const roles = JSON.parse(rolesAttr);
    expect(roles).toHaveProperty('STAFF');
    expect(roles.STAFF).toEqual(staffPermissions);

    mockUseGetRole.mockReturnValue({ data: null });
    jest.useRealTimers();
  });
});
