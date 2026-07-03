import { useEffect, useRef, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';
import { useChatHelpers, useLocalize } from '~/hooks';

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

  const recognitionRef = useRef<any>(null);
  const speechUttRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevIsSubmittingRef = useRef<boolean>(false);
  const activeSessionRef = useRef<boolean>(false);

  // Initialize Speech Recognition
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn(localize('com_ui_speech_not_supported') || 'Speech not supported');
      setIsActive(false);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      // Audio session successfully active
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        recognition.stop();
        ask({ text: finalTranscript.trim() });
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setIsActive(false);
      } else if (event.error === 'no-speech') {
        setTimeout(() => {
          if (activeSessionRef.current) {
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
        if (activeSessionRef.current) {
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
  }, [ask, setIsActive, localize]);

  // Handle TTS Speak
  const speakText = useCallback((text: string) => {
    window.speechSynthesis.cancel();

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
        try {
          recognitionRef.current?.start();
        } catch {
          // ignore
        }
      }
    };

    utterance.onerror = () => {
      if (activeSessionRef.current) {
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
          speakText(cleanText);
        }
      }
    }
    prevIsSubmittingRef.current = isSubmitting;
  }, [isSubmitting, getMessages, speakText]);

  // Start Assistant Session
  const startSession = useCallback(() => {
    activeSessionRef.current = true;

    const rec = recognitionRef.current || initSpeechRecognition();
    if (rec) {
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
  }, []);

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

  return null;
}
