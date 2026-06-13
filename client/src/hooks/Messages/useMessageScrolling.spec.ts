import type { TMessage } from 'librechat-data-provider';

import { latestCookingAssistantMessageId } from './useMessageScrolling';

function message(overrides: Partial<TMessage>): TMessage {
  return {
    messageId: 'message',
    conversationId: 'conversation',
    parentMessageId: 'parent',
    text: '',
    isCreatedByUser: false,
    ...overrides,
  };
}

describe('message scroll anchoring', () => {
  test('finds the latest cooking assistant placeholder in the rendered branch', () => {
    expect(
      latestCookingAssistantMessageId([
        message({ messageId: 'user-1', isCreatedByUser: true }),
        message({
          messageId: 'assistant-1',
          metadata: { cookingScrollAnchor: true },
          children: [
            message({
              messageId: 'assistant-2',
              metadata: { cookingScrollAnchor: true },
            }),
          ],
        }),
      ]),
    ).toBe('assistant-2');
  });

  test('ignores non-cooking assistant messages', () => {
    expect(
      latestCookingAssistantMessageId([
        message({ messageId: 'assistant-1' }),
        message({ messageId: 'user-1', isCreatedByUser: true }),
      ]),
    ).toBeNull();
  });
});
