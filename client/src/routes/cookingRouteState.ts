import { Constants } from 'librechat-data-provider';
import type { CookingDraft } from 'librechat-data-provider';

export function getActiveCookingConversationId({
  isCookingMode,
  routeConversationId,
  stateConversationId,
  allowStateConversationFallback = false,
}: {
  isCookingMode: boolean;
  routeConversationId?: string;
  stateConversationId?: string | null;
  allowStateConversationFallback?: boolean;
}): string | undefined {
  const routeExistingConversationId =
    routeConversationId && routeConversationId !== Constants.NEW_CONVO
      ? routeConversationId
      : undefined;
  const stateExistingConversationId =
    stateConversationId && stateConversationId !== Constants.NEW_CONVO
      ? stateConversationId
      : undefined;

  if (isCookingMode) {
    return (
      routeExistingConversationId ??
      (allowStateConversationFallback ? stateExistingConversationId : undefined)
    );
  }

  if (stateExistingConversationId) {
    return stateExistingConversationId;
  }

  return routeExistingConversationId;
}

export function getNewCookingConversationTemplate() {
  return {
    conversationId: Constants.NEW_CONVO as string,
    title: 'New Chat',
  };
}

export function getCookingDocumentsForActiveConversation(
  documents: CookingDraft[] | undefined,
  activeConversationId?: string,
): CookingDraft[] {
  if (!activeConversationId) {
    return [];
  }
  return (documents ?? []).filter((document) => document.conversationId === activeConversationId);
}
