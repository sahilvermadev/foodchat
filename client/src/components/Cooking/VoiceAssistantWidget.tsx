import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { X, Sparkles, AlertTriangle, MicOff } from 'lucide-react';
import store from '~/store';
import { useChatHelpers, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type VoiceState = 'inactive' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

interface VoiceAssistantWidgetProps {
  conversationId: string;
  index?: number;
}

export default function VoiceAssistantWidget({
  conversationId,
  index = 0,
}: VoiceAssistantWidgetProps) {
  const localize = useLocalize();
  const { ask, isSubmitting, getMessages } = useChatHelpers(index, conversationId);
  const [isActive, setIsActive] = useRecoilState(store.voiceAssistantActive);

  const [voiceState, setVoiceState] = useState<VoiceState>('inactive');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [assistantResponse, setAssistantResponse] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const speechUttRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevIsSubmittingRef = useRef<boolean>(false);
  const activeSessionRef = useRef<boolean>(false);

  // Initialize Speech Recognition
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceState('error');
      setErrorMessage(localize('com_ui_speech_not_supported') || 'Speech not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      if (activeSessionRef.current) {
        setVoiceState('listening');
      }
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const display = finalTranscript || interimTranscript;
      if (display.trim()) {
        setUserTranscript(display);
      }

      if (finalTranscript.trim()) {
        recognition.stop();
        setVoiceState('thinking');
        ask({ text: finalTranscript.trim() });
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceState('error');
        setErrorMessage(localize('com_ui_mic_permission_denied') || 'Mic permission denied');
        setIsActive(false);
      } else if (event.error === 'no-speech') {
        setTimeout(() => {
          if (activeSessionRef.current && voiceState === 'listening') {
            try {
              recognition.start();
            } catch {
              // ignore
            }
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      setTimeout(() => {
        if (activeSessionRef.current && voiceState === 'listening') {
          try {
            recognition.start();
          } catch {
            // ignore
          }
        }
      }, 300);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [ask, voiceState, localize, setIsActive]);

  // Handle TTS Speak
  const speakText = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    setVoiceState('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural')),
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      if (activeSessionRef.current) {
        setVoiceState('listening');
        setUserTranscript('');
        try {
          recognitionRef.current?.start();
        } catch {
          // ignore
        }
      }
    };

    utterance.onerror = () => {
      if (activeSessionRef.current) {
        setVoiceState('listening');
        try {
          recognitionRef.current?.start();
        } catch {
          // ignore
        }
      }
    };

    speechUttRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Monitor Assistant thinking completion to trigger Speech response
  useEffect(() => {
    if (prevIsSubmittingRef.current && !isSubmitting && activeSessionRef.current) {
      const messages = getMessages() ?? [];
      const assistantMessages = messages.filter((m) => !m.isCreatedByUser);
      if (assistantMessages.length > 0) {
        const lastMsg = assistantMessages[assistantMessages.length - 1];
        if (lastMsg?.text) {
          const cleanText = lastMsg.text
            .replace(/[*_#`~[\]]/g, '')
            .replace(/-\s+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          setAssistantResponse(cleanText);
          speakText(cleanText);
        }
      }
    }
    prevIsSubmittingRef.current = isSubmitting;
  }, [isSubmitting, getMessages, speakText]);

  // Start Assistant Session
  const startSession = useCallback(() => {
    activeSessionRef.current = true;
    setUserTranscript('');
    setAssistantResponse('');
    setErrorMessage('');

    const rec = recognitionRef.current || initSpeechRecognition();
    if (rec) {
      setVoiceState('listening');
      try {
        rec.start();
      } catch {
        // ignore
      }
    }
  }, [initSpeechRecognition]);

  // Stop Assistant Session
  const stopSession = useCallback(() => {
    activeSessionRef.current = false;
    window.speechSynthesis.cancel();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setVoiceState('inactive');
    setIsActive(false);
  }, [setIsActive]);

  // Synchronize active session state with Recoil atom
  useEffect(() => {
    if (isActive) {
      startSession();
    } else {
      stopSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Ensure speech synthesis cancels on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Handle incoming voices change (Safari/Chrome delay)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const getStatusTextColorClass = () => {
    switch (voiceState) {
      case 'listening':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'thinking':
        return 'text-amber-500';
      case 'speaking':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-text-secondary';
    }
  };

  const getStatusMessage = () => {
    switch (voiceState) {
      case 'listening':
        return localize('com_cooking_voice_listening') || 'Listening for speech...';
      case 'thinking':
        return localize('com_cooking_voice_thinking') || 'Samwise is thinking...';
      case 'speaking':
        return localize('com_cooking_voice_speaking') || 'Samwise is speaking...';
      case 'error':
        return localize('com_cooking_voice_error') || 'Error';
      default:
        return localize('com_cooking_voice_paused') || 'Paused';
    }
  };

  const renderVisualizer = () => {
    if (voiceState === 'listening' || voiceState === 'speaking') {
      return (
        <div className="mb-3 flex h-12 items-end justify-center gap-1.5">
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'voice-pulse-bar w-1 rounded-full',
                voiceState === 'listening' ? 'bg-emerald-500' : 'bg-blue-500',
              )}
              style={{
                height: '40px',
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
      );
    }
    if (voiceState === 'thinking') {
      return <LoaderCircle className="mb-3 size-10 animate-spin text-amber-500" />;
    }
    if (voiceState === 'error') {
      return <AlertTriangle className="mb-3 size-10 text-red-500" />;
    }
    return <MicOff className="mb-3 size-10 text-text-tertiary" />;
  };

  return (
    <>
      <style>{`
        @keyframes soundwave-pulse {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        .voice-pulse-bar {
          animation: soundwave-pulse 1.2s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      {/* active Assistant panel */}
      {voiceState !== 'inactive' && (
        <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-2xl border border-border-light bg-surface-primary p-5 shadow-2xl transition-all duration-300 dark:border-border-heavy sm:top-24">
          <div className="flex items-center justify-between border-b border-border-light pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-surface-submit" />
              <h3 className="text-sm font-semibold text-text-primary">
                {localize('com_cooking_voice_title') || 'Hands-Free Samwise'}
              </h3>
            </div>
            <button
              onClick={stopSession}
              aria-label="Close Voice Assistant"
              className="rounded-full p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="my-5 flex flex-col items-center justify-center py-2">
            {/* soundwave visualization */}
            {renderVisualizer()}

            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                getStatusTextColorClass(),
              )}
            >
              {getStatusMessage()}
            </p>
          </div>

          {/* dialogue transcripts */}
          <div className="max-h-48 space-y-3.5 overflow-y-auto rounded-lg bg-surface-primary-alt p-3.5 text-xs text-text-primary">
            {userTranscript && (
              <div>
                <p className="font-semibold text-text-secondary">
                  {localize('com_ui_you') || 'You'}:
                </p>
                <p className="mt-0.5 italic text-text-primary">&ldquo;{userTranscript}&rdquo;</p>
              </div>
            )}
            {assistantResponse && (
              <div className="border-t border-border-light pt-2">
                <p className="font-semibold text-surface-submit">
                  {localize('com_ui_assistant') || 'Samwise'}:
                </p>
                <p className="mt-0.5 text-text-primary">{assistantResponse}</p>
              </div>
            )}
            {voiceState === 'error' && (
              <p className="text-center font-medium text-red-500">{errorMessage}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LoaderCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
