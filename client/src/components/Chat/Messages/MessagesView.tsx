import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useLocalize } from '~/hooks';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { MessagesViewProvider } from '~/Providers';
import { fontSizeAtom } from '~/store/fontSize';
import MultiMessage from './MultiMessage';
import MessageNav from './MessageNav';
import { cn } from '~/utils';
import store from '~/store';
import { useCookingChat } from '~/components/Cooking/CookingChatContext';

function MessagesViewContent({
  messagesTree: _messagesTree,
}: {
  messagesTree?: TMessage[] | null;
}) {
  const localize = useLocalize();
  const { isCookingChat } = useCookingChat();
  const fontSize = useAtomValue(fontSizeAtom);
  const { screenshotTargetRef } = useScreenshot();
  const scrollButtonPreference = useRecoilValue(store.showScrollButton);
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  const scrollToBottomRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const lastSearchNavigationRef = useRef<string>();

  const {
    conversation,
    scrollableRef,
    messagesEndRef,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  } = useMessageScrolling(_messagesTree);

  const { conversationId } = conversation ?? {};
  const hasNoMessages = _messagesTree === null || _messagesTree?.length === 0;
  const emptyState = isCookingChat ? null : (
    <div
      className={cn('flex w-full items-center justify-center p-3 text-text-secondary', fontSize)}
    >
      {localize('com_ui_nothing_found')}
    </div>
  );

  useEffect(() => {
    const targetMessageId = (location.state as { historySearchMessageId?: string } | null)
      ?.historySearchMessageId;
    const navigationTarget = `${location.key}:${targetMessageId ?? ''}`;
    if (
      !targetMessageId ||
      lastSearchNavigationRef.current === navigationTarget ||
      !_messagesTree?.length
    ) {
      return;
    }

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      const target = document.getElementById(targetMessageId);
      if (!target) {
        if (attempts >= 10) {
          window.clearInterval(interval);
        }
        return;
      }
      window.clearInterval(interval);
      lastSearchNavigationRef.current = navigationTarget;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add(
        'ring-2',
        'ring-border-heavy',
        'ring-offset-4',
        'ring-offset-surface-primary',
      );
      window.setTimeout(() => {
        target.classList.remove(
          'ring-2',
          'ring-border-heavy',
          'ring-offset-4',
          'ring-offset-surface-primary',
        );
      }, 1800);
    }, 100);

    return () => window.clearInterval(interval);
  }, [_messagesTree, location.key, location.state]);

  return (
    <>
      <div className="relative flex-1 overflow-hidden overflow-y-auto">
        <div className="relative h-full">
          <div
            className="scrollbar-gutter-stable"
            onScroll={debouncedHandleScroll}
            ref={scrollableRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              width: '100%',
            }}
          >
            <div className="flex flex-col pb-9 pt-14 dark:bg-transparent">
              {hasNoMessages ? (
                emptyState
              ) : (
                <>
                  <div ref={screenshotTargetRef}>
                    <MultiMessage
                      messagesTree={_messagesTree}
                      messageId={conversationId ?? null}
                      setCurrentEditId={setCurrentEditId}
                      currentEditId={currentEditId ?? null}
                    />
                  </div>
                </>
              )}
              <div
                id="messages-end"
                className="group h-0 w-full flex-shrink-0"
                ref={messagesEndRef}
              />
            </div>
          </div>

          <CSSTransition
            in={showScrollButton && scrollButtonPreference}
            timeout={{
              enter: 300,
              exit: 250,
            }}
            classNames="scroll-animation"
            unmountOnExit={true}
            appear={true}
            nodeRef={scrollToBottomRef}
          >
            <ScrollToBottom ref={scrollToBottomRef} scrollHandler={handleSmoothToRef} />
          </CSSTransition>

          <MessageNav scrollableRef={scrollableRef} />
        </div>
      </div>
    </>
  );
}

export default function MessagesView({ messagesTree }: { messagesTree?: TMessage[] | null }) {
  return (
    <MessagesViewProvider>
      <MessagesViewContent messagesTree={messagesTree} />
    </MessagesViewProvider>
  );
}
