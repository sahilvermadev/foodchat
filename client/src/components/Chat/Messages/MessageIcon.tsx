import { useMemo, memo } from 'react';
import { getEndpointField } from 'librechat-data-provider';
import type { Assistant, Agent, TConversation, TMessage } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

type MessageIconProps = {
  iconData?: TMessageIcon;
  message?: TMessage;
  conversation?: TConversation | null;
  assistant?: Assistant;
  agent?: Agent;
};

/**
 * Compares only the fields MessageIcon actually renders.
 * `agent.id` / `assistant.id` are intentionally omitted because
 * this component renders display properties only, not identity-derived content.
 */
export function arePropsEqual(prev: MessageIconProps, next: MessageIconProps): boolean {
  const checks: [unknown, unknown][] = [
    [prev.iconData?.endpoint, next.iconData?.endpoint],
    [prev.iconData?.model, next.iconData?.model],
    [prev.iconData?.iconURL, next.iconData?.iconURL],
    [prev.iconData?.modelLabel, next.iconData?.modelLabel],
    [prev.iconData?.isCreatedByUser, next.iconData?.isCreatedByUser],
    [prev.message?.endpoint, next.message?.endpoint],
    [prev.message?.model, next.message?.model],
    [prev.message?.iconURL, next.message?.iconURL],
    [prev.message?.isCreatedByUser, next.message?.isCreatedByUser],
    [prev.conversation?.endpoint, next.conversation?.endpoint],
    [prev.conversation?.model, next.conversation?.model],
    [prev.conversation?.modelLabel, next.conversation?.modelLabel],
    [prev.agent?.name, next.agent?.name],
    [prev.agent?.avatar?.filepath, next.agent?.avatar?.filepath],
    [prev.assistant?.name, next.assistant?.name],
    [prev.assistant?.metadata?.avatar, next.assistant?.metadata?.avatar],
  ];

  for (const [prevVal, nextVal] of checks) {
    if (prevVal !== nextVal) {
      return false;
    }
  }
  return true;
}

const MessageIcon = memo(
  ({ iconData, message, conversation, assistant, agent }: MessageIconProps) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const resolvedIconData = useMemo<TMessageIcon | undefined>(() => {
    if (iconData) {
      return iconData;
    }
    if (!message) {
      return undefined;
    }
    return {
      endpoint: message.endpoint ?? conversation?.endpoint,
      model: message.model ?? conversation?.model,
      iconURL: message.iconURL,
      modelLabel: conversation?.modelLabel,
      isCreatedByUser: message.isCreatedByUser,
    };
  }, [iconData, message, conversation]);

  const agentName = agent?.name ?? '';
  const agentAvatar = agent?.avatar?.filepath ?? '';
  const assistantName = assistant?.name ?? '';
  const assistantAvatar = assistant?.metadata?.avatar ?? '';
  let avatarURL = '';
  if (assistant) {
    avatarURL = assistantAvatar;
  } else if (agent) {
    avatarURL = agentAvatar;
  }

  const iconURL = resolvedIconData?.iconURL;
  const endpoint = useMemo(
    () => getIconEndpoint({ endpointsConfig, iconURL, endpoint: resolvedIconData?.endpoint }),
    [endpointsConfig, iconURL, resolvedIconData?.endpoint],
  );

  const endpointIconURL = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'iconURL'),
    [endpointsConfig, endpoint],
  );

  if (resolvedIconData?.isCreatedByUser !== true && iconURL != null && iconURL.includes('http')) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={resolvedIconData?.modelLabel}
        context="message"
        assistantAvatar={assistantAvatar}
        agentAvatar={agentAvatar}
        endpointIconURL={endpointIconURL}
        assistantName={assistantName}
        agentName={agentName}
      />
    );
  }

  return (
    <Icon
      isCreatedByUser={resolvedIconData?.isCreatedByUser ?? false}
      endpoint={endpoint}
      iconURL={avatarURL || endpointIconURL}
      model={resolvedIconData?.model}
      assistantName={assistantName}
      agentName={agentName}
      size={28.8}
    />
  );
  },
  arePropsEqual,
);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
