import React, { useMemo } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { ImageUpIcon, FileType2Icon, FileImageIcon } from 'lucide-react';
import {
  Providers,
  inferMimeType,
  EToolResources,
  EModelEndpoint,
  isBedrockDocumentType,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useDragDropContext } from '~/Providers';

interface DragDropModalProps {
  onOptionSelect: (option: EToolResources | undefined) => void;
  files: File[];
  isVisible: boolean;
  setShowModal: (showModal: boolean) => void;
}

interface FileOption {
  label: string;
  value?: EToolResources;
  icon: React.JSX.Element;
  condition?: boolean;
}

const DragDropModal = ({ onOptionSelect, setShowModal, files, isVisible }: DragDropModalProps) => {
  const localize = useLocalize();
  const { endpoint, endpointType, useResponsesApi } = useDragDropContext();

  const options = useMemo(() => {
    const _options: FileOption[] = [];
    let currentProvider = endpoint;

    // This will be removed in a future PR to formally normalize Providers comparisons to be case insensitive
    if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
      currentProvider = Providers.OPENROUTER;
    }

    /** Helper to get inferred MIME type for a file */
    const getFileType = (file: File) => inferMimeType(file.name, file.type);

    const isAzureWithResponsesApi =
      (currentProvider === EModelEndpoint.azureOpenAI ||
        endpointType === EModelEndpoint.azureOpenAI) &&
      useResponsesApi === true;

    // Check if provider supports document upload
    if (
      isDocumentSupportedProvider(endpointType) ||
      isDocumentSupportedProvider(currentProvider) ||
      isAzureWithResponsesApi
    ) {
      const supportsImageDocVideoAudio =
        currentProvider === EModelEndpoint.google || currentProvider === Providers.OPENROUTER;
      const isBedrock =
        currentProvider === Providers.BEDROCK || endpointType === EModelEndpoint.bedrock;

      const isValidProviderFile = (file: File): boolean => {
        const type = getFileType(file);
        if (supportsImageDocVideoAudio) {
          return (
            type?.startsWith('image/') ||
            type?.startsWith('video/') ||
            type?.startsWith('audio/') ||
            type === 'application/pdf'
          );
        }
        if (isBedrock) {
          return type?.startsWith('image/') || isBedrockDocumentType(type);
        }
        return type?.startsWith('image/') || type === 'application/pdf';
      };

      const validFileTypes = files.every(isValidProviderFile);

      _options.push({
        label: localize('com_ui_upload_provider'),
        value: undefined,
        icon: <FileImageIcon className="icon-md" />,
        condition: validFileTypes,
      });
    } else {
      // Only show image upload option if all files are images and provider doesn't support documents
      _options.push({
        label: localize('com_ui_upload_image_input'),
        value: undefined,
        icon: <ImageUpIcon className="icon-md" />,
        condition: files.every((file) => getFileType(file)?.startsWith('image/')),
      });
    }
    _options.push({
      label: localize('com_ui_upload_ocr_text'),
      value: EToolResources.context,
      icon: <FileType2Icon className="icon-md" />,
    });

    return _options;
  }, [files, localize, endpoint, endpointType, useResponsesApi]);

  if (!isVisible) {
    return null;
  }

  return (
    <OGDialog open={isVisible} onOpenChange={setShowModal}>
      <OGDialogTemplate
        title={localize('com_ui_upload_type')}
        className="w-11/12 sm:w-[440px] md:w-[400px] lg:w-[360px]"
        main={
          <div className="flex flex-col gap-2">
            {options.map(
              (option, index) =>
                option.condition !== false && (
                  <button
                    key={index}
                    onClick={() => onOptionSelect(option.value)}
                    className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-active-alt"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ),
            )}
          </div>
        }
      />
    </OGDialog>
  );
};

export default DragDropModal;
