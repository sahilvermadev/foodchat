import { useQuery } from '@tanstack/react-query';
import type {
  ConversationCookingDocuments,
  CookingChatMessage,
  CookingSession,
} from 'librechat-data-provider';

import { apiFetch } from '@/lib/api/client';

export const cookKeys = {
  messages: (conversationId: string) => ['conversations', conversationId, 'messages'] as const,
  documents: (conversationId: string) => ['cooking-documents', conversationId] as const,
  session: (sessionId: string) => ['cooking-sessions', sessionId] as const,
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

export function useCookingSession(sessionId?: string) {
  return useQuery({
    queryKey: cookKeys.session(sessionId ?? ''),
    queryFn: () =>
      apiFetch<CookingSession>(`/api/cooking/sessions/${encodeURIComponent(sessionId ?? '')}`),
    enabled: Boolean(sessionId),
  });
}
