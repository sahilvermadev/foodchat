import {
  AudioContext,
  AudioManager,
  AudioRecorder,
  decodePCMInBase64,
} from 'react-native-audio-api';

import type { AudioBufferQueueSourceNode } from 'react-native-audio-api';
import type { RealtimeResponse } from './codec';
import type { VoiceClientError } from './errors';

import { audioLevel, extractResponseTranscript, float32ToPcm16Base64 } from './codec';
import { socketCloseError, voiceError } from './errors';

// The AWS realtime service emits PCM16 at its 16 kHz pipeline rate when no
// explicit OpenAI audio format is negotiated.
const SAMPLE_RATE = 16000;
const CHUNK_FRAMES = 640;
const CONNECTION_TIMEOUT_MS = 120_000;
const PLAYBACK_ECHO_TAIL_MS = 300;

export type VoiceStatus =
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'thinking'
  | 'speaking'
  | 'error';

interface SessionGrant {
  connectUrl: string;
  token: string;
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
  onStatus(status: VoiceStatus): void;
  onTranscript(role: 'user' | 'assistant', text: string): void;
}

interface VoiceClientOptions {
  callbacks: VoiceClientCallbacks;
  createSession(): Promise<SessionGrant>;
  instructions: string;
  voice?: string;
}

export class RecipeVoiceClient {
  private readonly callbacks: VoiceClientCallbacks;
  private readonly instructions: string;
  private readonly createSession: () => Promise<SessionGrant>;
  private readonly voice: string;
  private audioContext?: AudioContext;
  private playback?: AudioBufferQueueSourceNode;
  private recorder?: AudioRecorder;
  private socket?: WebSocket;
  private closed = false;
  private configured = false;
  private muted = false;
  private outputAudioDone = false;
  private pendingAudioDecodes = 0;
  private playbackActive = false;
  private responseActive = false;
  private activeResponseId = '';
  private cancelledResponseIds = new Set<string>();
  private playbackBufferIds = new Set<string>();
  private playbackGeneration = 0;
  private playbackChain: Promise<void> = Promise.resolve();
  private playbackTailTimer?: ReturnType<typeof setTimeout>;
  private readonly logId = Date.now().toString(36).slice(-6);
  private assistantText = new Map<string, string>();

  constructor({ callbacks, createSession, instructions, voice = 'Aiden' }: VoiceClientOptions) {
    this.callbacks = callbacks;
    this.createSession = createSession;
    this.instructions = instructions;
    this.voice = voice;
  }

  async connect(): Promise<void> {
    this.log('connect_start');
    this.callbacks.onStatus('connecting');
    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== 'Granted')
      throw voiceError('permission', 'Microphone permission is required for voice mode.');

    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'voiceChat',
      iosOptions: ['allowBluetoothHFP', 'defaultToSpeaker'],
    });
    await AudioManager.setAudioSessionActivity(true);

    const grant = await this.createSession();
    if (this.closed) return;
    this.log('session_grant_received');
    await this.setupAudio();
    await this.openSocket(grant.connectUrl, grant.token);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.cancelPlayback('muted');
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.configured = false;
    if (this.playbackTailTimer) clearTimeout(this.playbackTailTimer);
    this.log('close');
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

  private async setupAudio(): Promise<void> {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const playback = context.createBufferQueueSource();
    playback.onBufferEnded = (event) => {
      this.playbackBufferIds.delete(event.bufferId);
      this.log('playback_buffer_ended', {
        isLastBufferInQueue: event.isLastBufferInQueue,
        queuedBuffers: this.playbackBufferIds.size,
      });
      this.finishPlaybackAfterEchoTail();
    };
    playback.connect(context.destination);
    playback.start(0, 0);
    await context.resume();

    const recorder = new AudioRecorder();
    recorder.onAudioReady(
      { bufferLength: CHUNK_FRAMES, channelCount: 1, sampleRate: SAMPLE_RATE },
      ({ buffer }) => {
        const samples = buffer.getChannelData(0);
        if (this.closed || this.muted || !this.configured) return;
        // Keep sending microphone audio during playback. The native voice-chat
        // audio session handles echo cancellation, while server VAD needs these
        // frames to detect barge-in and cancel the active response.
        this.callbacks.onInputLevel(audioLevel(samples));
        this.send({ type: 'input_audio_buffer.append', audio: float32ToPcm16Base64(samples) });
      },
    );
    recorder.onError((event) => {
      this.log('recorder_error', { message: event.message });
      this.fail(new Error(event.message));
    });
    await recorder.start();
    this.audioContext = context;
    this.playback = playback;
    this.recorder = recorder;
  }

  private openSocket(url: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      let ready = false;
      let settled = false;
      const settle = (error?: VoiceClientError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        this.log('connection_timeout', { timeoutMs: CONNECTION_TIMEOUT_MS });
        socket.close(4008, 'Voice service startup timed out');
        settle(voiceError('unavailable', 'Voice service startup timed out.'));
      }, CONNECTION_TIMEOUT_MS);
      this.socket = socket;
      socket.onopen = () => {
        this.log('socket_open');
        socket.send(JSON.stringify({ token, type: 'rekky.authenticate' }));
      };
      socket.onerror = () => {
        this.log('socket_error', { configured: this.configured, ready });
      };
      socket.onmessage = (message) => {
        const event = this.parseMessage(String(message.data));
        if (!event) return;
        if (!ready && event.type === 'error') {
          settle(voiceError('unavailable', event.error?.message ?? 'Voice service unavailable.'));
          return;
        }
        this.handleEvent(event);
        if (event.type !== 'session.updated') return;
        ready = true;
        settle();
      };
      socket.onclose = (event) => {
        this.log('socket_close', { code: event.code, reason: event.reason });
        if (this.closed || event.code === 1000) {
          if (!ready) settle(voiceError('interrupted', 'Voice mode closed.'));
          return;
        }
        const error = socketCloseError(event.code, event.reason);
        if (!ready) settle(error);
        else this.fail(error);
      };
    });
  }

  private parseMessage(raw: string): RealtimeEvent | undefined {
    try {
      return JSON.parse(raw) as RealtimeEvent;
    } catch {
      return undefined;
    }
  }

  private handleEvent(event: RealtimeEvent): void {
    if (event.type === 'session.created') {
      this.log('session_created');
      this.send({
        type: 'session.update',
        session: {
          audio: {
            input: {
              turn_detection: { interrupt_response: true, type: 'server_vad' },
            },
            output: { voice: this.voice },
          },
          instructions: this.instructions,
          type: 'realtime',
        },
      });
      return;
    }
    if (event.type === 'session.updated') {
      this.log('session_updated');
      this.configured = true;
      this.callbacks.onStatus('listening');
      return;
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      this.log('speech_started', { playbackActive: this.playbackActive });
      this.cancelPlayback('speech_started');
      if (this.responseActive) {
        if (this.activeResponseId) this.cancelledResponseIds.add(this.activeResponseId);
        this.send({ type: 'response.cancel' });
      }
      this.callbacks.onStatus('user-speaking');
      return;
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.log('speech_stopped');
      this.callbacks.onStatus('thinking');
      return;
    }
    if (event.type === 'response.created') {
      this.responseActive = true;
      this.activeResponseId = event.response?.id ?? event.response_id ?? '';
      return;
    }
    if (event.type === 'response.audio.delta' || event.type === 'response.output_audio.delta') {
      const responseId = event.response_id ?? event.response?.id ?? '';
      if (responseId && this.cancelledResponseIds.has(responseId)) return;
      if (event.delta) {
        if (!this.playbackActive) {
          this.playbackActive = true;
          this.outputAudioDone = false;
          this.log('playback_started');
        }
        this.enqueueAudio(event.delta);
      }
      this.callbacks.onStatus('speaking');
      return;
    }
    if (event.type === 'response.audio.done' || event.type === 'response.output_audio.done') {
      this.outputAudioDone = true;
      this.log('output_audio_done', {
        pendingAudioDecodes: this.pendingAudioDecodes,
        queuedBuffers: this.playbackBufferIds.size,
      });
      this.finishPlaybackAfterEchoTail();
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
      if (responseId && this.cancelledResponseIds.has(responseId)) return;
      const text = `${this.assistantText.get(responseId) ?? ''}${event.delta ?? ''}`;
      this.assistantText.set(responseId, text);
      this.callbacks.onTranscript('assistant', text);
      return;
    }
    if (event.type === 'response.done') {
      this.responseActive = false;
      const responseId = event.response?.id ?? event.response_id ?? '';
      const cancelled =
        event.response?.status === 'cancelled' || this.cancelledResponseIds.has(responseId);
      const transcript =
        extractResponseTranscript(event.response) || this.assistantText.get(responseId) || '';
      this.assistantText.delete(responseId);
      this.cancelledResponseIds.delete(responseId);
      this.activeResponseId = '';
      this.log('response_done', {
        playbackActive: this.playbackActive,
        status: event.response?.status,
        transcriptChars: transcript.length,
      });
      if (cancelled) this.cancelPlayback('response_cancelled');
      if (!cancelled) this.callbacks.onResponseFinished(responseId, transcript.trim());
      if (!this.playbackActive) this.callbacks.onStatus('listening');
      return;
    }
    if (event.type === 'error') {
      this.log('server_error', { message: event.error?.message });
      this.fail(voiceError('interrupted', event.error?.message ?? 'Voice mode failed.'));
    }
  }

  private enqueueAudio(base64: string): void {
    const generation = this.playbackGeneration;
    this.pendingAudioDecodes += 1;
    this.playbackChain = this.playbackChain
      .then(async () => {
        if (this.closed || !this.playback) return;
        const buffer = await decodePCMInBase64(base64, SAMPLE_RATE, 1, true);
        if (!this.closed && generation === this.playbackGeneration) {
          const bufferId = this.playback.enqueueBuffer(buffer);
          this.playbackBufferIds.add(bufferId);
        }
      })
      .catch((error: Error) => this.fail(error))
      .finally(() => {
        this.pendingAudioDecodes -= 1;
        this.finishPlaybackAfterEchoTail();
      });
  }

  private finishPlaybackAfterEchoTail(): void {
    if (
      !this.playbackActive ||
      !this.outputAudioDone ||
      this.pendingAudioDecodes > 0 ||
      this.playbackBufferIds.size > 0
    ) {
      return;
    }
    if (this.playbackTailTimer) clearTimeout(this.playbackTailTimer);
    const generation = this.playbackGeneration;
    this.playbackTailTimer = setTimeout(() => {
      if (this.closed || generation !== this.playbackGeneration) return;
      this.playbackActive = false;
      this.log('playback_finished', { echoTailMs: PLAYBACK_ECHO_TAIL_MS });
      this.callbacks.onStatus('listening');
    }, PLAYBACK_ECHO_TAIL_MS);
  }

  private cancelPlayback(reason: string): void {
    if (this.playbackTailTimer) clearTimeout(this.playbackTailTimer);
    this.playbackGeneration += 1;
    this.playback?.clearBuffers();
    this.playbackBufferIds.clear();
    this.outputAudioDone = false;
    this.playbackActive = false;
    this.log('playback_cancelled', { reason });
  }

  private send(event: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.log('client_error', { message: error.message });
    this.callbacks.onStatus('error');
    this.callbacks.onError(error);
  }

  private log(event: string, details: Record<string, unknown> = {}): void {
    console.info(`[Voice:${this.logId}] ${event}`, details);
  }
}
