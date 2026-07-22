import { createContext, useContext } from 'react';

export type HistoryActions = {
  activeConversationId?: string;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
};

type AppShellContextValue = {
  openHistory: (actions: HistoryActions) => void;
};

let registeredOpenHistory: ((actions: HistoryActions) => void) | undefined;

const routerShell: AppShellContextValue = {
  openHistory: (actions) => registeredOpenHistory?.(actions),
};

const AppShellContext = createContext<AppShellContextValue>(routerShell);

export const AppShellProvider = AppShellContext.Provider;

export function registerOpenHistory(openHistory: (actions: HistoryActions) => void) {
  registeredOpenHistory = openHistory;
  return () => {
    if (registeredOpenHistory === openHistory) registeredOpenHistory = undefined;
  };
}

export function useAppShell() {
  return useContext(AppShellContext);
}
