import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { clearMessagesCache } from '~/utils';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

type StartCookingConversationDependencies = {
  clearCurrentMessages: () => void;
  invalidateMessages: () => void;
  createConversation: () => void;
};

export function startCookingConversation({
  clearCurrentMessages,
  invalidateMessages,
  createConversation,
}: StartCookingConversationDependencies): void {
  clearCurrentMessages();
  invalidateMessages();
  createConversation();
}

export default function useStartCookingConversation(): () => void {
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  return useCallback(() => {
    startCookingConversation({
      clearCurrentMessages: () => clearMessagesCache(queryClient, conversation?.conversationId),
      invalidateMessages: () => {
        void queryClient.invalidateQueries([QueryKeys.messages]);
      },
      createConversation: () => newConversation({ routeBase: '/cook' }),
    });
  }, [conversation?.conversationId, newConversation, queryClient]);
}
