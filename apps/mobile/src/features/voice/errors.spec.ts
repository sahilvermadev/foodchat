import { socketCloseError, VoiceClientError } from './errors';

describe('voice connection errors', () => {
  it.each([1008, 1011])('classifies close code %i as unavailable', (code) => {
    expect(socketCloseError(code, '')).toMatchObject({
      code: 'unavailable',
      message: 'Voice mode disconnected.',
      name: 'VoiceClientError',
    });
  });

  it('preserves an interruption reason', () => {
    const error = socketCloseError(1006, 'Network connection lost');

    expect(error).toBeInstanceOf(VoiceClientError);
    expect(error).toMatchObject({ code: 'interrupted', message: 'Network connection lost' });
  });
});
