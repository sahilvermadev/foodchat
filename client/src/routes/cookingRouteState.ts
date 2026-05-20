import { Constants } from 'librechat-data-provider';

export function getActiveCookingConversationId({
  isCookingMode,
  routeConversationId,
  stateConversationId,
}: {
  isCookingMode: boolean;
  routeConversationId?: string;
  stateConversationId?: string | null;
}): string | undefined {
  const routeExistingConversationId =
    routeConversationId && routeConversationId !== Constants.NEW_CONVO
      ? routeConversationId
      : undefined;

  if (isCookingMode) {
    return routeExistingConversationId;
  }

  if (stateConversationId && stateConversationId !== Constants.NEW_CONVO) {
    return stateConversationId;
  }

  return routeExistingConversationId;
}

export function getNewCookingConversationTemplate() {
  return {
    conversationId: Constants.NEW_CONVO as string,
    title: 'New Chat',
  };
}
