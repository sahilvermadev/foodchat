import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
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

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
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
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
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
                      ? 'flex-1 items-center justify-end sm:justify-center'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
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
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
