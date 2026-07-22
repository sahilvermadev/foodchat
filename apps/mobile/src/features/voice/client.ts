import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  decodePCMInBase64,
} from 'react-native-audio-api';

import type { AudioBufferQueueSourceNode } from 'react-native-audio-api';
import type { RealtimeResponse } from './codec';

import { audioLevel, extractResponseTranscript, float32ToPcm16Base64 } from './codec';

const SAMPLE_RATE = 16000;
const CHUNK_FRAMES = 640;

export type VoiceStatus =
  | 'connecting'
  | 'queued'
  | 'listening'
  | 'user-speaking'
  | 'thinking'
  | 'speaking'
  | 'error';

interface SessionGrant {
  connectUrl: string;
}

interface SessionResponse {
  connect_url?: string;
  poll_interval_s?: number;
  position?: number;
  queue_id?: string;
  state?: 'queued';
}

interface RealtimeEvent {
  delta?: string;
  error?: { message?: string };
  item_id?: string;
  response?: RealtimeResponse;
  response_id?: string;
  transcript?: string;
  type?: string;
}

export interface VoiceClientCallbacks {
  onError(error: Error): void;
  onInputLevel(level: number): void;
  onResponseFinished(responseId: string, transcript: string): void;
  onStatus(status: VoiceStatus, queuePosition?: number): void;
  onTranscript(role: 'user' | 'assistant', text: string): void;
}

interface VoiceClientOptions {
  callbacks: VoiceClientCallbacks;
  instructions: string;
  sessionUrl: string;
  voice?: string;
}

const codedError = (message: string) => new Error(message);

export class RecipeVoiceClient {
  private readonly callbacks: VoiceClientCallbacks;
  private readonly instructions: string;
  private readonly sessionUrl: string;
  private readonly voice: string;
  private audioContext?: AudioContext;
  private playback?: AudioBufferQueueSourceNode;
  private recorder?: AudioRecorder;
  private socket?: WebSocket;
  private closed = false;
  private configured = false;
  private muted = false;
  private playbackGeneration = 0;
  private playbackChain: Promise<void> = Promise.resolve();
  private assistantText = new Map<string, string>();

  constructor({ callbacks, instructions, sessionUrl, voice = 'Aiden' }: VoiceClientOptions) {
    this.callbacks = callbacks;
    this.instructions = instructions;
    this.sessionUrl = sessionUrl;
    this.voice = voice;
  }

  async connect(): Promise<void> {
    this.callbacks.onStatus('connecting');
    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== 'Granted')
      throw codedError('Microphone permission is required for voice mode.');

    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['allowBluetoothHFP', 'defaultToSpeaker'],
    });
    await AudioManager.setAudioSessionActivity(true);

    const grant = await this.obtainSession();
    if (this.closed) return;
    await this.setupAudio();
    await this.openSocket(grant.connectUrl);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.playbackGeneration += 1;
      this.playback?.clearBuffers();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.configured = false;
    try {
      await this.recorder?.stop();
    } catch {
      // The recorder may still be initializing when the sheet is closed.
    }
    this.recorder?.clearOnAudioReady();
    this.playback?.clearBuffers();
    this.playbackGeneration += 1;
    try {
      this.playback?.stop();
    } catch {
      // A queue that never started cannot be stopped.
    }
    this.socket?.close(1000, 'voice mode closed');
    await this.audioContext?.close().catch(() => undefined);
    await AudioManager.setAudioSessionActivity(false).catch(() => undefined);
    this.socket = undefined;
    this.recorder = undefined;
    this.playback = undefined;
    this.audioContext = undefined;
  }

  private async obtainSession(): Promise<SessionGrant> {
    const response = await fetch(this.sessionUrl, {
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw codedError('Rekky voice is busy. Please try again shortly.');
    const session = (await response.json()) as SessionResponse;
    if (session.state !== 'queued' && session.connect_url)
      return { connectUrl: session.connect_url };
    if (!session.queue_id) throw codedError('Rekky could not open a voice session.');

    const origin = this.sessionUrl.replace(/\/session\/?$/, '');
    const delay = Math.max(1, session.poll_interval_s ?? 2) * 1000;
    let position = session.position;
    while (!this.closed) {
      this.callbacks.onStatus('queued', position);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      const queued = await fetch(`${origin}/api/queue/${encodeURIComponent(session.queue_id)}`);
      if (queued.status === 404) throw codedError('Your voice session expired. Please try again.');
      if (!queued.ok) continue;
      const result = (await queued.json()) as SessionResponse;
      if (result.state === 'queued') {
        position = result.position;
        continue;
      }
      if (result.connect_url) return { connectUrl: result.connect_url };
    }
    throw codedError('Voice mode was closed.');
  }

  private async setupAudio(): Promise<void> {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const playback = context.createBufferQueueSource();
    playback.connect(context.destination);
    playback.start();
    await context.resume();

    const recorder = new AudioRecorder();
    recorder.onAudioReady(
      { bufferLength: CHUNK_FRAMES, channelCount: 1, sampleRate: SAMPLE_RATE },
      ({ buffer }) => {
        const samples = buffer.getChannelData(0);
        this.callbacks.onInputLevel(audioLevel(samples));
        if (this.closed || this.muted || !this.configured) return;
        this.send({ type: 'input_audio_buffer.append', audio: float32ToPcm16Base64(samples) });
      },
    );
    recorder.onError((event) => this.fail(new Error(event.message)));
    await recorder.start();
    this.audioContext = context;
    this.playback = playback;
    this.recorder = recorder;
  }

  private openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => {
        const error = codedError('The live voice connection was interrupted.');
        if (!this.configured) reject(error);
        else this.fail(error);
      };
      socket.onmessage = (event) => this.handleMessage(String(event.data));
      socket.onclose = (event) => {
        if (!this.closed && event.code !== 1000) this.fail(codedError('Voice mode disconnected.'));
      };
    });
  }

  private handleMessage(raw: string): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }

    if (event.type === 'session.created') {
      this.send({
        type: 'session.update',
        session: {
          audio: { output: { voice: this.voice } },
          instructions: this.instructions,
          type: 'realtime',
        },
      });
      this.configured = true;
      this.callbacks.onStatus('listening');
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      this.playbackGeneration += 1;
      this.playback?.clearBuffers();
      this.callbacks.onStatus('user-speaking');
      return;
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.callbacks.onStatus('thinking');
      return;
    }
    if (event.type === 'response.audio.delta' || event.type === 'response.output_audio.delta') {
      if (event.delta) this.enqueueAudio(event.delta);
      this.callbacks.onStatus('speaking');
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.transcript) this.callbacks.onTranscript('user', event.transcript);
      return;
    }
    if (
      event.type === 'response.audio_transcript.delta' ||
      event.type === 'response.output_audio_transcript.delta'
    ) {
      const responseId = event.response_id ?? '';
      const text = `${this.assistantText.get(responseId) ?? ''}${event.delta ?? ''}`;
      this.assistantText.set(responseId, text);
      this.callbacks.onTranscript('assistant', text);
      return;
    }
    if (event.type === 'response.done') {
      const responseId = event.response?.id ?? event.response_id ?? '';
      const transcript =
        extractResponseTranscript(event.response) || this.assistantText.get(responseId) || '';
      this.assistantText.delete(responseId);
      this.callbacks.onResponseFinished(responseId, transcript.trim());
      this.callbacks.onStatus('listening');
      return;
    }
    if (event.type === 'error') this.fail(codedError(event.error?.message ?? 'Voice mode failed.'));
  }

  private enqueueAudio(base64: string): void {
    const generation = this.playbackGeneration;
    this.playbackChain = this.playbackChain
      .then(async () => {
        if (this.closed || !this.playback) return;
        const buffer = await decodePCMInBase64(base64, SAMPLE_RATE, 1, true);
        if (!this.closed && generation === this.playbackGeneration) {
          this.playback?.enqueueBuffer(buffer);
        }
      })
      .catch((error: Error) => this.fail(error));
  }

  private send(event: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.callbacks.onStatus('error');
    this.callbacks.onError(error);
  }
}
