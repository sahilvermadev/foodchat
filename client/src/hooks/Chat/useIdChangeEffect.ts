import { useEffect, useRef } from 'react';
import { logger } from '~/utils';

/**
 * Hook to log conversation ID changes.
 * @param conversationId - The current conversation ID
 */
export default function useIdChangeEffect(conversationId: string) {
  const lastConvoId = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId !== lastConvoId.current) {
      logger.log('conversation', 'Conversation ID change');
    }
    lastConvoId.current = conversationId;
  }, [conversationId]);
}
