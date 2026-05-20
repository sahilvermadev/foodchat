import React, { createContext, useContext, useMemo } from 'react';
import { resolveEndpointType } from 'librechat-data-provider';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from './ChatContext';

interface DragDropContextValue {
  conversationId: string | null | undefined;
  agentId: string | null | undefined;
  endpoint: string | null | undefined;
  endpointType?: EModelEndpoint | string | undefined;
  useResponsesApi?: boolean;
}

const DragDropContext = createContext<DragDropContextValue | undefined>(undefined);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(
    () => resolveEndpointType(endpointsConfig, conversation?.endpoint),
    [endpointsConfig, conversation?.endpoint],
  );

  /** Context value only created when conversation fields change */
  const contextValue = useMemo<DragDropContextValue>(
    () => ({
      conversationId: conversation?.conversationId,
      agentId: conversation?.agent_id,
      endpoint: conversation?.endpoint,
      endpointType: endpointType,
      useResponsesApi: conversation?.useResponsesApi,
    }),
    [
      conversation?.conversationId,
      conversation?.agent_id,
      conversation?.endpoint,
      conversation?.useResponsesApi,
      endpointType,
    ],
  );

  return <DragDropContext.Provider value={contextValue}>{children}</DragDropContext.Provider>;
}

const defaultDragDropValue: DragDropContextValue = {
  conversationId: undefined,
  agentId: undefined,
  endpoint: undefined,
  endpointType: undefined,
  useResponsesApi: undefined,
};

export function useDragDropContext() {
  return useContext(DragDropContext) ?? defaultDragDropValue;
}
