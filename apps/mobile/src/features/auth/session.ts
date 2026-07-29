import type { ConnectivityStatus } from '../connectivity/state';

export const canRefreshSession = (status: ConnectivityStatus) => status === 'online';

export const credentialsWereRejected = (error: Error & { status?: number }) =>
  error.status === 401 || error.status === 403;
