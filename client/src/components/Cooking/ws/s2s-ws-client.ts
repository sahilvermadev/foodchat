import {
  base64FromArrayBuffer,
  base64ToBytes,
  extractResponseTranscript,
  trimTrailingSlash,
} from './codec';
import { OrbVisualiser, VIS_FFT_SIZE } from './orb-visualizer';

export type WsStatus =
  | 'idle'
  | 'creating-session'
  | 'queued'
  | 'your-turn'
  | 'connecting'
  | 'connected'
  | 'user-speaking'
  | 'processing'
  | 'ai-speaking'
  | 'closed'
  | 'error';

export interface WsSessionInfo {
  sessionId: string;
  connectUrl: string;
  websocketUrl: string;
  sessionToken: string;
  pendingTimeoutS: number;
  tier?: 'anon' | 'free' | 'pro';
  limited?: boolean;
  heartbeatSec?: number;
  remainingSec?: number;
}

export interface ToolDef {
  type: 'function';
  name: string;
  description: string;
  parameters: object;
}

export interface NoiseGate {
  enabled: boolean;
  thresholdDb: number;
}

export interface WsClientOptions {
  sessionUrl?: string;
  loadBalancerUrl?: string;
  directUrl?: string;
  voice: string;
  instructions: string;
  micStream?: MediaStream;
  acquireMic?: () => Promise<MediaStream>;
  audioContext?: AudioContext;
  tools?: ToolDef[];
  noiseGate?: NoiseGate;
}

function _codedError(message: string, code: string, extra?: object) {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

const OUTPUT_SAMPLE_RATE = 16000;
const MIC_CHUNK_MS = 40;

export class S2sWsRealtimeClient extends EventTarget {
  public options: WsClientOptions;
  private _tools: ToolDef[];
  private _directUrl: string;
  private _sessionUrl: string;
  private _acquireMic: (() => Promise<MediaStream>) | null;
  private _closed = false;
  private _queueId = '';
  private _queueWake: (() => void) | null = null;
  private _queueTimer: any = 0;
  private _joinResolve: (() => void) | null = null;
  private _joinReject: ((err: Error) => void) | null = null;
  private _joinTimer: any = 0;
  private _noiseGate: NoiseGate;
  private _ws: WebSocket | null = null;
  private _ctx: AudioContext | null = null;
  private _micSrc: MediaStreamAudioSourceNode | null = null;
  private _captureNode: AudioWorkletNode | null = null;
  private _playbackNode: AudioWorkletNode | null = null;
  private _micAnalyser: AnalyserNode | null = null;
  private _outAnalyser: AnalyserNode | null = null;
  private _visualiser: OrbVisualiser | null = null;
  private _status: WsStatus = 'idle';
  private _aiSpeaking = false;
  private _audibleResponses = new Set<string>();
  private _asstTranscriptByResp = new Map<string, string>();
  private _asstFullByResp = new Map<string, string>();
  private _muted = false;
  private _openResponses = 0;
  private _createInFlight = false;
  private _createQueue: any[] = [];
  private _sessionConfigured = false;
  private _debug = false;

  constructor(options: WsClientOptions) {
    super();
    this.options = options;
    this._tools = options.tools ?? [];
    this._directUrl = options.directUrl ?? '';
    this._sessionUrl = options.sessionUrl
      ? options.sessionUrl
      : options.loadBalancerUrl
        ? `${trimTrailingSlash(options.loadBalancerUrl)}/session`
        : '';
    this._acquireMic = options.acquireMic ?? null;
    this._noiseGate = options.noiseGate ?? { enabled: false, thresholdDb: -45 };
    try {
      this._debug = localStorage.getItem('s2s.debug') === '1';
    } catch {
      // ignore
    }
  }

  get status(): WsStatus {
    return this._status;
  }

  private _setStatus(status: WsStatus) {
    if (this._status === status) return;
    this._status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: { status } }));
  }

  private _asstDisplay(rid: string): string {
    const full = this._asstFullByResp.get(rid) || '';
    const seg = this._asstTranscriptByResp.get(rid) || '';
    if (!seg) return full;
    return full ? `${full} ${seg}` : seg;
  }

  private _markAudible() {
    if (this._status === 'ai-speaking') return;
    if (this._status === 'closed' || this._status === 'error') return;
    this._setStatus('ai-speaking');
  }

  public getVisualiser(): OrbVisualiser | null {
    return this._visualiser;
  }

  async connect() {
    if (this._ws) throw new Error('Already connected');

    let connectUrl: string;
    if (this._directUrl) {
      connectUrl = this._directUrl;
      this._setStatus('connecting');
    } else {
      if (!this._sessionUrl) {
        throw new Error('No session endpoint or direct URL configured');
      }
      let grant: WsSessionInfo | undefined;
      let waited = false;
      let retries = 3;
      while (retries > 0) {
        try {
          this._setStatus('creating-session');
          const res = await this._createSessionOrQueue();
          grant = res.grant;
          waited = res.waited;
          break;
        } catch (err: any) {
          if (this._closed) throw err;
          if (err?.code === 'queue-expired' && retries > 1) {
            console.warn('Queue ticket expired/404, retrying session creation. Retries left:', retries - 1, err);
            retries--;
            continue;
          }
          throw err;
        }
      }

      if (!grant) {
        throw new Error('Failed to obtain a valid session grant');
      }

      if (this._closed) throw _codedError('connect aborted', 'aborted');

      if (waited) {
        await this._awaitJoin(grant);
        if (this._closed) throw _codedError('connect aborted', 'aborted');
      }
      this.dispatchEvent(new CustomEvent('session', { detail: { info: grant } }));
      connectUrl = grant.connectUrl;
      this._setStatus('connecting');
    }

    if (!this.options.micStream && this._acquireMic) {
      this.options.micStream = await this._acquireMic();
    }

    const audioReady = this._setupAudio();
    const wsReady = this._openWebSocket(connectUrl);
    await Promise.all([audioReady, wsReady]);
  }

  async _createSessionOrQueue() {
    const first = await this._postSession();
    if (first.state === 'queued') {
      this._setStatus('queued');
      const grant = await this._pollQueue(first);
      return { grant, waited: true };
    }
    return { grant: first.grant, waited: false };
  }

  _awaitJoin(grant: WsSessionInfo): Promise<void> {
    const windowS = Math.max(3, (grant.pendingTimeoutS || 60) - 3);
    this._setStatus('your-turn');
    this.dispatchEvent(
      new CustomEvent('ready-to-join', { detail: { info: grant, expiresSec: windowS } }),
    );
    return new Promise((resolve, reject) => {
      this._joinResolve = resolve;
      this._joinReject = reject;
      this._joinTimer = setTimeout(() => {
        this._joinResolve = null;
        this._joinReject = null;
        reject(_codedError('Your spot expired', 'join-expired'));
      }, windowS * 1000);
    });
  }

  join() {
    if (this._joinTimer) {
      clearTimeout(this._joinTimer);
      this._joinTimer = 0;
    }
    try {
      void this.options.audioContext?.resume();
    } catch {
      // ignore
    }
    const resolve = this._joinResolve;
    this._joinResolve = null;
    this._joinReject = null;
    resolve?.();
  }

  async _postSession(): Promise<
    | { state: 'granted'; grant: WsSessionInfo }
    | { state: 'queued'; queueId: string; position: number; pollIntervalS: number }
  > {
    const url = this._sessionUrl;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (response.status === 402) {
      const body = await response.json().catch(() => ({}));
      throw _codedError('Daily conversation limit reached', 'limit', { tier: body?.tier });
    }
    if (response.status === 503) {
      const body = await response.json().catch(() => ({}));
      if (body?.state === 'at_capacity') {
        throw _codedError('The queue is full — try again shortly.', 'queue-full');
      }
      throw new Error('/session failed (503)');
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`/session failed (${response.status}): ${text}`);
    }
    const json = await response.json();
    if (json.state === 'queued') {
      return {
        state: 'queued',
        queueId: json.queue_id,
        position: json.position,
        pollIntervalS: json.poll_interval_s,
      };
    }
    return { state: 'granted', grant: this._parseGrant(json) };
  }

  async _pollQueue(ticket: { queueId: string; position: number; pollIntervalS: number }) {
    const intervalMs = Math.max(1, ticket.pollIntervalS || 2) * 1000;
    this._queueId = ticket.queueId;
    this._emitQueue(ticket.position);

    while (true) {
      await this._queueSleep(intervalMs);
      if (this._closed) throw _codedError('queue wait aborted', 'aborted');

      let response;
      try {
        const origin = this._sessionUrl.replace(/\/session\/?$/, "");
        const queueUrl = `${origin}/api/queue/${encodeURIComponent(this._queueId)}`;
        response = await fetch(queueUrl, {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        continue;
      }

      if (response.status === 402) {
        const body = await response.json().catch(() => ({}));
        throw _codedError('Daily conversation limit reached', 'limit', { tier: body?.tier });
      }
      if (response.status === 404) {
        throw _codedError('Queue timed out', 'queue-expired');
      }
      if (!response.ok) continue;

      const json = await response.json().catch(() => null);
      if (!json) continue;
      if (json.state === 'queued') {
        this._emitQueue(json.position);
        continue;
      }
      this._queueId = '';
      return this._parseGrant(json);
    }
  }

  _emitQueue(position: number) {
    this.dispatchEvent(
      new CustomEvent('queue', { detail: { position, queueId: this._queueId } }),
    );
  }

  _queueSleep(ms: number) {
    return new Promise<void>((resolve) => {
      this._queueWake = resolve;
      this._queueTimer = setTimeout(() => {
        this._queueWake = null;
        resolve();
      }, ms);
    });
  }

  _parseGrant(json: any): WsSessionInfo {
    return {
      sessionId: json.session_id,
      connectUrl: json.connect_url,
      websocketUrl: json.websocket_url,
      sessionToken: json.session_token,
      pendingTimeoutS: json.pending_timeout_s,
      tier: json.tier,
      limited: json.limited,
      heartbeatSec: json.heartbeatSec,
      remainingSec: json.remainingSec,
    };
  }

  async _setupAudio() {
    const ctx = this.options.audioContext ?? new AudioContext({ latencyHint: 'interactive' });
    this._ctx = ctx;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('[ws] AudioContext resume failed:', err);
      }
    }

    const base = new URL('/worklets/', window.location.origin);
    await ctx.audioWorklet.addModule(new URL('mic-capture.js', base).href);
    await ctx.audioWorklet.addModule(new URL('audio-playback.js', base).href);

    const captureNode = new AudioWorkletNode(ctx, 'mic-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { chunkMs: MIC_CHUNK_MS },
    });
    captureNode.port.onmessage = (e) => {
      const data = e.data;
      if (data instanceof ArrayBuffer) {
        this._onMicChunk(data);
      } else if (data?.kind === 'level') {
        this.dispatchEvent(new CustomEvent('input-level', { detail: { rms: data.rms } }));
      }
    };
    captureNode.port.postMessage({ kind: 'gate', ...this._noiseGate });
    this._captureNode = captureNode;

    if (this.options.micStream) {
      const micSrc = ctx.createMediaStreamSource(this.options.micStream);
      micSrc.connect(captureNode);
      this._micSrc = micSrc;

      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = VIS_FFT_SIZE;
      micAnalyser.smoothingTimeConstant = 0;
      micSrc.connect(micAnalyser);
      this._micAnalyser = micAnalyser;
    }

    const playbackNode = new AudioWorkletNode(ctx, 'audio-playback', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    playbackNode.port.postMessage({ kind: 'config', inputRate: OUTPUT_SAMPLE_RATE });
    playbackNode.port.onmessage = (e) => this._onPlaybackMessage(e.data);

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = VIS_FFT_SIZE;
    outAnalyser.smoothingTimeConstant = 0.3;
    playbackNode.connect(outAnalyser);
    outAnalyser.connect(ctx.destination);
    this._outAnalyser = outAnalyser;
    this._playbackNode = playbackNode;

    if (this._micAnalyser) {
      this._visualiser = new OrbVisualiser(this._micAnalyser, outAnalyser, () => this._aiSpeaking);
      this._visualiser.start();
    }
  }

  _openWebSocket(connectUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(connectUrl);
      ws.binaryType = 'arraybuffer';
      this._ws = ws;

      const onceOpen = () => {
        ws.removeEventListener('open', onceOpen);
        ws.removeEventListener('error', onceErr);
        resolve();
      };
      const onceErr = (e: any) => {
        ws.removeEventListener('open', onceOpen);
        ws.removeEventListener('error', onceErr);
        if (this._closed) {
          reject(_codedError('connect aborted', 'aborted'));
          return;
        }
        reject(new Error(`WebSocket failed to open: ${e?.type ?? 'error'}`));
      };
      ws.addEventListener('open', onceOpen);
      ws.addEventListener('error', onceErr);

      ws.addEventListener('message', (e) => this._onWsMessage(e.data));
      ws.addEventListener('close', (e) => this._onWsClose(e));
      ws.addEventListener('error', (e) => {
        console.error('[ws] socket error', e);
      });
    });
  }

  _onPlaybackMessage(data: any) {
    if (data?.kind === 'underrun') {
      // ignore
    }
  }

  _onMicChunk(pcm16Buffer: ArrayBuffer) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    if (!this._sessionConfigured) return;
    if (this._muted) return;
    const b64 = base64FromArrayBuffer(pcm16Buffer);
    this._send({ type: 'input_audio_buffer.append', audio: b64 });
  }

  async _onWsMessage(raw: any) {
    let text: string;
    if (typeof raw === 'string') {
      text = raw;
    } else if (raw instanceof ArrayBuffer) {
      text = new TextDecoder('utf-8').decode(raw);
    } else if (raw instanceof Blob) {
      text = await raw.text();
    } else {
      return;
    }

    let event: any;
    try {
      event = JSON.parse(text);
    } catch {
      return;
    }

    const type = event?.type;
    if (typeof type !== 'string') return;

    if (this._debug) {
      console.debug(`[ws] ${type}`, event);
    }

    switch (type) {
      case 'session.created':
        this._sendSessionUpdate();
        this._sessionConfigured = true;
        if (this._status === 'connecting') this._setStatus('connected');
        break;

      case 'session.updated':
        break;

      case 'input_audio_buffer.speech_started':
        this._playbackNode?.port.postMessage({ kind: 'clear' });
        this._aiSpeaking = false;
        this._setStatus('user-speaking');
        break;

      case 'input_audio_buffer.speech_stopped':
        if (this._status === 'user-speaking') this._setStatus('processing');
        break;

      case 'response.created':
        this._openResponses++;
        this._createInFlight = false;
        if (this._status === 'connected' || this._status === 'user-speaking') {
          this._setStatus('processing');
        }
        break;

      case 'response.output_item.added':
        if (this._status === 'connected' || this._status === 'user-speaking') {
          this._setStatus('processing');
        }
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta': {
        this._pushAudioDelta(event.delta);
        const rid = event.response_id ?? event.response?.id;
        if (rid) this._audibleResponses.add(rid);
        if (!this._aiSpeaking) {
          this._aiSpeaking = true;
          this._markAudible();
        }
        break;
      }

      case 'response.content_part.added': {
        const part = event.part;
        if (part?.type === 'audio' || part?.type === 'output_audio') {
          this._markAudible();
        }
        break;
      }

      case 'response.done': {
        this._aiSpeaking = false;
        this._openResponses = Math.max(0, this._openResponses - 1);
        if (this._status === 'ai-speaking' || this._status === 'processing') {
          this._setStatus('connected');
        }
        const status = event.response?.status ?? 'completed';
        const responseId = event.response?.id ?? '';
        const audible = responseId ? this._audibleResponses.has(responseId) : false;
        this._audibleResponses.delete(responseId);
        const transcript =
          extractResponseTranscript(event.response) ||
          this._asstDisplay(responseId) ||
          '';
        this._asstTranscriptByResp.delete(responseId);
        this._asstFullByResp.delete(responseId);
        this.dispatchEvent(new CustomEvent('response-finished', {
          detail: { responseId, status, audible, transcript },
        }));
        this._flushQueuedCreate();
        break;
      }

      case 'response.function_call_arguments.done': {
        const name = typeof event.name === 'string' ? event.name : '';
        const args = typeof event.arguments === 'string' ? event.arguments : '{}';
        const callId = typeof event.call_id === 'string' ? event.call_id : '';
        if (name) {
          this.dispatchEvent(new CustomEvent('toolcall', {
            detail: { name, arguments: args, callId },
          }));
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (delta) {
          this.dispatchEvent(
            new CustomEvent('transcript', {
              detail: {
                role: 'user',
                text: delta,
                partial: true,
                itemId: typeof event.item_id === 'string' ? event.item_id : '',
              },
            }),
          );
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = typeof event.transcript === 'string' ? event.transcript : '';
        if (transcript) {
          this.dispatchEvent(
            new CustomEvent('transcript', {
              detail: {
                role: 'user',
                text: transcript,
                partial: false,
                itemId: typeof event.item_id === 'string' ? event.item_id : '',
              },
            }),
          );
        }
        break;
      }

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': {
        this._markAudible();
        const rid = typeof event.response_id === 'string' ? event.response_id : '';
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (delta) {
          this._asstTranscriptByResp.set(rid, (this._asstTranscriptByResp.get(rid) || "") + delta);
          this.dispatchEvent(
            new CustomEvent('transcript', {
              detail: { role: 'assistant', text: this._asstDisplay(rid), partial: true, responseId: rid },
            }),
          );
        }
        break;
      }

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        const rid = typeof event.response_id === 'string' ? event.response_id : '';
        const segment =
          (typeof event.transcript === 'string' && event.transcript) ||
          this._asstTranscriptByResp.get(rid) ||
          '';
        this._asstTranscriptByResp.delete(rid);
        if (segment) {
          const prev = this._asstFullByResp.get(rid) || '';
          this._asstFullByResp.set(rid, prev ? `${prev} ${segment}` : segment);
        }
        const full = this._asstFullByResp.get(rid) || '';
        if (full) {
          this.dispatchEvent(
            new CustomEvent('transcript', {
              detail: { role: 'assistant', text: full, partial: false, responseId: rid },
            }),
          );
        }
        break;
      }

      case 'error': {
        const err = event.error;
        console.error('[ws] server error:', err);
        if (err?.type === 'conversation_already_has_active_response' ||
            err?.code === 'conversation_already_has_active_response') {
          if (this._createInFlight) {
            this._createInFlight = false;
            this._createQueue.push({});
          }
          break;
        }
        this.dispatchEvent(
          new CustomEvent('server-error', { detail: { error: new Error(err?.message ?? 'Server error') } }),
        );
        break;
      }
    }
  }

  _pushAudioDelta(b64: string) {
    if (!this._playbackNode) return;
    if (!b64) return;
    const bytes = base64ToBytes(b64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(bytes.byteLength / 2);
    for (let i = 0; i < samples.length; i++) {
      const s = view.getInt16(i * 2, true);
      samples[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
    }
    this._playbackNode.port.postMessage({ kind: 'audio', samples }, [samples.buffer as any]);
  }

  _onWsClose(ev: CloseEvent) {
    console.log('[ws] socket closed:', ev.code, ev.reason);
    if (this._status === 'closed' || this._status === 'error') return;
    if (ev.code === 1000) {
      this._setStatus('closed');
    } else {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: { error: new Error(`WebSocket closed (${ev.code}) ${ev.reason || ''}`.trim()) },
        }),
      );
      this._setStatus('error');
    }
  }

  _sendSessionUpdate() {
    const session: Record<string, any> = {
      type: 'realtime',
      instructions: this.options.instructions,
      audio: {
        output: { voice: this.options.voice },
      },
    };
    if (this._tools.length) {
      session.tools = this._tools;
      session.tool_choice = 'auto';
    }
    this._send({ type: 'session.update', session });
  }

  updateSession(patch: { voice?: string; instructions?: string }) {
    const session: Record<string, any> = { type: 'realtime' };
    if (patch.instructions) session.instructions = patch.instructions;
    if (patch.voice) session.audio = { output: { voice: patch.voice } };
    if (Object.keys(session).length > 1) {
      this._send({ type: 'session.update', session });
    }
  }

  setTools(tools: ToolDef[]) {
    this._tools = tools;
    this._send({
      type: 'session.update',
      session: { type: 'realtime', tools, tool_choice: tools.length ? 'auto' : 'none' },
    });
  }

  sendToolOutput(callId: string, output: string) {
    if (!callId) return;
    this._send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
  }

  sendUserImage(dataUrl: string) {
    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_image', image_url: dataUrl }],
      },
    });
  }

  requestResponse(opts: { image?: string } = {}) {
    if (this._responseActive()) {
      this._createQueue.push(opts);
      return;
    }
    this._createResponseNow(opts);
  }

  _responseActive() {
    return this._openResponses > 0 || this._createInFlight;
  }

  _createResponseNow(opts: { image?: string } = {}) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    if (opts.image) this.sendUserImage(opts.image);
    this._createInFlight = true;
    this._send({ type: 'response.create' });
  }

  _flushQueuedCreate() {
    if (this._createQueue.length > 0 && !this._responseActive()) {
      const opts = this._createQueue.shift();
      this._createResponseNow(opts);
    }
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    this._playbackNode?.port.postMessage({ kind: 'clear' });
  }

  setNoiseGate(gate: NoiseGate) {
    this._noiseGate = gate;
    this._captureNode?.port.postMessage({ kind: 'gate', ...gate });
  }

  _send(event: Record<string, any>) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify(event));
  }

  async close() {
    this._closed = true;
    if (this._queueWake) {
      clearTimeout(this._queueTimer);
      const wake = this._queueWake;
      this._queueWake = null;
      wake();
    }
    if (this._joinTimer) {
      clearTimeout(this._joinTimer);
      this._joinTimer = 0;
    }
    if (this._joinReject) {
      const reject = this._joinReject;
      this._joinResolve = null;
      this._joinReject = null;
      reject(_codedError('join aborted', 'aborted'));
    }
    this._visualiser?.stop();
    this._visualiser = null;
    try {
      if (this._ws && this._ws.readyState <= WebSocket.OPEN) {
        this._ws.close(1000, 'client closed');
      }
    } catch {
      // ignore
    }
    this._ws = null;

    try {
      this._captureNode?.port.close?.();
    } catch {
      // ignore
    }
    try {
      this._micSrc?.disconnect();
    } catch {
      // ignore
    }
    try {
      this._captureNode?.disconnect();
    } catch {
      // ignore
    }
    try {
      this._micAnalyser?.disconnect();
    } catch {
      // ignore
    }
    try {
      this._outAnalyser?.disconnect();
    } catch {
      // ignore
    }
    try {
      this._playbackNode?.disconnect();
    } catch {
      // ignore
    }
    try {
      await this._ctx?.close();
    } catch {
      // ignore
    }
    this._ctx = null;
    this._captureNode = null;
    this._playbackNode = null;
    this._micSrc = null;
    this._micAnalyser = null;
    this._outAnalyser = null;
    this._setStatus('closed');
  }
}
