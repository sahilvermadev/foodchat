import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Constants, ContentTypes, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useLocalize,
} from '~/hooks';
import ConversationStarters from './Input/ConversationStarters';
import { getCookingChatDisplayText } from '~/components/Cooking/artifact';
import { useGetMessagesByConvoId } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import { useCookingChat } from '~/components/Cooking/CookingChatContext';
import store from '~/store';
import Tour from '~/components/Onboarding/Tour';

function LoadingMessagesSkeleton() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto" aria-hidden="true">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex gap-4">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-white/10" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-white/5" />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-white/10" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-white/10" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function readMessagePartText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const textValue = (value as { value?: unknown }).value;
    return typeof textValue === 'string' ? textValue : '';
  }
  return '';
}

function getMessageDisplayText(message: TMessage): string {
  const text = message.text?.trim();
  if (text) {
    return text;
  }

  return (
    message.content
      ?.map((part) => ('text' in part ? readMessagePartText(part.text) : ''))
      .join('\n')
      .trim() ?? ''
  );
}

function ChatView({
  index = 0,
  conversationId: conversationIdOverride,
  collapseRecipeMessages = false,
}: {
  index?: number;
  conversationId?: string;
  collapseRecipeMessages?: boolean;
}) {
  const params = useParams();
  const conversationId = conversationIdOverride ?? params.conversationId;
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const localize = useLocalize();
  const { isCookingChat } = useCookingChat();
  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const messages = collapseRecipeMessages
          ? data.map((message) => {
              const text = getMessageDisplayText(message);
              const chatText = getCookingChatDisplayText(
                text,
                localize('com_cooking_recipe_added_to_canvas'),
              );
              if (message.isCreatedByUser || message.error || !chatText) {
                return message;
              }

              return {
                ...message,
                text: chatText,
                content: [{ type: ContentTypes.TEXT as const, text: chatText }],
              };
            })
          : data;
        const dataTree = buildTree({ messages, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [collapseRecipeMessages, fileMap, localize],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating =
    !isCookingChat && (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingMessagesSkeleton />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingMessagesSkeleton />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation transparentBackground={isLandingPage && isCookingChat}>
            <div
              className={cn(
                'relative flex h-full w-full flex-col overflow-hidden',
                isLandingPage && isCookingChat && 'bg-presentation',
              )}
            >
              <div className="relative z-10">
                <Header />
              </div>
              <>
                <div
                  className={cn(
                    'relative z-10 flex flex-col',
                    isLandingPage
                      ? 'min-h-0 flex-1 items-center justify-center overflow-hidden px-5 min-[769px]:overflow-visible min-[769px]:px-0'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage &&
                        'fixed inset-x-0 bottom-0 z-30 mx-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] transition-all duration-200 min-[769px]:static min-[769px]:max-w-3xl min-[769px]:px-0 min-[769px]:pb-0 xl:max-w-4xl',
                    )}
                  >
                    <ChatForm index={index} />
                    {isLandingPage ? <ConversationStarters /> : <Footer />}
                  </div>
                </div>
                {isLandingPage && (
                  <div className="relative z-10">
                    <Footer />
                  </div>
                )}
              </>
            </div>
          </Presentation>
          <Tour />
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
