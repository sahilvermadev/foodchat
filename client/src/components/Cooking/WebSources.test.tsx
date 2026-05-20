/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { TMessage } from 'librechat-data-provider';
import WebSources from './WebSources';
import { CookingChatProvider } from './CookingChatContext';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => (key === 'com_cooking_sources' ? 'Cooking sources' : key),
}));

const message = {
  messageId: 'message-1',
  conversationId: 'conversation-1',
  parentMessageId: 'user-1',
  text: 'Use this source.',
  isCreatedByUser: false,
  metadata: {
    cookingWebSources: [
      {
        title: 'USDA Complete Guide',
        url: 'https://www.nifa.usda.gov/example',
        sourceType: 'safety',
        accessedAt: '2026-05-18T00:00:00.000Z',
      },
    ],
  },
} as TMessage;

function renderSources({
  isCookingChat = true,
  testMessage = message,
}: {
  isCookingChat?: boolean;
  testMessage?: TMessage;
} = {}) {
  render(
    <CookingChatProvider value={{ isCookingChat }}>
      <WebSources message={testMessage} />
    </CookingChatProvider>,
  );
}

describe('Cooking web sources', () => {
  test('renders cooking assistant source links from metadata', () => {
    renderSources();

    const link = screen.getByRole('link', { name: 'USDA Complete Guide' });

    expect(link).toHaveAttribute('href', 'https://www.nifa.usda.gov/example');
    expect(screen.getByLabelText('Cooking sources')).toBeInTheDocument();
  });

  test('hides sources outside cooking assistant messages', () => {
    renderSources({ isCookingChat: false });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    renderSources({ testMessage: { ...message, isCreatedByUser: true } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    renderSources({ testMessage: { ...message, metadata: {} } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
