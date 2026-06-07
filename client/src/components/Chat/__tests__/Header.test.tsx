import React from 'react';
import { render, screen } from '@testing-library/react';

const mockUseMediaQuery = jest.fn();

jest.mock('@librechat/client', () => ({
  useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
}));

jest.mock('~/components/Cooking/CookingChatContext', () => ({
  useCookingChat: () => ({ isCookingChat: true }),
}));

jest.mock('../TemporaryChat', () => ({
  TemporaryChat: () => <div data-testid="temporary-chat" />,
}));

import Header from '../Header';

describe('Chat header', () => {
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
});
