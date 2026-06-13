import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';

const mockStartListening = jest.fn();
const mockStopListening = jest.fn();

let mockRecognitionState = {
  listening: true,
  finalTranscript: 'I need dinner today',
  interimTranscript: '',
  resetTranscript: jest.fn(),
  isMicrophoneAvailable: true,
  browserSupportsSpeechRecognition: true,
};

jest.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: (...args: unknown[]) => mockStartListening(...args),
    stopListening: (...args: unknown[]) => mockStopListening(...args),
  },
  useSpeechRecognition: () => mockRecognitionState,
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetCustomConfigSpeechQuery: () => ({ data: { sttExternal: false } }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('./useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: 'browser' }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: {
      autoSendText: atom({ key: 'speech-test-auto-send', default: -1 }),
      languageSTT: atom({ key: 'speech-test-language', default: 'en-US' }),
    },
  };
});

import useSpeechToTextBrowser from './useSpeechToTextBrowser';

describe('useSpeechToTextBrowser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecognitionState = {
      listening: true,
      finalTranscript: 'I need dinner today',
      interimTranscript: '',
      resetTranscript: jest.fn(),
      isMicrophoneAvailable: true,
      browserSupportsSpeechRecognition: true,
    };
  });

  test('keeps finalized text visible while speech resumes after a pause', () => {
    const onTranscript = jest.fn();
    const { rerender } = renderHook(
      () => useSpeechToTextBrowser(jest.fn(), onTranscript, jest.fn()),
      { wrapper: RecoilRoot },
    );

    expect(onTranscript).toHaveBeenLastCalledWith('I need dinner today');

    mockRecognitionState = {
      ...mockRecognitionState,
      interimTranscript: 'with mushrooms',
    };
    rerender();

    expect(onTranscript).toHaveBeenLastCalledWith('I need dinner today with mushrooms');
    expect(onTranscript).not.toHaveBeenCalledWith('with mushrooms');
  });

  test('starts a new session before browser recognition begins', () => {
    const onRecordingStart = jest.fn();
    mockRecognitionState = { ...mockRecognitionState, listening: false };
    const { result } = renderHook(
      () => useSpeechToTextBrowser(onRecordingStart, jest.fn(), jest.fn()),
      { wrapper: RecoilRoot },
    );

    act(() => result.current.startRecording());

    expect(onRecordingStart).toHaveBeenCalledTimes(1);
    expect(mockStartListening).toHaveBeenCalledWith({ language: 'en-US', continuous: true });
  });
});
