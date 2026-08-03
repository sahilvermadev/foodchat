import { S2sWsRealtimeClient } from './s2s-ws-client';

type SocketListener = (event: Event) => void;

class TestWebSocket {
  static readonly OPEN = 1;
  static instances: TestWebSocket[] = [];

  readonly send = jest.fn();
  readonly close = jest.fn();
  readonly listeners = new Map<string, Set<SocketListener>>();
  binaryType = '';
  readyState = TestWebSocket.OPEN;

  constructor(readonly url: string) {
    TestWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: SocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }
}

describe('S2sWsRealtimeClient authentication', () => {
  const OriginalWebSocket = global.WebSocket;
  const originalFetch = global.fetch;

  beforeEach(() => {
    TestWebSocket.instances = [];
    global.WebSocket = TestWebSocket as never;
  });

  afterAll(() => {
    global.WebSocket = OriginalWebSocket;
    global.fetch = originalFetch;
  });

  test('parses the canonical Rekky voice grant', () => {
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });

    expect(
      client['_parseGrant']({
        connect_url: 'wss://voice.example/v1/realtime',
        expires_at: '2026-08-03T12:34:56.000Z',
        token: 'signed-grant',
      }),
    ).toEqual({
      connect_url: 'wss://voice.example/v1/realtime',
      connectUrl: 'wss://voice.example/v1/realtime',
      expires_at: '2026-08-03T12:34:56.000Z',
      token: 'signed-grant',
    });
  });

  test('authenticates as the first message immediately after socket open', async () => {
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });

    const opened = client['_openWebSocket']('wss://voice.example/v1/realtime', 'signed-grant');
    const socket = TestWebSocket.instances[0];

    expect(socket.send).not.toHaveBeenCalled();
    socket.emit('open');
    await opened;

    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'rekky.authenticate', token: 'signed-grant' }),
    );
    expect(client.status).toBe('authenticating');
  });

  test('rejects legacy grants that omit the canonical token', () => {
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });

    expect(() =>
      client['_parseGrant']({
        connect_url: 'wss://voice.example/v1/realtime',
        expires_at: '2026-08-03T12:34:56.000Z',
        session_token: 'legacy-token',
      } as never),
    ).toThrow('invalid session grant');
  });

  test('does not stream microphone audio until the session update is acknowledged', async () => {
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });
    const socket = new TestWebSocket('wss://voice.example/v1/realtime');
    client['_ws'] = socket as never;

    await client['_onWsMessage'](JSON.stringify({ type: 'session.created' }));
    client['_onMicChunk'](new Uint8Array([1, 0]).buffer as ArrayBuffer);

    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({
      session: {
        audio: { input: { turn_detection: { interrupt_response: true } } },
        instructions: 'Cook safely.',
      },
      type: 'session.update',
    });

    await client['_onWsMessage'](JSON.stringify({ type: 'session.updated' }));
    client['_onMicChunk'](new Uint8Array([1, 0]).buffer as ArrayBuffer);

    expect(socket.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(socket.send.mock.calls[1][0])).toEqual({
      audio: 'AQA=',
      type: 'input_audio_buffer.append',
    });
  });

  test('requests a fresh grant for every connection attempt', async () => {
    const grants = ['grant-1', 'grant-2'];
    global.fetch = jest.fn().mockImplementation(() => {
      const token = grants.shift();
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            connect_url: 'wss://voice.rekky.ai/v1/realtime',
            expires_at: '2026-08-03T12:34:56.000Z',
            token,
          }),
        ok: true,
      });
    }) as never;
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });

    await expect(client['_postSession']()).resolves.toMatchObject({ token: 'grant-1' });
    await expect(client['_postSession']()).resolves.toMatchObject({ token: 'grant-2' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('cancels active output and ignores its late audio and transcript deltas', async () => {
    const client = new S2sWsRealtimeClient({
      instructions: 'Cook safely.',
      sessionUrl: '/api/cooking/voice/session',
      voice: 'Aiden',
    });
    const socket = new TestWebSocket('wss://voice.rekky.ai/v1/realtime');
    const playbackPost = jest.fn();
    const finished = jest.fn();
    client['_ws'] = socket as never;
    client['_playbackNode'] = { port: { postMessage: playbackPost } } as never;
    client.addEventListener('response-finished', finished);

    await client['_onWsMessage'](
      JSON.stringify({ type: 'response.created', response: { id: 'response-1' } }),
    );
    await client['_onWsMessage'](JSON.stringify({ type: 'input_audio_buffer.speech_started' }));
    await client['_onWsMessage'](
      JSON.stringify({
        type: 'response.output_audio.delta',
        response_id: 'response-1',
        delta: 'AQA=',
      }),
    );
    await client['_onWsMessage'](
      JSON.stringify({
        type: 'response.output_audio_transcript.delta',
        response_id: 'response-1',
        delta: 'stale answer',
      }),
    );
    await client['_onWsMessage'](
      JSON.stringify({
        type: 'response.done',
        response: { id: 'response-1', status: 'cancelled' },
      }),
    );

    expect(playbackPost).toHaveBeenCalledTimes(1);
    expect(playbackPost).toHaveBeenCalledWith({ kind: 'clear' });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'response.cancel' }));
    expect(finished).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ responseId: 'response-1', transcript: '' }),
      }),
    );
  });
});
