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
const DEFAULT_INSTRUCTIONS = 'You are a real-time cooking assistant. Help the user cook. Keep answers short, conversational, and direct because they are spoken out loud. Follow the recipe context closely. You are listening in a noisy kitchen. If the transcribed user speech is gibberish, incomplete background chatter, or completely unrelated to cooking, recipes, or kitchen tasks, do not respond. Remain silent and output nothing.';

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

    const instructions = recipeMarkdown
      ? `${DEFAULT_INSTRUCTIONS}\nHere is the recipe the user is currently cooking:\n${recipeMarkdown}`
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
    const voiceToUse = SUPPORTED_VOICES.includes(selectedVoiceName)
      ? selectedVoiceName
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
        lastUserMsgIdRef.current = id;

        // Update the textarea in real time
        const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.value = partial ? text : '';
          const inputEvent = new Event('input', { bubbles: true });
          textarea.dispatchEvent(inputEvent);
        }

        const currentList = getMessages() || [];
        const idx = currentList.findIndex((m: any) => m.messageId === id);

        if (idx >= 0) {
          const updated = [...currentList];
          // Since the delta contains the full cumulative text so far, overwrite wholesale
          updated[idx] = { ...updated[idx], text };
          setMessages(updated);
        } else {
          // Create user message placeholder
          const lastMsg = currentList[currentList.length - 1];
          const parentId = lastMsg?.messageId || '00000000-0000-0000-0000-000000000000';
          const newUserMsg = {
            messageId: id,
            conversationId,
            parentMessageId: parentId,
            sender: 'User',
            text: text,
            isCreatedByUser: true,
            createdAt: new Date().toISOString(),
          };
          setMessages([...currentList, newUserMsg]);
        }
      }

      if (role === 'assistant') {
        const id = responseId || 'assistant-temp';
        lastAssistantMsgIdRef.current = id;

        const currentList = getMessages() || [];
        const idx = currentList.findIndex((m: any) => m.messageId === id);

        if (idx >= 0) {
          const updated = [...currentList];
          // Assistant text is already full accumulated transcript up to this point
          updated[idx] = { ...updated[idx], text };
          setMessages(updated);
        } else {
          // Create assistant message placeholder
          const parentId = lastUserMsgIdRef.current || '00000000-0000-0000-0000-000000000000';
          const newAssistantMsg = {
            messageId: id,
            conversationId,
            parentMessageId: parentId,
            sender: 'Assistant',
            text,
            isCreatedByUser: false,
            createdAt: new Date().toISOString(),
          };
          setMessages([...currentList, newAssistantMsg]);
        }
      }

      scrollChatToBottom();
    });

    client.addEventListener('response-finished', (e: any) => {
      const { responseId, transcript } = e.detail;
      if (responseId) {
        const currentList = getMessages() || [];
        const idx = currentList.findIndex((m: any) => m.messageId === responseId);
        if (idx >= 0) {
          const updated = [...currentList];
          updated[idx] = {
            ...updated[idx],
            text: transcript || updated[idx].text,
          };
          setMessages(updated);
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
      console.error('Failed to establish voice session:', err);
      setIsActive(false);
    }
  }, [conversationId, recipeMarkdown, selectedVoiceName, cleanSession, getMessages, setMessages, setIsActive]);

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
