import React from 'react';
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
    expect(screen.getByRole('link', { name: 'com_auth_login' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'com_landing_get_app' })).toHaveAttribute(
      'href',
      '#get-the-app',
    );
    expect(screen.getByRole('link', { name: 'com_landing_close_action' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByText('com_landing_change_request')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'com_landing_mobile_canvas_alt' })).toHaveAttribute(
      'src',
      '/assets/landing/rekky-mobile-recipe.webp',
    );
    expect(screen.getByRole('img', { name: 'com_landing_hero_image_alt' })).toBeInTheDocument();
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
});
