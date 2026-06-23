import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage, TSubmission } from 'librechat-data-provider';
import { isGuestCookingSubmission, shouldNavigateAfterFinal, usesDirectSSE } from '../transport';

function submission(clientOptions?: Record<string, unknown>): TSubmission {
  return {
    userMessage: {
      messageId: 'message-1',
      conversationId: 'new',
      text: 'Cook dinner',
      isCreatedByUser: true,
    } as TMessage,
    isTemporary: true,
    messages: [],
    conversation: { conversationId: 'new' },
    endpointOption: {
      endpoint: EModelEndpoint.custom,
      clientOptions,
    },
  };
}

describe('SSE transport selection', () => {
  it('uses direct SSE for authenticated and guest cooking bridges', () => {
    expect(usesDirectSSE(submission({ cookingBridge: true }))).toBe(true);
    expect(usesDirectSSE(submission({ guestCookingBridge: true }))).toBe(true);
  });

  it('keeps regular chat on the resumable transport', () => {
    expect(usesDirectSSE(submission())).toBe(false);
    expect(usesDirectSSE(null)).toBe(false);
  });

  it('identifies guest cooking submissions', () => {
    expect(isGuestCookingSubmission(submission({ guestCookingBridge: true }))).toBe(true);
    expect(isGuestCookingSubmission(submission({ cookingBridge: true }))).toBe(false);
  });

  it('keeps completed guest trials on the landing route', () => {
    expect(shouldNavigateAfterFinal(submission({ guestCookingBridge: true }))).toBe(false);
    expect(shouldNavigateAfterFinal(submission({ cookingBridge: true }))).toBe(true);
  });
});
