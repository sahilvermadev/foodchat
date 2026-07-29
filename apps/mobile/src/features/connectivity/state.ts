export type ConnectivityStatus = 'unknown' | 'online' | 'offline';

export const connectivityStatusFor = (
  connected: boolean | null,
  reachable: boolean | null,
): ConnectivityStatus => {
  if (connected === false || reachable === false) return 'offline';
  if (connected === true && reachable === true) return 'online';
  return 'unknown';
};
