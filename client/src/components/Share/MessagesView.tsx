import { useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import MultiMessage from './MultiMessage';
import { useLocalize } from '~/hooks';

export default function MessagesView({
  messagesTree,
  conversationId,
}: {
  messagesTree?: TMessage[] | null;
  conversationId: string;
}) {
  const localize = useLocalize();
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="relative h-full dark:gpt-dark-gray">
        <div className="h-full w-full overflow-y-auto">
          <div className="flex flex-col pb-16 text-sm dark:bg-transparent">
            {messagesTree == null || messagesTree.length === 0 ? (
              <div className="flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
                {localize('com_ui_nothing_found')}
              </div>
            ) : (
              <MultiMessage
                key={conversationId}
                messagesTree={messagesTree}
                messageId={conversationId}
                setCurrentEditId={setCurrentEditId}
                currentEditId={currentEditId}
              />
            )}
            <div className="group h-0 w-full flex-shrink-0 dark:gpt-dark-gray dark:border-gray-800/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
