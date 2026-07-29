import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    useInView: () => false,
    useReducedMotion: () => true,
  };
});

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

  test('presents the product promise and primary recipe import action', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: 'com_landing_home' })).toHaveClass(
      'rekky-wordmark',
    );
    expect(screen.getByRole('heading', { name: 'com_landing_title' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'com_landing_import_action' })).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'com_landing_nav_label' })).toBeInTheDocument();
    expect(screen.getByText('com_landing_adaptation_request')).toBeInTheDocument();
    expect(screen.getByText('com_landing_voice_noise_status')).toBeInTheDocument();
    expect(screen.getByText('com_landing_voice_context_status')).toBeInTheDocument();
  });

  test('keeps the visitor on the page and explains an invalid source', () => {
    renderLanding();
    const input = screen.getAllByLabelText('com_landing_import_label')[0];

    fireEvent.change(input, { target: { value: 'not a recipe link' } });
    fireEvent.submit(input.closest('form')!);

    expect(screen.getByText('com_landing_import_error')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('preserves a valid source through registration and the import redirect', async () => {
    const router = renderLanding();
    const input = screen.getAllByLabelText('com_landing_import_label')[0];

    fireEvent.change(input, { target: { value: 'example.com/recipe' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/register');
    });

    const redirect = new URLSearchParams(router.state.location.search).get('redirect_to');
    expect(redirect).toBe('/imports/share?url=https%3A%2F%2Fexample.com%2Frecipe');
  });

  test('takes a signed-in cook directly to the import flow', async () => {
    mockIsAuthenticated = true;
    const router = renderLanding();
    const input = screen.getAllByLabelText('com_landing_import_label')[0];

    fireEvent.change(input, { target: { value: 'https://example.com/recipe' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/imports/share');
    });
    expect(router.state.location.search).toBe('?url=https%3A%2F%2Fexample.com%2Frecipe');
  });

  test('reveals the contextual voice response when the demo is activated', () => {
    renderLanding();
    const trigger = screen.getByRole('button', { name: 'com_landing_voice_try' });
    const response = screen.getByText('com_landing_voice_question').closest('[aria-live]');

    expect(response).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    expect(response).toHaveAttribute('aria-hidden', 'false');
  });
});
