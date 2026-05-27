import { Constants } from 'librechat-data-provider';
import type { CookingDraft } from 'librechat-data-provider';
import {
  getActiveCookingConversationId,
  getCookingDocumentsForActiveConversation,
  getNewCookingConversationTemplate,
} from './cookingRouteState';

describe('cooking route state helpers', () => {
  const cookingDocument = (_id: string, conversationId: string) =>
    ({
      _id,
      conversationId,
      recipe: { title: _id },
    }) as CookingDraft;

  test('does not use a stale stored conversation as the active document source on new cooking chats', () => {
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

  test('uses the stored cooking conversation during an active cooking submission transition', () => {
    expect(
      getActiveCookingConversationId({
        isCookingMode: true,
        routeConversationId: Constants.NEW_CONVO as string,
        stateConversationId: 'current-paneer-conversation',
        allowStateConversationFallback: true,
      }),
    ).toBe('current-paneer-conversation');
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

  test('does not expose stale cooking documents when there is no active conversation', () => {
    expect(
      getCookingDocumentsForActiveConversation(
        [cookingDocument('draft-1', 'old-conversation')],
        undefined,
      ),
    ).toEqual([]);
  });

  test('filters cooking documents to the active conversation', () => {
    expect(
      getCookingDocumentsForActiveConversation(
        [
          cookingDocument('draft-1', 'old-conversation'),
          cookingDocument('draft-2', 'current-conversation'),
        ],
        'current-conversation',
      ).map((document) => document._id),
    ).toEqual(['draft-2']);
  });
});
