/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { TMessage } from 'librechat-data-provider';
import PromptSuggestions from './PromptSuggestions';
import { CookingChatProvider } from './CookingChatContext';

const message = {
  messageId: 'message-1',
  conversationId: 'conversation-1',
  parentMessageId: 'user-1',
  text: 'Try this.',
  isCreatedByUser: false,
  metadata: {
    cookingPromptSuggestions: [
      'How should I prep this for a weeknight dinner?',
      'What texture cues should I watch for?',
    ],
  },
} as TMessage;

function renderSuggestions({
  isCookingChat = true,
  isLatestMessage = true,
  isSubmitting = false,
  ask = jest.fn(),
  testMessage = message,
}: {
  isCookingChat?: boolean;
  isLatestMessage?: boolean;
  isSubmitting?: boolean;
  ask?: jest.Mock;
  testMessage?: TMessage;
} = {}) {
  render(
    <CookingChatProvider value={{ isCookingChat }}>
      <PromptSuggestions
        ask={ask}
        message={testMessage}
        isLatestMessage={isLatestMessage}
        isSubmitting={isSubmitting}
      />
    </CookingChatProvider>,
  );
  return ask;
}

describe('Cooking prompt suggestions', () => {
  test('renders latest cooking assistant suggestions and submits exact visible text', () => {
    const ask = renderSuggestions();
    const chip = screen.getByRole('button', {
      name: 'How should I prep this for a weeknight dinner?',
    });

    fireEvent.click(chip);

    expect(ask).toHaveBeenCalledWith({ text: 'How should I prep this for a weeknight dinner?' });
  });

  test('hides suggestions outside latest idle cooking assistant messages', () => {
    renderSuggestions({ isLatestMessage: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    renderSuggestions({ isSubmitting: true });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    renderSuggestions({ isCookingChat: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    renderSuggestions({ testMessage: { ...message, isCreatedByUser: true } });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
