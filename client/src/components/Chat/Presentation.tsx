import { useEffect } from 'react';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { useDeleteFilesMutation } from '~/data-provider';
import { SidePanelGroup } from '~/components/SidePanel';
import { useSetFilesToDelete } from '~/hooks';
import { cn } from '~/utils';

export default function Presentation({
  children,
  transparentBackground = false,
}: {
  children: React.ReactNode;
  transparentBackground?: boolean;
}) {
  const setFilesToDelete = useSetFilesToDelete();

  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Temporary Files deleted');
      setFilesToDelete({});
    },
    onError: (error) => {
      console.log('Error deleting temporary files:', error);
    },
  });

  useEffect(() => {
    const filesToDelete = localStorage.getItem(LocalStorageKeys.FILES_TO_DELETE);
    const map = JSON.parse(filesToDelete ?? '{}') as Record<string, ExtendedFile>;
    const files = Object.values(map)
      .filter(
        (file) =>
          file.filepath != null && file.source && !(file.embedded ?? false) && file.temp_file_id,
      )
      .map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath as string,
        source: file.source as FileSources,
        embedded: !!(file.embedded ?? false),
      }));

    if (files.length === 0) {
      return;
    }
    mutateAsync({ files });
  }, [mutateAsync]);

  return (
    <DragDropWrapper
      className={cn(
        'relative flex w-full grow overflow-hidden',
        transparentBackground ? 'bg-transparent' : 'bg-presentation',
      )}
    >
      <SidePanelGroup transparentBackground={transparentBackground}>
        <main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto" role="main">
          {children}
        </main>
      </SidePanelGroup>
    </DragDropWrapper>
  );
}
