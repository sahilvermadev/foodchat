import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import LandingPage from './LandingPage';

let mockIsAuthenticated = false;

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: mockIsAuthenticated }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

function renderLanding() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <LandingPage /> },
      { path: '/register', element: <div data-testid="registration" /> },
      { path: '/login', element: <div /> },
      { path: '/cook', element: <div /> },
      { path: '/imports/share', element: <div data-testid="import" /> },
    ],
    { initialEntries: ['/'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('LandingPage', () => {
  beforeEach(() => {
    mockIsAuthenticated = false;
  });

  test('presents the product promise and primary entry action', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: 'com_landing_home' })).toHaveClass('rekky-wordmark');
    expect(screen.getByRole('heading', { name: 'com_landing_title' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'com_landing_nav_label' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'com_auth_login' })).toHaveAttribute(
      'href',
      '/?auth=login',
    );
    expect(screen.getByRole('link', { name: 'com_landing_get_app' })).toHaveAttribute(
      'href',
      '#get-the-app',
    );
    expect(screen.getByRole('link', { name: 'com_landing_close_action' })).toHaveAttribute(
      'href',
      '/?auth=register',
    );
    expect(screen.getByText('com_landing_change_request')).toBeInTheDocument();
    expect(screen.getByTestId('landing-adjustment-graphic')).toBeInTheDocument();
    expect(screen.getByText('com_landing_change_equipment_after')).toBeInTheDocument();
    expect(screen.getByText('com_landing_change_ingredient_after')).toBeInTheDocument();
    expect(screen.getByText('com_landing_change_servings_after')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'com_landing_mobile_canvas_alt' })).toHaveAttribute(
      'src',
      '/assets/landing/rekky-mobile-recipe.webp',
    );
    expect(screen.getByRole('region', { name: 'com_landing_carousel_label' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(screen.getByRole('img', { name: 'com_landing_hero_image_alt' })).toHaveAttribute(
      'loading',
      'eager',
    );
    expect(screen.getAllByRole('button', { name: /com_landing_carousel_slide/ })).toHaveLength(4);
    expect(screen.getByTestId('landing-hero-illustration')).toContainHTML('rekky-hero-eggplant');
    expect(screen.getByTestId('landing-web-to-phone-illustration')).toContainHTML(
      'rekky-phone-drawing',
    );
    expect(screen.getByRole('link', { name: 'com_landing_no_link' })).toHaveAttribute(
      'href',
      '/cook',
    );
    expect(screen.getByRole('img', { name: 'com_landing_voice_image_alt' })).toHaveAttribute(
      'loading',
      'lazy',
    );
  });

  test('takes a signed-in visitor into Rekky instead of showing the login link', () => {
    mockIsAuthenticated = true;
    renderLanding();

    expect(screen.getByRole('link', { name: 'com_landing_open' })).toHaveAttribute('href', '/cook');
    expect(screen.queryByRole('link', { name: 'com_auth_login' })).not.toBeInTheDocument();
  });

  test('opens login through client-side navigation', async () => {
    const router = renderLanding();

    await userEvent.click(screen.getByRole('link', { name: 'com_auth_login' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?auth=login');
  });

  test('lets visitors move through the hero dishes manually', async () => {
    renderLanding();

    expect(screen.getByRole('img', { name: 'com_landing_hero_image_alt' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'com_landing_carousel_next' }));

    expect(screen.getByRole('img', { name: 'com_landing_hero_noodles_alt' })).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'com_landing_hero_image_alt' }),
    ).not.toBeInTheDocument();
  });
});
