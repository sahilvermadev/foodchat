import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseMediaQuery = jest.fn();
let mockIsAuthenticated = true;

jest.mock('@librechat/client', () => ({
  useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: mockIsAuthenticated }),
  useHasAccess: () => false,
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Cooking/CookingChatContext', () => ({
  useCookingChat: () => ({ isCookingChat: true }),
}));

jest.mock('../TemporaryChat', () => ({
  TemporaryChat: () => <div data-testid="temporary-chat" />,
}));

import Header from '../Header';

describe('Chat header', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
  });

  it('leaves mobile navigation ownership to the application shell', () => {
    mockUseMediaQuery.mockReturnValue(true);

    render(<Header />);

    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });

  it('does not duplicate the sidebar trigger on larger screens', () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(<Header />);

    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });

  it('opens the guest auth dialog from the login button', () => {
    mockIsAuthenticated = false;
    mockUseMediaQuery.mockReturnValue(false);

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_auth_login' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('com_cooking_guest_auth_title')).toBeInTheDocument();
  });
});
