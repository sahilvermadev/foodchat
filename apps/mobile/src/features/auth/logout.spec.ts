import { terminateSession } from './logout';

describe('terminateSession', () => {
  it('finishes local logout without waiting for remote revocation', async () => {
    let finishRevocation: (() => void) | undefined;
    const revoke = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRevocation = resolve;
        }),
    );
    const clear = jest.fn().mockResolvedValue(undefined);

    await terminateSession({ clear, revoke });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    finishRevocation?.();
  });

  it('still clears locally when no remote session can be revoked', async () => {
    const clear = jest.fn().mockResolvedValue(undefined);

    await terminateSession({ clear });

    expect(clear).toHaveBeenCalledTimes(1);
  });
});
