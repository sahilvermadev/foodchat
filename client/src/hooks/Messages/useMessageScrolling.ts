import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import useScrollToRef from '~/hooks/useScrollToRef';
import store from '~/store';

const threshold = 0.85;
const debounceRate = 150;

export function latestCookingAssistantMessageId(messagesTree?: TMessage[] | null): string | null {
  if (!messagesTree?.length) {
    return null;
  }

  let latestId: string | null = null;
  const visit = (messages: TMessage[]) => {
    for (const message of messages) {
      if (
        !message.isCreatedByUser &&
        message.metadata?.cookingScrollAnchor === true &&
        message.messageId
      ) {
        latestId = message.messageId;
      }
      if (message.children?.length) {
        visit(message.children);
      }
    }
  };

  visit(messagesTree);
  return latestId;
}

export default function useMessageScrolling(messagesTree?: TMessage[] | null) {
  const autoScroll = useRecoilValue(store.autoScroll);

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initialScrollConversationRef = useRef<string | null>(null);
  const anchoredResponseRef = useRef<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { conversation, conversationId } = useMessagesConversation();
  const { setAbortScroll, isSubmitting, abortScroll } = useMessagesSubmission();

  const timeoutIdRef = useRef<NodeJS.Timeout>();

  const debouncedSetShowScrollButton = useCallback((value: boolean) => {
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      setShowScrollButton(value);
    }, debounceRate);
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        debouncedSetShowScrollButton(!entry.isIntersecting);
      },
      { root: scrollableRef.current, threshold },
    );

    observer.observe(messagesEndRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutIdRef.current);
    };
  }, [messagesEndRef, scrollableRef, debouncedSetShowScrollButton]);

  const debouncedHandleScroll = useCallback(() => {
    if (messagesEndRef.current && scrollableRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          debouncedSetShowScrollButton(!entry.isIntersecting);
        },
        { root: scrollableRef.current, threshold },
      );
      observer.observe(messagesEndRef.current);
      return () => observer.disconnect();
    }
  }, [debouncedSetShowScrollButton]);

  const scrollCallback = () => debouncedSetShowScrollButton(false);

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: scrollCallback,
    smoothCallback: () => {
      scrollCallback();
      setAbortScroll(false);
    },
  });

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!conversationId || conversationId === Constants.NEW_CONVO) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (initialScrollConversationRef.current === conversationId) {
      return;
    }

    initialScrollConversationRef.current = conversationId;
    let frameId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scrollToEnd = () => {
      const scroller = scrollableRef.current;
      if (!scroller) {
        return;
      }
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      debouncedSetShowScrollButton(false);
    };

    const runFrames = (remaining: number) => {
      if (cancelled || remaining <= 0) {
        return;
      }
      frameId = requestAnimationFrame(() => {
        scrollToEnd();
        runFrames(remaining - 1);
      });
    };

    scrollToEnd();
    runFrames(4);
    timeoutId = setTimeout(scrollToEnd, 250);

    return () => {
      cancelled = true;
      if (frameId != null) {
        cancelAnimationFrame(frameId);
      }
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [conversationId, debouncedSetShowScrollButton, messagesTree]);

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (!isSubmitting) {
      anchoredResponseRef.current = null;
      return;
    }

    if (abortScroll === true) {
      return;
    }

    const latestResponseId = latestCookingAssistantMessageId(messagesTree);
    if (!latestResponseId || anchoredResponseRef.current === latestResponseId) {
      return;
    }

    let frameId: number | null = requestAnimationFrame(() => {
      const target = document.getElementById(latestResponseId);
      if (!target) {
        return;
      }
      anchoredResponseRef.current = latestResponseId;
      target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });

    return () => {
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
  }, [isSubmitting, messagesTree, abortScroll]);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (scrollToBottom && autoScroll && conversationId !== Constants.NEW_CONVO) {
      scrollToBottom();
    }
  }, [autoScroll, conversationId, scrollToBottom]);

  return {
    conversation,
    scrollableRef,
    messagesEndRef,
    scrollToBottom,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  };
}
