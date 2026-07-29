import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { PropsWithChildren } from 'react';
import { connectivityStatusFor } from './state';
import type { ConnectivityStatus } from './state';

export type { ConnectivityStatus } from './state';

type ConnectivityContextValue = {
  status: ConnectivityStatus;
  isOnline: boolean;
};

let connectivityStatus: ConnectivityStatus = 'unknown';
onlineManager.setOnline(false);

const ConnectivityContext = createContext<ConnectivityContextValue>({
  status: 'unknown',
  isOnline: false,
});

export function isOnlineNow() {
  return connectivityStatus === 'online';
}

export function connectivityStatusNow() {
  return connectivityStatus;
}

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<ConnectivityStatus>('unknown');

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      connectivityStatus = connectivityStatusFor(state.isConnected, state.isInternetReachable);
      onlineManager.setOnline(connectivityStatus === 'online');
      setStatus(connectivityStatus);
    });
  }, []);

  const value = useMemo(() => ({ status, isOnline: status === 'online' }), [status]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
