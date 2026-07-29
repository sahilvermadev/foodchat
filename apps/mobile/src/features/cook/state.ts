import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  cookingDocument,
  initialCookingChatState,
  selectCookingDocument,
} from 'librechat-data-provider/mobile';
import type {
  ConversationCookingDocuments,
  CookingChatMessage,
  TFile,
} from 'librechat-data-provider';

import { apiFetch } from '@/lib/api/client';
import { userErrorMessage } from '@/lib/errors';
import { cookKeys, useCookingDocuments, useCookingMessages } from './queries';
import { streamCookingChat } from './service';

const NO_PARENT = '00000000-0000-0000-0000-000000000000';

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function useCookState({
  initialConversationId,
  onConversation,
}: {
  initialConversationId?: string;
  onConversation: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [chat, setChat] = useState(() => initialCookingChatState());
  const [error, setError] = useState<string>();
  const [documentBusy, setDocumentBusy] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const hydratedConversationRef = useRef<string | undefined>(undefined);
  const conversationId = chat.conversation?.conversationId ?? initialConversationId;
  const messagesQuery = useCookingMessages(initialConversationId);
  const documentsQuery = useCookingDocuments(conversationId);

  useEffect(() => {
    if (!initialConversationId || !messagesQuery.data || chat.isStreaming) return;
    if (hydratedConversationRef.current === initialConversationId) return;
    hydratedConversationRef.current = initialConversationId;
    setChat(initialCookingChatState(messagesQuery.data));
  }, [chat.isStreaming, initialConversationId, messagesQuery.data]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const send = useCallback(
    async (rawText: string, files: TFile[] = []) => {
      const text = rawText.trim();
      if (!text || chat.isStreaming) return;
      const messageId = createId();
      const responseMessageId = createId();
      const parentMessageId = chat.messages.at(-1)?.messageId ?? NO_PARENT;
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      setError(undefined);

      try {
        const finalState = await streamCookingChat({
          request: {
            text,
            ...(conversationId ? { conversationId } : {}),
            messageId,
            responseMessageId,
            parentMessageId,
            messages: chat.messages,
            ...(files.length ? { files } : {}),
          },
          signal: controller.signal,
          onState: setChat,
        });
        if (finalState.isStreaming || !finalState.conversation?.conversationId) {
          throw new Error('Rekky’s response ended early. Please try again.');
        }
        const nextConversationId = finalState.conversation.conversationId;
        hydratedConversationRef.current = nextConversationId;
        onConversation(nextConversationId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['conversations'] }),
          queryClient.invalidateQueries({ queryKey: cookKeys.messages(nextConversationId) }),
          finalState.documentsUpdated
            ? queryClient.invalidateQueries({ queryKey: cookKeys.documents(nextConversationId) })
            : Promise.resolve(),
        ]);
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') {
          setChat((current) => ({ ...current, isStreaming: false, activeStep: undefined }));
          return;
        }
        setChat((current) => ({ ...current, isStreaming: false, activeStep: undefined }));
        const message = userErrorMessage(caught, 'Rekky could not respond. Please try again.');
        setError(message);
        throw caught;
      }
    },
    [chat.isStreaming, chat.messages, conversationId, onConversation, queryClient],
  );

  const selectedDocument = useMemo(() => {
    const collection = documentsQuery.data;
    if (!collection) return undefined;
    return (
      collection.documents.find((document) => document._id === collection.selectedDocumentId) ??
      collection.documents[0]
    );
  }, [documentsQuery.data]);

  const selectDocument = useCallback(
    async (documentId: string) => {
      if (!conversationId || documentBusy) return;
      setDocumentBusy(true);
      setError(undefined);
      try {
        const collection = await apiFetch<ConversationCookingDocuments>(
          selectCookingDocument(documentId),
          { method: 'POST', body: {} },
        );
        queryClient.setQueryData(cookKeys.documents(conversationId), collection);
      } catch (caught) {
        setError(userErrorMessage(caught, 'The document could not be opened. Please try again.'));
      } finally {
        setDocumentBusy(false);
      }
    },
    [conversationId, documentBusy, queryClient],
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      if (!conversationId || documentBusy) return;
      setDocumentBusy(true);
      setError(undefined);
      try {
        const collection = await apiFetch<ConversationCookingDocuments>(
          cookingDocument(documentId),
          { method: 'DELETE' },
        );
        queryClient.setQueryData(cookKeys.documents(conversationId), collection);
      } catch (caught) {
        setError(userErrorMessage(caught, 'The document could not be deleted. Please try again.'));
      } finally {
        setDocumentBusy(false);
      }
    },
    [conversationId, documentBusy, queryClient],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    hydratedConversationRef.current = undefined;
    setChat(initialCookingChatState());
    setError(undefined);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setChat((current) => ({ ...current, isStreaming: false, activeStep: undefined }));
  }, []);

  const suggestions = useMemo(() => {
    const assistantMessages = chat.messages.filter((message) => !message.isCreatedByUser);
    return assistantMessages.at(-1)?.metadata?.cookingPromptSuggestions ?? [];
  }, [chat.messages]);

  return {
    ...chat,
    conversationId,
    error,
    messagesLoading: messagesQuery.isLoading,
    documentsLoading: documentsQuery.isLoading,
    documents: documentsQuery.data?.documents ?? [],
    selectedDocumentId: documentsQuery.data?.selectedDocumentId,
    documentBusy,
    selectedDocument,
    suggestions,
    send,
    stop,
    selectDocument,
    deleteDocument,
    reset,
  };
}

export type CookMessage = CookingChatMessage;
