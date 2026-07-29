import { useQuery } from '@tanstack/react-query';
import type { ConversationCookingDocuments, CookingChatMessage } from 'librechat-data-provider';
import { cookingDocumentsByConversation } from 'librechat-data-provider/mobile';

import { useAuth } from '@/features/auth/provider';
import { isOnlineNow } from '@/features/connectivity/provider';
import {
  cacheOfflineCookingDocuments,
  getOfflineCookingDocuments,
} from '@/features/offline/cooking';
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
  const { user } = useAuth();
  return useQuery({
    queryKey: cookKeys.documents(conversationId ?? ''),
    queryFn: async () => {
      const id = conversationId ?? '';
      if (!isOnlineNow() && user) {
        const local = await getOfflineCookingDocuments(user.id, id);
        if (local) return local;
        throw new Error('This cooking canvas has not been saved on this device yet.');
      }
      try {
        const documents = await apiFetch<ConversationCookingDocuments>(
          cookingDocumentsByConversation(id),
        );
        if (user) await cacheOfflineCookingDocuments(user.id, id, documents);
        return documents;
      } catch (error) {
        const local = user ? await getOfflineCookingDocuments(user.id, id) : null;
        if (local) return local;
        throw error;
      }
    },
    enabled: Boolean(conversationId),
    networkMode: 'always',
  });
}
