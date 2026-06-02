/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RecoilRoot, useRecoilValue } from 'recoil';
import StartupLayout from '~/routes/Layouts/Startup';
import { SESSION_KEY } from '~/utils';
import store from '~/store';

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({
    data: null,
    isFetching: false,
    error: null,
  })),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => (key: string) => key),
  TranslationKeys: {},
}));

jest.mock('~/components/Auth/AuthLayout', () => {
  return function MockAuthLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="auth-layout">{children}</div>;
  };
});

function ChildRoute() {
  return <div data-testid="child-route">Child</div>;
}

function CookingWorkspace() {
  return <div data-testid="cooking-workspace">Cooking Workspace</div>;
}

const createTestRouter = (initialEntry: string, isAuthenticated: boolean) =>
  createMemoryRouter(
    [
      {
        path: '/login',
        element: <StartupLayout isAuthenticated={isAuthenticated} />,
        children: [{ index: true, element: <ChildRoute /> }],
      },
      {
        path: '/cook',
        element: <CookingWorkspace />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

function renderRouter(router: ReturnType<typeof createTestRouter>, queriesEnabled = true) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.queriesEnabled, queriesEnabled)}>
      <RouterProvider router={router} />
    </RecoilRoot>,
  );
}

describe('StartupLayout — redirect race condition', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    jest.restoreAllMocks();
  });

  it('navigates to /cook when authenticated with no pending redirect', async () => {
    window.history.replaceState({}, '', '/login');

    const router = createTestRouter('/login', true);
    renderRouter(router);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cook');
    });
  });

  it('does NOT navigate to /c/new when redirect_to URL param is present', async () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Fc%2Fabc123');

    const router = createTestRouter('/login?redirect_to=%2Fc%2Fabc123', true);
    renderRouter(router);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(router.state.location.pathname).toBe('/login');
  });

  it('does NOT navigate to /c/new when sessionStorage redirect is present', async () => {
    window.history.replaceState({}, '', '/login');
    sessionStorage.setItem(SESSION_KEY, '/c/abc123');

    const router = createTestRouter('/login', true);
    renderRouter(router);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(router.state.location.pathname).toBe('/login');
  });

  it('does NOT navigate when not authenticated', async () => {
    window.history.replaceState({}, '', '/login');

    const router = createTestRouter('/login', false);
    renderRouter(router);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(router.state.location.pathname).toBe('/login');
  });

  it('re-enables startup queries after logout disables authenticated queries', async () => {
    const observed: boolean[] = [];
    const router = createTestRouter('/login', false);

    function QueriesObserver() {
      observed.push(useRecoilValue(store.queriesEnabled));
      return null;
    }

    render(
      <RecoilRoot initializeState={({ set }) => set(store.queriesEnabled, false)}>
        <QueriesObserver />
        <RouterProvider router={router} />
      </RecoilRoot>,
    );

    await waitFor(() => {
      expect(observed).toContain(true);
    });
  });
});
