import { useEffect, useRef, useCallback } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import { useChatHelpers, useLocalize } from '~/hooks';
import { mainTextareaId } from '~/common';

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
  const selectedVoiceName = useRecoilValue(store.voice);
  const playbackRate = useRecoilValue(store.playbackRate);

  const recognitionRef = useRef<any>(null);
  const speechUttRef = useRef<SpeechSynthesisUtterance | null>(null);
  const prevIsSubmittingRef = useRef<boolean>(false);
  const activeSessionRef = useRef<boolean>(false);
  const isSpeakingOrThinkingRef = useRef<boolean>(false);

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
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      // Audio session successfully active
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentSpeech = finalTranscript + interimTranscript;

      // Update the textarea in real time
      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.value = currentSpeech;
        // Dispatch 'input' event so that react-hook-form captures the change
        const inputEvent = new Event('input', { bubbles: true });
        textarea.dispatchEvent(inputEvent);
      }

      // Check if we have a final result from the recognition engine
      const isFinal = event.results[event.results.length - 1]?.isFinal;
      if (finalTranscript.trim() && isFinal) {
        recognition.stop();
        ask({ text: finalTranscript.trim() });
        // Clear the textarea after submission
        if (textarea) {
          textarea.value = '';
          const inputEvent = new Event('input', { bubbles: true });
          textarea.dispatchEvent(inputEvent);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setIsActive(false);
      } else if (event.error === 'no-speech') {
        setTimeout(() => {
          if (activeSessionRef.current && !isSpeakingOrThinkingRef.current) {
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
        if (activeSessionRef.current && !isSpeakingOrThinkingRef.current) {
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
    isSpeakingOrThinkingRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    
    let voiceToUse = null;
    if (selectedVoiceName) {
      voiceToUse = voices.find((v) => v.name === selectedVoiceName);
    }
    
    if (!voiceToUse) {
      voiceToUse = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural')),
      );
    }
    
    if (voiceToUse) {
      utterance.voice = voiceToUse;
    }

    if (playbackRate && typeof playbackRate === 'number') {
      utterance.rate = playbackRate;
    }

    utterance.onend = () => {
      isSpeakingOrThinkingRef.current = false;
      if (activeSessionRef.current) {
        try {
          recognitionRef.current?.start();
        } catch {
          // ignore
        }
      }
    };

    utterance.onerror = () => {
      isSpeakingOrThinkingRef.current = false;
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
  }, [selectedVoiceName, playbackRate]);

  // Monitor Assistant thinking completion to trigger Speech response
  useEffect(() => {
    if (isSubmitting) {
      isSpeakingOrThinkingRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    } else if (prevIsSubmittingRef.current && !isSubmitting && activeSessionRef.current) {
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
        } else {
          isSpeakingOrThinkingRef.current = false;
          if (activeSessionRef.current) {
            try {
              recognitionRef.current?.start();
            } catch {
              // ignore
            }
          }
        }
      } else {
        isSpeakingOrThinkingRef.current = false;
        if (activeSessionRef.current) {
          try {
            recognitionRef.current?.start();
          } catch {
            // ignore
          }
        }
      }
    }
    prevIsSubmittingRef.current = isSubmitting;
  }, [isSubmitting, getMessages, speakText]);

  // Start Assistant Session
  const startSession = useCallback(() => {
    activeSessionRef.current = true;
    isSpeakingOrThinkingRef.current = false;

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
    isSpeakingOrThinkingRef.current = false;
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
