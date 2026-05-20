import type { TMessage } from 'librechat-data-provider';
import { shouldKeepOptimisticMessages } from './queries';

const message = (overrides: Partial<TMessage>): TMessage =>
  ({
    messageId: 'message-1',
    isCreatedByUser: true,
    text: 'hello',
    error: false,
    children: [],
    ...overrides,
  }) as TMessage;

describe('shouldKeepOptimisticMessages', () => {
  test('keeps cache when server returns an older list during an optimistic assistant placeholder', () => {
    const fetchedMessages = [
      message({ messageId: 'old-user', text: 'old question' }),
      message({ messageId: 'old-assistant', isCreatedByUser: false, text: 'old answer' }),
    ];
    const currentMessages = [
      ...fetchedMessages,
      message({ messageId: 'new-user', text: 'new question' }),
      message({ messageId: 'new-user_', isCreatedByUser: false, text: '' }),
    ];

    expect(shouldKeepOptimisticMessages({ fetchedMessages, currentMessages })).toBe(true);
  });

  test('accepts fetched messages when no optimistic assistant placeholder is present', () => {
    const fetchedMessages = [message({ messageId: 'old-user' })];
    const currentMessages = [
      ...fetchedMessages,
      message({ messageId: 'saved-assistant', isCreatedByUser: false, text: 'saved answer' }),
    ];

    expect(shouldKeepOptimisticMessages({ fetchedMessages, currentMessages })).toBe(false);
  });
});
