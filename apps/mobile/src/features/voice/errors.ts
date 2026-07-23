export type VoiceClientErrorCode = 'interrupted' | 'permission' | 'unavailable';

export class VoiceClientError extends Error {
  constructor(
    readonly code: VoiceClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceClientError';
  }
}

export const voiceError = (code: VoiceClientErrorCode, message: string) =>
  new VoiceClientError(code, message);

export function socketCloseError(code: number, reason: string): VoiceClientError {
  const unavailable = code === 1008 || code === 1011;
  return voiceError(
    unavailable ? 'unavailable' : 'interrupted',
    reason || 'Voice mode disconnected.',
  );
}
