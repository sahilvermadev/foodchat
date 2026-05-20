import { createContext, useContext } from 'react';

type CookingChatContextValue = {
  isCookingChat: boolean;
};

const CookingChatContext = createContext<CookingChatContextValue>({ isCookingChat: false });

export const CookingChatProvider = CookingChatContext.Provider;

export function useCookingChat() {
  return useContext(CookingChatContext);
}
