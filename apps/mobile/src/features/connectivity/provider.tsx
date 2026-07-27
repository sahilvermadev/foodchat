import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { PropsWithChildren } from 'react';

type ConnectivityContextValue = {
  isOnline: boolean;
};

let online: boolean | null = null;

const ConnectivityContext = createContext<ConnectivityContextValue>({ isOnline: true });

const hasInternet = (connected: boolean | null, reachable: boolean | null) =>
  connected !== false && reachable !== false;

export function isOnlineNow() {
  return online !== false;
}

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const next = hasInternet(state.isConnected, state.isInternetReachable);
      online = next;
      onlineManager.setOnline(next);
      setIsOnline(next);
    });
  }, []);

  const value = useMemo(() => ({ isOnline }), [isOnline]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
