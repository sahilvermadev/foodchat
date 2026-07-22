import {
  applyCookingChatEvent,
  createSSEParser,
  initialCookingChatState,
} from 'librechat-data-provider/mobile';
import type {
  CookingChatRequest,
  CookingChatState,
  CookingChatStreamEvent,
} from 'librechat-data-provider/mobile';

import { authenticatedApiResponse } from '@/lib/api/client';

export async function streamCookingChat({
  request,
  signal,
  onState,
}: {
  request: CookingChatRequest;
  signal: AbortSignal;
  onState: (state: CookingChatState) => void;
}): Promise<CookingChatState> {
  const response = await authenticatedApiResponse('/api/cooking/chat', {
    method: 'POST',
    body: request,
    signal,
  });
  if (!response.body) throw new Error('This device could not open Rekky’s live response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser<CookingChatStreamEvent>();
  let state = initialCookingChatState(request.messages);

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const events = parser.push(decoder.decode(result.value, { stream: true }));
    for (const event of events) {
      state = applyCookingChatEvent(state, event);
      onState(state);
    }
  }
  return state;
}
