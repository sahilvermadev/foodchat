import { memo, useMemo } from 'react';
import { AttachmentIcon, TooltipAnchor } from '@librechat/client';
import {
  Constants,
  supportsFiles,
  mergeFileConfig,
  resolveEndpointType,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useGetFileConfig, useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import AttachFileMenu from './AttachFileMenu';

function DisabledAttachmentButton() {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_sidepanel_attach_files')}
      disabled
      render={
        <button
          type="button"
          disabled
          aria-label={localize('com_sidepanel_attach_files')}
          className="flex size-11 items-center justify-center rounded-full p-1 disabled:cursor-not-allowed"
        >
          <AttachmentIcon />
        </button>
      }
    />
  );
}

function AttachFileChat({
  disableInputs,
  conversation,
  files,
  setFiles,
  setFilesLoading,
}: {
  disableInputs: boolean;
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const { endpoint } = conversation ?? { endpoint: null };

  const { data: fileConfig = null, isLoading: isFileConfigLoading } = useGetFileConfig({
    select: (data) => mergeFileConfig(data as Parameters<typeof mergeFileConfig>[0]),
  });

  const { data: endpointsConfig, isLoading: areEndpointsLoading } = useGetEndpointsQuery();

  const endpointType = useMemo(
    () => resolveEndpointType(endpointsConfig, endpoint),
    [endpointsConfig, endpoint],
  );
  const endpointFileConfig = useMemo(
    () =>
      getEndpointFileConfig({
        fileConfig,
        endpointType,
        endpoint,
      }),
    [endpoint, fileConfig, endpointType],
  );
  const endpointSupportsFiles: boolean = useMemo(
    () => supportsFiles[endpointType ?? endpoint ?? ''] ?? false,
    [endpointType, endpoint],
  );
  const isUploadDisabled = useMemo(
    () => (disableInputs || endpointFileConfig?.disabled) ?? false,
    [disableInputs, endpointFileConfig?.disabled],
  );

  if (!endpoint || isFileConfigLoading || areEndpointsLoading) {
    return <DisabledAttachmentButton />;
  }

  if (endpointSupportsFiles && !isUploadDisabled) {
    return (
      <AttachFileMenu
        endpoint={endpoint}
        disabled={disableInputs}
        endpointType={endpointType}
        conversationId={conversationId}
        endpointFileConfig={endpointFileConfig}
        useResponsesApi={conversation?.useResponsesApi}
        files={files}
        setFiles={setFiles}
        setFilesLoading={setFilesLoading}
        conversation={conversation}
      />
    );
  }
  return null;
}

export default memo(AttachFileChat);
