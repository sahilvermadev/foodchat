import { memo, useMemo } from 'react';
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
import AttachFileMenu from './AttachFileMenu';

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

  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data as Parameters<typeof mergeFileConfig>[0]),
  });

  const { data: endpointsConfig } = useGetEndpointsQuery();

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
