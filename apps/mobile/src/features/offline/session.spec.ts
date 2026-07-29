import { canRefreshSession, credentialsWereRejected } from '../auth/session';
import { connectivityStatusFor } from '../connectivity/state';

const responseError = (status: number) => Object.assign(new Error('Request failed'), { status });

describe('offline cold-start session boundary', () => {
  test('keeps connectivity unknown until internet reachability is confirmed', () => {
    expect(connectivityStatusFor(null, null)).toBe('unknown');
    expect(connectivityStatusFor(true, null)).toBe('unknown');
    expect(connectivityStatusFor(true, true)).toBe('online');
    expect(connectivityStatusFor(true, false)).toBe('offline');
  });

  test('does not attempt refresh while connectivity is unknown or offline', () => {
    expect(canRefreshSession('unknown')).toBe(false);
    expect(canRefreshSession('offline')).toBe(false);
    expect(canRefreshSession('online')).toBe(true);
  });

  test('only confirmed credential rejection can invalidate local data', () => {
    expect(credentialsWereRejected(responseError(401))).toBe(true);
    expect(credentialsWereRejected(responseError(403))).toBe(true);
    expect(credentialsWereRejected(responseError(503))).toBe(false);
    expect(credentialsWereRejected(new Error('Network request failed'))).toBe(false);
  });
});
