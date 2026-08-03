import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { ContextualAuthLink } from '../flow';
import PublicAuthHost from '../PublicAuthHost';

const mockLabels = {
  forgot: 'forgot-form',
  login: 'show-register',
  open: 'open-login',
  page: 'public-page',
  register: 'registration-form',
  twoFactor: 'two-factor-form',
};

const mockUseGetStartupConfig = jest.fn(
  (): {
    data: {
      emailLoginEnabled: boolean;
      registrationEnabled: boolean;
      socialLoginEnabled: boolean;
    } | null;
    error: null;
    isFetching: boolean;
  } => ({
    data: {
      emailLoginEnabled: true,
      registrationEnabled: true,
      socialLoginEnabled: false,
    },
    error: null,
    isFetching: false,
  }),
);

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as typeof global.Request;
}

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('../Login', () => ({
  __esModule: true,
  default: function MockLogin() {
    const { useAuthFlow } = jest.requireActual('../flow') as typeof import('../flow');
    const flow = useAuthFlow();
    return <button onClick={() => flow.setMode('register')}>{mockLabels.login}</button>;
  },
}));

jest.mock('../Registration', () => ({
  __esModule: true,
  default: () => <div>{mockLabels.register}</div>,
}));

jest.mock('../RequestPasswordReset', () => ({
  __esModule: true,
  default: () => <div>{mockLabels.forgot}</div>,
}));

jest.mock('../TwoFactorScreen', () => ({
  __esModule: true,
  default: () => <div>{mockLabels.twoFactor}</div>,
}));

function PublicPage() {
  const location = useLocation();
  return (
    <main>
      <span>{mockLabels.page}</span>
      <ContextualAuthLink mode="login">{mockLabels.open}</ContextualAuthLink>
      <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
      <Outlet />
    </main>
  );
}

function renderHost(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      {
        element: <PublicAuthHost />,
        children: [{ path: '/', element: <PublicPage /> }],
      },
    ],
    { initialEntries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('PublicAuthHost', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        emailLoginEnabled: true,
        registrationEnabled: true,
        socialLoginEnabled: false,
      },
      error: null,
      isFetching: false,
    });
  });

  test('keeps a stable loading form while startup configuration is absent', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: null,
      error: null,
      isFetching: false,
    });

    renderHost(['/?auth=login']);

    expect(screen.getByRole('heading', { name: 'com_auth_welcome_back' })).toBeInTheDocument();
    expect(screen.getByTestId('auth-card')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('auth-form-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'show-register' })).not.toBeInTheDocument();
  });

  test('opens from a direct modal URL and closes without leaving the public page', async () => {
    const router = renderHost(['/?campaign=summer&auth=login#recipes']);

    expect(screen.getByText('public-page')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('rekky-public-auth');
    expect(screen.getByTestId('auth-card')).toHaveClass('rekky-public-auth-card');
    expect(screen.getByRole('heading', { name: 'com_auth_welcome_back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?campaign=summer');
    expect(router.state.location.hash).toBe('#recipes');
  });

  test('replaces modal modes without adding another history entry', async () => {
    const router = renderHost(['/']);

    await userEvent.click(screen.getByRole('link', { name: 'open-login' }));

    await userEvent.click(screen.getByRole('button', { name: 'show-register' }));

    expect(router.state.location.search).toBe('?auth=register');
    expect(screen.getByText('registration-form')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:bottom-auto',
      'sm:h-auto',
      'sm:max-h-[calc(100dvh-2rem)]',
      'sm:right-auto',
    );
    expect(screen.getByTestId('auth-card')).not.toHaveClass('h-full');

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    expect(router.state.location.search).toBe('');
  });
});
