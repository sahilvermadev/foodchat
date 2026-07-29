type SessionTermination = {
  clear(): Promise<void>;
  revoke?: () => Promise<void>;
};

export async function terminateSession({ clear, revoke }: SessionTermination): Promise<void> {
  const revocation = revoke?.().catch(() => undefined);
  await clear();
  void revocation;
}
