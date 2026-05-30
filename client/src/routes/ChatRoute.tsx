import { useEffect, useMemo } from 'react';
import { useRecoilCallback, useRecoilValue } from 'recoil';
import { Spinner, useToastContext } from '@librechat/client';
import { useParams, useSearchParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TPreset } from 'librechat-data-provider';
import {
  mergeQuerySettingsWithSpec,
  processValidSettings,
  getDefaultModelSpec,
  getModelSpecPreset,
  getMiseDefaultPreset,
  ensureMiseDefaultModelPreference,
  isNotFoundError,
  logger,
} from '~/utils';
import { useIdChangeEffect, useAppStartup, useNewConvo, useLocalize } from '~/hooks';
import {
  useCookingDocumentsByConversationQuery,
  useGetConvoIdQuery,
  useGetStartupConfig,
  useGetEndpointsQuery,
} from '~/data-provider';
import { ToolCallsMapProvider } from '~/Providers';
import ChatView from '~/components/Chat/ChatView';
import CookingWorkspace from '~/components/Cooking/Workspace';
import { CookingChatProvider } from '~/components/Cooking/CookingChatContext';
import { getCookingCanvasMarkdown } from '~/components/Cooking/artifact';
import { NotificationSeverity } from '~/common';
import {
  getActiveCookingConversationId,
  getCookingDocumentsForActiveConversation,
  getNewCookingConversationTemplate,
} from './cookingRouteState';
import useAuthRedirect from './useAuthRedirect';
import temporaryStore from '~/store/temporary';
import store from '~/store';

export default function ChatRoute({ mode = 'chat' }: { mode?: 'chat' | 'cooking' }) {
  const { data: startupConfig } = useGetStartupConfig();
  const { isAuthenticated, user, roles } = useAuthRedirect();

  const defaultTemporaryChat = useRecoilValue(temporaryStore.defaultTemporaryChat);
  const setIsTemporary = useRecoilCallback(
    ({ set }) =>
      (value: boolean) => {
        set(temporaryStore.isTemporary, value);
      },
    [],
  );
  useAppStartup({ startupConfig, user });

  const index = 0;
  const [searchParams] = useSearchParams();
  const { conversationId: routeConversationId = '' } = useParams();
  const isCookingMode = mode === 'cooking';
  const conversationId = routeConversationId || (isCookingMode ? Constants.NEW_CONVO : '');
  useIdChangeEffect(conversationId);
  const { hasSetConversation, conversation } = store.useCreateConversationAtom(index);
  const { newConversation } = useNewConvo();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const activeConversationId = getActiveCookingConversationId({
    isCookingMode,
    routeConversationId,
    stateConversationId: conversation?.conversationId,
    allowStateConversationFallback: isSubmitting,
  });
  const documentsQuery = useCookingDocumentsByConversationQuery(activeConversationId, {
    enabled: isCookingMode && Boolean(activeConversationId),
  });
  const documents = useMemo(
    () =>
      getCookingDocumentsForActiveConversation(
        documentsQuery.data?.documents,
        activeConversationId,
      ),
    [activeConversationId, documentsQuery.data?.documents],
  );
  const documentsLoaded = activeConversationId ? Boolean(documentsQuery.data) : true;
  const selectedDocumentId = documents.some(
    (document) => document._id === documentsQuery.data?.selectedDocumentId,
  )
    ? documentsQuery.data?.selectedDocumentId
    : documents.find((document) => document.selected)?._id;
  const activeDraft =
    documents.find((document) => document._id === selectedDocumentId) ?? undefined;

  const modelsQuery = useGetModelsQuery({
    enabled: isAuthenticated,
    refetchOnMount: 'always',
  });
  const initialConvoQuery = useGetConvoIdQuery(conversationId, {
    enabled:
      isAuthenticated && conversationId !== Constants.NEW_CONVO && !hasSetConversation.current,
  });
  const endpointsQuery = useGetEndpointsQuery({ enabled: isAuthenticated });

  const isTemporaryChat = conversation && conversation.expiredAt ? true : false;

  useEffect(() => {
    if (isCookingMode) {
      setIsTemporary(false);
      return;
    }
    if (conversationId === Constants.NEW_CONVO) {
      setIsTemporary(defaultTemporaryChat);
    } else if (isTemporaryChat) {
      setIsTemporary(isTemporaryChat);
    } else {
      setIsTemporary(false);
    }
  }, [conversationId, isCookingMode, isTemporaryChat, setIsTemporary, defaultTemporaryChat]);

  useEffect(() => {
    if (
      !isCookingMode ||
      conversationId !== Constants.NEW_CONVO ||
      !modelsQuery.data ||
      !endpointsQuery.data
    ) {
      return;
    }

    const changed = ensureMiseDefaultModelPreference();
    if (!changed) {
      return;
    }

    newConversation({
      modelsData: modelsQuery.data,
      preset: getMiseDefaultPreset(),
      template: getNewCookingConversationTemplate(),
      keepLatestMessage: true,
      routeBase: '/cook',
    });
  }, [conversationId, endpointsQuery.data, isCookingMode, modelsQuery.data, newConversation]);

  /** This effect is mainly for the first conversation state change on first load of the page.
   *  Adjusting this may have unintended consequences on the conversation state.
   */
  useEffect(() => {
    // Wait for roles to load so hasAgentAccess has a definitive value in useNewConvo
    const rolesLoaded = roles?.USER != null;
    const shouldSetConvo =
      (startupConfig && rolesLoaded && !hasSetConversation.current && !modelsQuery.data?.initial) ??
      false;
    /* Early exit if startupConfig is not loaded and conversation is already set and only initial models have loaded */
    if (!shouldSetConvo) {
      return;
    }

    const isNewConvo = conversationId === Constants.NEW_CONVO;

    const getNewConvoPreset = () => {
      const result = getDefaultModelSpec(startupConfig);
      const spec = result?.default ?? result?.last;
      let specPreset: TPreset | undefined;
      if (isCookingMode) {
        specPreset = getMiseDefaultPreset();
      } else if (spec) {
        specPreset = getModelSpecPreset(spec);
      }

      const queryParams: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        if (key !== 'prompt' && key !== 'q' && key !== 'submit') {
          queryParams[key] = value;
        }
      });
      const querySettings = processValidSettings(queryParams);

      if (Object.keys(querySettings).length > 0) {
        return mergeQuerySettingsWithSpec(specPreset, querySettings);
      }
      return specPreset;
    };

    if (isNewConvo && endpointsQuery.data && modelsQuery.data) {
      const preset = getNewConvoPreset();

      logger.log('conversation', 'ChatRoute, new convo effect', conversation);
      newConversation({
        modelsData: modelsQuery.data,
        template: isCookingMode ? getNewCookingConversationTemplate() : (conversation ?? undefined),
        routeBase: isCookingMode ? '/cook' : undefined,
        ...(preset ? { preset } : {}),
      });

      hasSetConversation.current = true;
    } else if (initialConvoQuery.data && endpointsQuery.data && modelsQuery.data) {
      logger.log('conversation', 'ChatRoute initialConvoQuery', initialConvoQuery.data);
      newConversation({
        template: initialConvoQuery.data,
        /* this is necessary to load all existing settings */
        preset: initialConvoQuery.data as TPreset,
        modelsData: modelsQuery.data,
        keepLatestMessage: true,
        buildDefault: isCookingMode ? false : true,
        routeBase: isCookingMode ? '/cook' : undefined,
      });
      hasSetConversation.current = true;
    } else if (
      conversationId &&
      endpointsQuery.data &&
      modelsQuery.data &&
      initialConvoQuery.isError &&
      isNotFoundError(initialConvoQuery.error)
    ) {
      const result = getDefaultModelSpec(startupConfig);
      const spec = result?.default ?? result?.last;
      showToast({
        message: localize('com_ui_conversation_not_found'),
        severity: NotificationSeverity.WARNING,
      });
      logger.log(
        'conversation',
        'ChatRoute initialConvoQuery isNotFoundError',
        initialConvoQuery.error,
      );
      newConversation({
        modelsData: modelsQuery.data,
        ...(spec ? { preset: getModelSpecPreset(spec) } : {}),
      });
      hasSetConversation.current = true;
    }
    /* Creates infinite render if all dependencies included due to newConversation invocations exceeding call stack before hasSetConversation.current becomes truthy */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roles,
    startupConfig,
    initialConvoQuery.data,
    initialConvoQuery.isError,
    endpointsQuery.data,
    modelsQuery.data,
  ]);

  if (endpointsQuery.isLoading || modelsQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // if not a conversation
  if (conversation?.conversationId === Constants.SEARCH) {
    return null;
  }
  // if conversationId not match
  if (conversation?.conversationId !== conversationId && !conversation) {
    return null;
  }
  // if conversationId is null
  if (!conversationId) {
    return null;
  }

  return (
    <ToolCallsMapProvider conversationId={conversation.conversationId ?? ''}>
      {isCookingMode ? (
        <CookingChatProvider value={{ isCookingChat: true }}>
          <CookingWorkspace
            index={index}
            conversationId={activeConversationId ?? conversationId}
            chatConversationId={conversationId}
            draft={activeDraft}
            documents={documents}
            documentsLoaded={documentsLoaded}
            selectedDocumentId={selectedDocumentId}
            markdown={getCookingCanvasMarkdown({
              draftMarkdown: activeDraft?.documentMarkdown,
            })}
            isPreparingDraft={isSubmitting || documentsQuery.isLoading}
          />
        </CookingChatProvider>
      ) : (
        <ChatView index={index} />
      )}
    </ToolCallsMapProvider>
  );
}
