import { useQuery } from '@tanstack/react-query';
import type { ConversationCookingDocuments, CookingChatMessage } from 'librechat-data-provider';

import { apiFetch } from '@/lib/api/client';

export const cookKeys = {
  messages: (conversationId: string) => ['conversations', conversationId, 'messages'] as const,
  documents: (conversationId: string) => ['cooking-documents', conversationId] as const,
};

export function useCookingMessages(conversationId?: string) {
  return useQuery({
    queryKey: cookKeys.messages(conversationId ?? ''),
    queryFn: () =>
      apiFetch<CookingChatMessage[]>(`/api/messages/${encodeURIComponent(conversationId ?? '')}`),
    enabled: Boolean(conversationId),
  });
}

export function useCookingDocuments(conversationId?: string) {
  return useQuery({
    queryKey: cookKeys.documents(conversationId ?? ''),
    queryFn: () =>
      apiFetch<ConversationCookingDocuments>(
        `/api/cooking/documents/by-conversation/${encodeURIComponent(conversationId ?? '')}`,
      ),
    enabled: Boolean(conversationId),
  });
}
