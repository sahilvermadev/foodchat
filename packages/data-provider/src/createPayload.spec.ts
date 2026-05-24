import createPayload from './createPayload';
import { EModelEndpoint } from './schemas';
import type { TMessage, TSubmission } from './types';

const previousMessage = {
  messageId: 'assistant-1',
  conversationId: 'conversation-1',
  parentMessageId: 'user-1',
  text: 'Use an immersion blender for the first draft.',
  isCreatedByUser: false,
} as TMessage;

function submission(cookingBridge: boolean): TSubmission {
  return {
    userMessage: {
      messageId: 'user-2',
      conversationId: 'conversation-1',
      parentMessageId: 'assistant-1',
      text: "I don't have an immersion blender.",
      isCreatedByUser: true,
    } as TMessage,
    messages: [previousMessage],
    isTemporary: false,
    conversation: {
      conversationId: 'conversation-1',
      endpoint: EModelEndpoint.openAI,
      model: 'google/gemini-3.1-flash-lite',
    },
    endpointOption: {
      endpoint: EModelEndpoint.openAI,
      endpointType: EModelEndpoint.openAI,
      model: 'google/gemini-3.1-flash-lite',
      clientOptions: cookingBridge ? { cookingBridge: true } : undefined,
    },
  } as TSubmission;
}

describe('createPayload', () => {
  it('includes chat history for cooking bridge requests', () => {
    const { payload } = createPayload(submission(true));

    expect(payload.messages).toEqual([previousMessage]);
  });

  it('does not add chat history to regular provider requests', () => {
    const { payload } = createPayload(submission(false));

    expect(payload.messages).toBeUndefined();
  });
});
