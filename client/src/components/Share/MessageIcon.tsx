import { UserIcon } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageEndpointIcon from '../Endpoints/MessageEndpointIcon';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getIconEndpoint } from '~/utils';

export default function MessageIcon(props: Pick<TMessageProps, 'message' | 'conversation'>) {
  const { message, conversation } = props;
  const messageSettings = {
    ...(conversation ?? {}),
    ...({
      ...message,
      iconURL: message?.iconURL ?? '',
    } as TMessage),
  };

  const iconURL = messageSettings.iconURL ?? '';
  const endpoint = getIconEndpoint({
    endpointsConfig: undefined,
    iconURL,
    endpoint: messageSettings.endpoint,
  });

  if (message?.isCreatedByUser !== true && iconURL && iconURL.includes('http')) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={messageSettings.chatGptLabel ?? messageSettings.modelLabel ?? ''}
        context="message"
      />
    );
  }

  if (message?.isCreatedByUser === true) {
    return (
      <div className="relative flex h-5 w-5 items-center justify-center rounded-sm bg-[#7989ff] p-1 text-white shadow-[rgba(240,246,252,0.1)_0_0_0_1px]">
        <UserIcon />
      </div>
    );
  }

  return (
    <MessageEndpointIcon
      {...messageSettings}
      endpoint={endpoint}
      iconURL=""
      model={message?.model ?? conversation?.model}
      size={28.8}
    />
  );
}
