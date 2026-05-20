import { createContext, useContext } from 'react';
import type { TAgentsMap } from 'librechat-data-provider';

type AgentsMapContextType = TAgentsMap;

export const AgentsMapContext = createContext<AgentsMapContextType>({} as AgentsMapContextType);
export const useAgentsMapContext = () => useContext(AgentsMapContext);
