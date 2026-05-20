import React, { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';
import type { MessagesViewContextValue } from '~/Providers/MessagesViewContext';

interface ShareMessagesProviderProps {
  messages: TMessage[];
  children: React.ReactNode;
}

export function ShareMessagesProvider({ messages, children }: ShareMessagesProviderProps) {
  const contextValue = useMemo<MessagesViewContextValue>(
    () => ({
      conversation: null,
      conversationId: undefined,
      ask: () => Promise.resolve(),
      regenerate: () => {},
      handleContinue: () => {},
      latestMessageId: messages[messages.length - 1]?.messageId,
      latestMessageDepth: messages[messages.length - 1]?.depth,
      isSubmitting: false,
      abortScroll: false,
      setAbortScroll: () => {},
      index: 0,
      setLatestMessage: () => {},
      getMessages: () => messages,
      setMessages: () => {},
    }),
    [messages],
  );

  return (
    <MessagesViewContext.Provider value={contextValue}>{children}</MessagesViewContext.Provider>
  );
}
