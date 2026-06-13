import { startCookingConversation } from './useStartCookingConversation';

describe('startCookingConversation', () => {
  test('clears stale state before creating the next conversation', () => {
    const calls: string[] = [];

    startCookingConversation({
      clearCurrentMessages: () => calls.push('clear'),
      invalidateMessages: () => calls.push('invalidate'),
      createConversation: () => calls.push('create'),
    });

    expect(calls).toEqual(['clear', 'invalidate', 'create']);
  });
});
