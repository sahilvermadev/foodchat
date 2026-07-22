import type { CookingChatMessage, CookingChatState, CookingChatStreamEvent } from './types/cooking';

export const initialCookingChatState = (messages: CookingChatMessage[] = []): CookingChatState => ({
  messages,
  isStreaming: false,
  documentsUpdated: false,
});

function upsertMessage(
  messages: CookingChatMessage[],
  message: CookingChatMessage,
): CookingChatMessage[] {
  const index = messages.findIndex((candidate) => candidate.messageId === message.messageId);
  if (index < 0) return [...messages, message];
  return messages.map((candidate, candidateIndex) =>
    candidateIndex === index ? { ...candidate, ...message } : candidate,
  );
}

export function applyCookingChatEvent(
  state: CookingChatState,
  event: CookingChatStreamEvent,
): CookingChatState {
  if ('created' in event) {
    return {
      ...state,
      messages: upsertMessage(state.messages, event.message),
      isStreaming: true,
    };
  }
  if ('final' in event) {
    return {
      ...state,
      messages: upsertMessage(
        upsertMessage(state.messages, event.requestMessage),
        event.responseMessage,
      ),
      conversation: event.conversation,
      isStreaming: false,
      activeStep: undefined,
      documentsUpdated: Boolean(
        event.cookingDocumentsUpdated || event.cookingDraftUpdated || state.documentsUpdated,
      ),
    };
  }
  if ('type' in event) return { ...state, activeStep: event.step, isStreaming: true };

  const message: CookingChatMessage = {
    messageId: event.messageId,
    conversationId: event.conversationId,
    parentMessageId: event.parentMessageId,
    text: event.text,
    isCreatedByUser: false,
  };
  return {
    ...state,
    messages: upsertMessage(state.messages, message),
    isStreaming: true,
  };
}
