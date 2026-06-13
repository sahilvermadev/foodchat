import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import useGetAudioSettings from './useGetAudioSettings';
import { composeBrowserTranscript } from './transcriptionSession';
import { useLocalize } from '~/hooks';
import store from '~/store';

const useSpeechToTextBrowser = (
  onRecordingStart: () => void,
  onTranscript: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const isBrowserSTTEnabled = speechToTextEndpoint === 'browser';
  const { data: speechConfig } = useGetCustomConfigSpeechQuery({ enabled: true });
  const sttExternal = Boolean(speechConfig?.sttExternal);

  const lastTranscript = useRef<string | null>(null);
  const lastDisplayedTranscript = useRef<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>();
  const [autoSendText] = useRecoilState(store.autoSendText);
  const [languageSTT] = useRecoilState<string>(store.languageSTT);

  const {
    listening,
    finalTranscript,
    interimTranscript,
    resetTranscript,
    isMicrophoneAvailable,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const isListening = useMemo(() => listening, [listening]);

  useEffect(() => {
    const displayTranscript = composeBrowserTranscript(finalTranscript, interimTranscript);
    if (!displayTranscript) {
      return;
    }

    if (lastDisplayedTranscript.current === displayTranscript) {
      return;
    }

    onTranscript(displayTranscript);
    lastDisplayedTranscript.current = displayTranscript;
  }, [finalTranscript, interimTranscript, onTranscript]);

  useEffect(() => {
    if (finalTranscript == null || finalTranscript === '') {
      return;
    }

    if (lastTranscript.current === finalTranscript) {
      return;
    }

    lastTranscript.current = finalTranscript;
    if (autoSendText > -1 && finalTranscript.length > 0) {
      timeoutRef.current = setTimeout(() => {
        onTranscriptionComplete(finalTranscript);
        resetTranscript();
        lastDisplayedTranscript.current = null;
        lastTranscript.current = null;
      }, autoSendText * 1000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onTranscriptionComplete, resetTranscript, finalTranscript, autoSendText]);

  const toggleListening = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      showToast({
        message: sttExternal
          ? localize('com_ui_speech_not_supported_use_external')
          : localize('com_ui_speech_not_supported'),
        status: 'error',
      });
      return;
    }

    if (!isMicrophoneAvailable) {
      showToast({
        message: localize('com_ui_microphone_unavailable'),
        status: 'error',
      });
      return;
    }

    if (isListening === true) {
      SpeechRecognition.stopListening();
    } else {
      onRecordingStart();
      resetTranscript();
      lastDisplayedTranscript.current = null;
      lastTranscript.current = null;
      SpeechRecognition.startListening({
        language: languageSTT,
        continuous: true,
      });
    }
  }, [
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    isListening,
    languageSTT,
    localize,
    onRecordingStart,
    resetTranscript,
    showToast,
    sttExternal,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && e.code === 'KeyL' && isBrowserSTTEnabled) {
        toggleListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBrowserSTTEnabled, toggleListening]);

  return {
    isListening,
    isLoading: false,
    startRecording: toggleListening,
    stopRecording: toggleListening,
  };
};

export default useSpeechToTextBrowser;
