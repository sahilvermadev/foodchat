import { useState } from 'react';
import { fetch } from 'expo/fetch';
import * as ImagePicker from 'expo-image-picker';

import type { TFile, TFileUpload } from 'librechat-data-provider';

import { authenticatedApiResponse } from '@/lib/api/client';
import { userErrorMessage } from '@/lib/errors';

export type CookAttachment = { file: TFile; uri: string };

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function useCookAttachments() {
  const [attachments, setAttachments] = useState<CookAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  const pickImage = async () => {
    if (uploading) return false;
    setError(undefined);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access to attach a recipe image.');
      return false;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.9,
      selectionLimit: 1,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return false;

    setUploading(true);
    try {
      const fileId = createId();
      const filename = asset.fileName || `recipe-${fileId}.jpg`;
      const localResponse = await fetch(asset.uri);
      const blob = await localResponse.blob();
      const form = new FormData();
      form.append('endpoint', 'openAI');
      form.append('endpointType', 'openAI');
      form.append('file', blob, filename);
      form.append('file_id', fileId);
      form.append('message_file', 'true');
      if (asset.width) form.append('width', String(asset.width));
      if (asset.height) form.append('height', String(asset.height));
      const response = await authenticatedApiResponse('/api/files/images', {
        method: 'POST',
        body: form,
      });
      const file = (await response.json()) as TFileUpload;
      setAttachments((current) => [...current, { file, uri: asset.uri }]);
      return true;
    } catch (caught) {
      setError(userErrorMessage(caught, 'The photo could not be attached. Please try again.'));
      return false;
    } finally {
      setUploading(false);
    }
  };

  const remove = (fileId: string) => {
    setAttachments((current) => current.filter(({ file }) => file.file_id !== fileId));
  };

  return {
    attachments,
    uploading,
    error,
    pickImage,
    remove,
    clear: () => setAttachments([]),
  };
}
