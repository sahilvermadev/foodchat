import { Constants } from 'librechat-data-provider';
import { getActiveCookingConversationId, getNewCookingConversationTemplate } from './cookingRouteState';

describe('cooking route state helpers', () => {
  test('does not use a stale stored conversation as the active draft on new cooking chats', () => {
    expect(
      getActiveCookingConversationId({
        isCookingMode: true,
        routeConversationId: '',
        stateConversationId: 'old-paneer-conversation',
      }),
    ).toBeUndefined();

    expect(
      getActiveCookingConversationId({
        isCookingMode: true,
        routeConversationId: Constants.NEW_CONVO as string,
        stateConversationId: 'old-paneer-conversation',
      }),
    ).toBeUndefined();
  });

  test('uses the route conversation id for existing cooking chats', () => {
    expect(
      getActiveCookingConversationId({
        isCookingMode: true,
        routeConversationId: 'current-buldak-conversation',
        stateConversationId: 'old-paneer-conversation',
      }),
    ).toBe('current-buldak-conversation');
  });

  test('preserves legacy chat behavior outside cooking mode', () => {
    expect(
      getActiveCookingConversationId({
        isCookingMode: false,
        routeConversationId: '',
        stateConversationId: 'existing-chat',
      }),
    ).toBe('existing-chat');
  });

  test('creates a clean cooking new-conversation template', () => {
    expect(getNewCookingConversationTemplate()).toEqual({
      conversationId: Constants.NEW_CONVO,
      title: 'New Chat',
    });
  });
});
