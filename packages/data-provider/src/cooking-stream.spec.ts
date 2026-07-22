import { applyCookingChatEvent, initialCookingChatState } from './cooking-stream';
import type { CookingChatStreamEvent } from './types/cooking';

describe('applyCookingChatEvent', () => {
  it('turns the request and cumulative assistant chunks into one live message thread', () => {
    const request: CookingChatStreamEvent = {
      message: {
        messageId: 'user-1',
        conversationId: 'conversation-1',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        text: 'How hot should the pan be?',
        isCreatedByUser: true,
      },
      created: true,
      cooking: true,
    };
    const firstChunk: CookingChatStreamEvent = {
      message: true,
      text: 'Medium',
      messageId: 'assistant-1',
      parentMessageId: 'user-1',
      conversationId: 'conversation-1',
    };
    const secondChunk: CookingChatStreamEvent = { ...firstChunk, text: 'Medium-high heat.' };

    const requested = applyCookingChatEvent(initialCookingChatState(), request);
    const streaming = applyCookingChatEvent(
      applyCookingChatEvent(requested, firstChunk),
      secondChunk,
    );

    expect(streaming.messages).toHaveLength(2);
    expect(streaming.messages[1]).toMatchObject({
      messageId: 'assistant-1',
      text: 'Medium-high heat.',
      isCreatedByUser: false,
    });
    expect(streaming.isStreaming).toBe(true);
  });

  it('reconciles the authoritative final messages and exposes recipe-context changes', () => {
    const requestMessage = {
      messageId: 'user-1',
      conversationId: 'conversation-1',
      parentMessageId: 'root',
      text: 'Create a pasta recipe.',
      isCreatedByUser: true,
    };
    const responseMessage = {
      messageId: 'assistant-1',
      conversationId: 'conversation-1',
      parentMessageId: 'user-1',
      text: 'I created a lemon pasta recipe.',
      isCreatedByUser: false,
      metadata: { cookingPromptSuggestions: ['Start cooking'] },
    };
    const final: CookingChatStreamEvent = {
      final: true,
      conversation: { conversationId: 'conversation-1', title: 'Lemon pasta' },
      requestMessage,
      responseMessage,
      cookingDocumentsUpdated: true,
    };

    const state = applyCookingChatEvent(initialCookingChatState(), final);

    expect(state.messages).toEqual([requestMessage, responseMessage]);
    expect(state.conversation?.title).toBe('Lemon pasta');
    expect(state.documentsUpdated).toBe(true);
    expect(state.isStreaming).toBe(false);
  });

  it('preserves structured cooking progress without treating it as display text', () => {
    const progress: CookingChatStreamEvent = {
      type: 'step',
      step: { type: 'planner_request', payload: { messageCount: 2 } },
      messageId: 'assistant-1',
      parentMessageId: 'user-1',
      conversationId: 'conversation-1',
    };

    const state = applyCookingChatEvent(initialCookingChatState(), progress);

    expect(state.activeStep).toEqual({
      type: 'planner_request',
      payload: { messageCount: 2 },
    });
    expect(state.isStreaming).toBe(true);
  });
});
