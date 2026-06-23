import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { TAuthContext } from '~/common';
import Root from '../Root';

const mockAuthContext: Pick<TAuthContext, 'isAuthenticated' | 'isAuthResolved' | 'logout'> = {
  isAuthenticated: false,
  isAuthResolved: false,
  logout: jest.fn(),
};

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => false,
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockAuthContext,
  useFileMap: () => new Map(),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: {} }),
  useHealthCheck: jest.fn(),
  useUserTermsQuery: () => ({ data: undefined }),
}));

jest.mock('~/components/UnifiedSidebar', () => ({
  UnifiedSidebar: () => <div data-testid="sidebar" />,
}));

jest.mock('~/components/ui', () => ({
  TermsAndConditionsModal: () => null,
}));

jest.mock('~/components/Banners', () => ({
  Banner: () => null,
}));

jest.mock('~/components/System/LocationWeather', () => () => null);
jest.mock('~/components/Onboarding/Tour', () => () => null);

function renderRoot() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Root />,
        children: [{ path: 'cook', element: <div data-testid="route-content" /> }],
      },
    ],
    { initialEntries: ['/cook'] },
  );

  return render(
    <RecoilRoot>
      <RouterProvider router={router} />
    </RecoilRoot>,
  );
}

describe('Root auth resolution', () => {
  test('does not render guest application content while session refresh is pending', () => {
    renderRoot();

    expect(screen.getByRole('status', { name: 'com_ui_loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('route-content')).not.toBeInTheDocument();
  });
});
