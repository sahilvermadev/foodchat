import { useEffect, useRef, useCallback } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import { useChatHelpers } from '~/hooks';
import { S2sWsRealtimeClient } from './ws/s2s-ws-client';
import { mainTextareaId } from '~/common';

interface VoiceAssistantWidgetProps {
  conversationId: string;
  recipeMarkdown?: string;
  index?: number;
}

const DEFAULT_LB_SESSION_URL = 'https://kaa1l6rplzb1gg3y.us-east-1.aws.endpoints.huggingface.cloud/session';
const DEFAULT_INSTRUCTIONS = 'You are a real-time cooking assistant. Help the user cook. Keep answers short, conversational, and direct because they are spoken out loud. Follow the recipe context closely. You are listening in a noisy kitchen. If the transcribed user speech is gibberish, incomplete background chatter, or completely unrelated to cooking, recipes, or kitchen tasks, do not respond. Remain silent and output exactly "<silent/>" and absolutely nothing else.';

function isSilentResponse(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;
  return (
    clean === '<silent/>' ||
    clean === '<silent>' ||
    clean === 'silent' ||
    clean.startsWith('<') || // Catch start of `<silent/>` or `<thought>`
    clean.startsWith('thought') || // Catch reasoning prefix
    clean.includes('staying silent as per rules') ||
    clean.includes('remain silent') ||
    clean.includes('not related to the cooking process')
  );
}

export default function VoiceAssistantWidget({
  conversationId,
  recipeMarkdown = '',
  index = 0,
}: VoiceAssistantWidgetProps) {
  const [isActive, setIsActive] = useRecoilState(store.voiceAssistantActive);
  const selectedVoiceName = useRecoilValue(store.voice) || 'Aiden';
  const { getMessages, setMessages } = useChatHelpers(index, conversationId);

  const clientRef = useRef<S2sWsRealtimeClient | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Keep track of active message IDs for user and assistant in this turn
  const lastUserMsgIdRef = useRef<string>('');
  const lastAssistantMsgIdRef = useRef<string>('');

  // Sticky turn buffers to avoid rendering draft bubbles for gibberish/silent turns
  const hasFlushedTurnRef = useRef<boolean>(false);
  const lastUserTextRef = useRef<string>('');

  // Use refs for values that change over time to avoid triggering handleStart recreation
  const recipeMarkdownRef = useRef(recipeMarkdown);
  recipeMarkdownRef.current = recipeMarkdown;

  const selectedVoiceNameRef = useRef(selectedVoiceName);
  selectedVoiceNameRef.current = selectedVoiceName;

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const getMessagesRef = useRef(getMessages);
  getMessagesRef.current = getMessages;

  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => {
      const el = document.querySelector('.scrollbar-gutter-stable');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }, []);

  const cleanSession = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.close();
      } catch (err) {
        console.warn('Error closing voice client:', err);
      }
      clientRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }
    lastUserMsgIdRef.current = '';
    lastAssistantMsgIdRef.current = '';
    hasFlushedTurnRef.current = false;
    lastUserTextRef.current = '';
  }, []);

  const handleStart = useCallback(async () => {
    await cleanSession();

    const MIC_CONSTRAINTS = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    };

    // Prime mic permissions
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      for (const track of tempStream.getTracks()) {
        track.stop();
      }
    } catch (err) {
      console.warn('Microphone permission denied for voice assistant:', err);
      setIsActive(false);
      return;
    }

    const acquireMicStream = async () => {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      micStreamRef.current = stream;
      return stream;
    };

    const instructions = recipeMarkdownRef.current
      ? `${DEFAULT_INSTRUCTIONS}\nHere is the recipe the user is currently cooking:\n${recipeMarkdownRef.current}`
      : DEFAULT_INSTRUCTIONS;

    const SUPPORTED_VOICES = [
      'Aiden',
      'Ryan',
      'Dylan',
      'Eric',
      'Ono_Anna',
      'Serena',
      'Sohee',
      'Uncle_Fu',
      'Vivian',
    ];
    const voiceToUse = SUPPORTED_VOICES.includes(selectedVoiceNameRef.current)
      ? selectedVoiceNameRef.current
      : 'Aiden';

    const client = new S2sWsRealtimeClient({
      sessionUrl: DEFAULT_LB_SESSION_URL,
      voice: voiceToUse,
      instructions: instructions,
      acquireMic: acquireMicStream,
      noiseGate: { enabled: true, thresholdDb: -45 },
    });

    clientRef.current = client;

    // Pipe transcripts to the main chat list in real time
    client.addEventListener('transcript', (e: any) => {
      const { role, text, partial, itemId, responseId } = e.detail;

      if (role === 'user') {
        const id = itemId || 'user-temp';
        if (lastUserMsgIdRef.current !== id) {
          lastUserMsgIdRef.current = id;
          hasFlushedTurnRef.current = false;
          lastUserTextRef.current = '';
        }

        lastUserTextRef.current = text || '';

        // Update the textarea in real time for immediate feedback
        const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.value = partial ? text : '';
          const inputEvent = new Event('input', { bubbles: true });
          textarea.dispatchEvent(inputEvent);
        }
      }

      if (role === 'assistant') {
        const id = responseId || 'assistant-temp';
        lastAssistantMsgIdRef.current = id;

        if (isSilentResponse(text)) {
          return;
        }

        const currentList = getMessagesRef.current() || [];

        if (!hasFlushedTurnRef.current) {
          // Flush both user message and assistant placeholder message to the chat view
          const lastMsg = currentList[currentList.length - 1];
          const parentId = lastMsg?.messageId || '00000000-0000-0000-0000-000000000000';

          const newUserMsg = {
            messageId: lastUserMsgIdRef.current || `user-${Date.now()}`,
            conversationId: conversationIdRef.current,
            parentMessageId: parentId,
            sender: 'User',
            text: lastUserTextRef.current || '...',
            isCreatedByUser: true,
            createdAt: new Date().toISOString(),
          };

          const newAssistantMsg = {
            messageId: id,
            conversationId: conversationIdRef.current,
            parentMessageId: newUserMsg.messageId,
            sender: 'Assistant',
            text,
            isCreatedByUser: false,
            createdAt: new Date().toISOString(),
          };

          setMessagesRef.current([...currentList, newUserMsg, newAssistantMsg]);
          hasFlushedTurnRef.current = true;
        } else {
          // Update assistant text in real time
          const idx = currentList.findIndex((m: any) => m.messageId === id);
          if (idx >= 0) {
            const updated = [...currentList];
            updated[idx] = { ...updated[idx], text };
            setMessagesRef.current(updated);
          }
        }
      }

      scrollChatToBottom();
    });

    client.addEventListener('response-finished', (e: any) => {
      const { responseId, transcript } = e.detail;
      if (responseId) {
        const isSilent = isSilentResponse(transcript || '');

        if (isSilent) {
          // If the turn was already flushed but ends up silent, clean it up
          if (hasFlushedTurnRef.current) {
            const currentList = getMessagesRef.current() || [];
            const assistantIdx = currentList.findIndex((m: any) => m.messageId === responseId);
            if (assistantIdx >= 0) {
              const updated = [...currentList];
              updated.splice(assistantIdx, 1);
              if (assistantIdx > 0 && updated[assistantIdx - 1]?.sender === 'User') {
                updated.splice(assistantIdx - 1, 1);
              }
              setMessagesRef.current(updated);
            }
          }
          hasFlushedTurnRef.current = false;
        } else {
          const currentList = getMessagesRef.current() || [];
          if (!hasFlushedTurnRef.current) {
            // Flush turn now if it was missed during streaming
            const lastMsg = currentList[currentList.length - 1];
            const parentId = lastMsg?.messageId || '00000000-0000-0000-0000-000000000000';

            const newUserMsg = {
              messageId: lastUserMsgIdRef.current || `user-${Date.now()}`,
              conversationId: conversationIdRef.current,
              parentMessageId: parentId,
              sender: 'User',
              text: lastUserTextRef.current || '...',
              isCreatedByUser: true,
              createdAt: new Date().toISOString(),
            };

            const newAssistantMsg = {
              messageId: responseId,
              conversationId: conversationIdRef.current,
              parentMessageId: newUserMsg.messageId,
              sender: 'Assistant',
              text: transcript || '',
              isCreatedByUser: false,
              createdAt: new Date().toISOString(),
            };

            setMessagesRef.current([...currentList, newUserMsg, newAssistantMsg]);
            hasFlushedTurnRef.current = true;
          } else {
            const idx = currentList.findIndex((m: any) => m.messageId === responseId);
            if (idx >= 0) {
              const updated = [...currentList];
              updated[idx] = {
                ...updated[idx],
                text: transcript || updated[idx].text,
              };
              setMessagesRef.current(updated);
            }
          }
        }
      }
      scrollChatToBottom();
    });

    client.addEventListener('error', (e: any) => {
      console.error('Voice assistant client error:', e.detail.error);
    });

    try {
      await client.connect();
    } catch (err) {
      if (err instanceof Error && err.message.includes('aborted')) {
        // Ignored aborted connect attempts
        return;
      }
      console.error('Failed to establish voice session:', err);
      setIsActive(false);
    }
  }, [cleanSession, setIsActive]);

  useEffect(() => {
    if (isActive) {
      handleStart();
    } else {
      cleanSession();
    }
    return () => {
      cleanSession();
    };
  }, [isActive, handleStart, cleanSession]);

  return null;
}
