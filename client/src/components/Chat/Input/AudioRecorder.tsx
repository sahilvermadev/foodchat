import { memo, useCallback, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { useToastContext, TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize, useSpeechToText } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { globalAudioId } from '~/common';
import { cn } from '~/utils';
import {
  createTranscriptionSession,
  type TranscriptionSession,
} from '~/hooks/Input/transcriptionSession';

export default memo(function AudioRecorder({
  disabled,
  ask,
  methods,
  isSubmitting,
}: {
  disabled: boolean;
  ask: (data: { text: string }) => void;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
}) {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const sessionRef = useRef<TranscriptionSession>(createTranscriptionSession(''));
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isSubmittingRef.current) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      if (text) {
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        const finalText = sessionRef.current.complete(text);
        ask({ text: finalText });
        reset({ text: '' });
        sessionRef.current = createTranscriptionSession('');
      }
    },
    [ask, reset, showToast, localize],
  );

  const handleRecordingStart = useCallback(() => {
    sessionRef.current = createTranscriptionSession(getValues('text') || '');
  }, [getValues]);

  const handleTranscript = useCallback(
    (text: string) => {
      setValue('text', sessionRef.current.display(text), {
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const { isListening, isLoading, startRecording, stopRecording } = useSpeechToText(
    handleRecordingStart,
    handleTranscript,
    onTranscriptionComplete,
  );

  const handleStartRecording = () => {
    startRecording();
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const renderIcon = () => {
    if (isListening === true) {
      return <MicOff className="stroke-[#c1121f]" />;
    }
    if (isLoading === true) {
      return <Spinner className="stroke-text-secondary" />;
    }
    return <ListeningIcon className="stroke-text-secondary" />;
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={isListening === true ? handleStopRecording : handleStartRecording}
          disabled={disabled}
          className={cn(
            'flex size-11 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
            isListening &&
              'bg-[#c1121f]/10 shadow-[0_0_0_6px_rgba(193,18,31,0.08)] hover:bg-[#c1121f]/15',
          )}
          title={localize('com_ui_use_micrphone')}
          aria-pressed={isListening}
        >
          {renderIcon()}
        </button>
      }
    />
  );
});
