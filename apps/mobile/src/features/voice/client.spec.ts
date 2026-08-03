jest.mock('react-native-audio-api', () => ({
  AudioContext: jest.fn(),
  AudioManager: {},
  AudioRecorder: jest.fn(),
  decodePCMInBase64: jest.fn(),
}));

import { RecipeVoiceClient } from './client';

class TestWebSocket {
  static readonly OPEN = 1;
  static instance?: TestWebSocket;

  readonly sent: string[] = [];
  readyState = TestWebSocket.OPEN;
  onclose?: (event: { code: number; reason: string }) => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  onopen?: () => void;

  constructor(readonly url: string) {
    TestWebSocket.instance = this;
  }

  close() {}

  send(message: string) {
    this.sent.push(message);
  }

  emit(event: string | Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(typeof event === 'string' ? { type: event } : event) });
  }
}

describe('RecipeVoiceClient connection protocol', () => {
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    TestWebSocket.instance = undefined;
    global.WebSocket = TestWebSocket as never;
  });

  afterAll(() => {
    global.WebSocket = originalWebSocket;
  });

  it('authenticates first and waits for session.updated before becoming ready', async () => {
    const onStatus = jest.fn();
    const client = new RecipeVoiceClient({
      callbacks: {
        onError: jest.fn(),
        onInputLevel: jest.fn(),
        onResponseFinished: jest.fn(),
        onStatus,
        onTranscript: jest.fn(),
      },
      createSession: jest.fn(),
      instructions: 'Use the current recipe.',
    });

    const opening = client['openSocket']('wss://voice.rekky.ai/v1/realtime', 'one-time-token');
    const socket = TestWebSocket.instance;
    if (!socket) throw new Error('Test socket was not created');

    socket.onopen?.();
    expect(socket.sent).toEqual([
      JSON.stringify({ token: 'one-time-token', type: 'rekky.authenticate' }),
    ]);

    socket.emit('session.created');
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      session: {
        audio: { input: { turn_detection: { interrupt_response: true } } },
        instructions: 'Use the current recipe.',
      },
      type: 'session.update',
    });
    expect(onStatus).not.toHaveBeenCalledWith('listening');

    socket.emit('session.updated');
    await opening;
    expect(onStatus).toHaveBeenCalledWith('listening');
  });

  it('keeps barge-in active and ignores output from the cancelled response', async () => {
    const onTranscript = jest.fn();
    const client = new RecipeVoiceClient({
      callbacks: {
        onError: jest.fn(),
        onInputLevel: jest.fn(),
        onResponseFinished: jest.fn(),
        onStatus: jest.fn(),
        onTranscript,
      },
      createSession: jest.fn(),
      instructions: 'Use the current recipe.',
    });

    const opening = client['openSocket']('wss://voice.rekky.ai/v1/realtime', 'one-time-token');
    const socket = TestWebSocket.instance;
    if (!socket) throw new Error('Test socket was not created');
    socket.onopen?.();
    socket.emit('session.created');
    socket.emit('session.updated');
    await opening;

    socket.emit({ type: 'response.created', response: { id: 'response-1' } });
    socket.emit({
      type: 'response.output_audio.delta',
      response_id: 'response-1',
      delta: 'AQA=',
    });
    socket.emit('input_audio_buffer.speech_started');

    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({ type: 'response.cancel' });

    socket.emit({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response-1',
      delta: 'stale response',
    });
    expect(onTranscript).not.toHaveBeenCalledWith('assistant', 'stale response');
  });
});
