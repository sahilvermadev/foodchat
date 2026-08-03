import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PropsWithChildren } from 'react';
import type {
  CookingVoiceConfig,
  CookingVoiceSessionGrant,
  PersistCookingVoiceTurnRequest,
} from 'librechat-data-provider';
import { cookingVoiceConfig, cookingVoiceTurns } from 'librechat-data-provider/mobile';
import type { VoiceStatus } from './client';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { isSilentResponse } from './codec';
import { RecipeVoiceClient } from './client';
import { VoiceClientError } from './errors';

const DEFAULT_INSTRUCTIONS =
  'You are Rekky, a real-time cooking assistant. Help the user with the recipe in front of them. Keep spoken answers short, warm, specific, and direct. Give one useful action at a time unless the user asks for detail. Handle substitutions, technique, timing, food safety, and step-by-step guidance. You are listening in a noisy kitchen. If speech is gibberish, background chatter, or unrelated to food and cooking, respond with exactly <silent/>.';

interface RecipeVoiceSession {
  conversationId?: string;
  id: string;
  recipeMarkdown: string;
  recipeTitle: string;
}

interface RecipeVoiceContextValue {
  activeId?: string;
  start(session: RecipeVoiceSession): void;
  stop(): void;
  stopIfActive(id: string): void;
}

const RecipeVoiceContext = createContext<RecipeVoiceContextValue | null>(null);

const statusKey = (status: VoiceStatus) => {
  if (status === 'listening') return 'voice.listening' as const;
  if (status === 'user-speaking') return 'voice.userSpeaking' as const;
  if (status === 'thinking') return 'voice.thinking' as const;
  if (status === 'speaking') return 'voice.speaking' as const;
  if (status === 'error') return 'voice.error' as const;
  return 'voice.connecting' as const;
};

export function RecipeVoiceProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [session, setSession] = useState<RecipeVoiceSession>();
  const [status, setStatus] = useState<VoiceStatus>('connecting');
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string>();
  const clientRef = useRef<RecipeVoiceClient | undefined>(undefined);
  const lastUserText = useRef('');
  const level = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  const stop = useCallback(() => setSession(undefined), []);
  const start = useCallback((next: RecipeVoiceSession) => setSession(next), []);
  const stopIfActive = useCallback((id: string) => {
    setSession((current) => (current?.id === id ? undefined : current));
  }, []);
  const value = useMemo(
    () => ({ activeId: session?.id, start, stop, stopIfActive }),
    [session?.id, start, stop, stopIfActive],
  );

  useEffect(() => {
    if (!session) return;
    entrance.setValue(0);
    Animated.spring(entrance, {
      damping: 22,
      mass: 0.8,
      stiffness: 220,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const connect = async () => {
      setStatus('connecting');
      setMuted(false);
      setTranscript('');
      setError(undefined);
      lastUserText.current = '';
      try {
        const config = await apiFetch<CookingVoiceConfig>(cookingVoiceConfig());
        if (!active) return;
        if (!config.enabled || !config.sessionUrl) {
          throw new VoiceClientError('unavailable', 'Voice mode is not configured.');
        }
        const sessionUrl = config.sessionUrl;
        const instructions =
          config.shareRecipeContext && session.recipeMarkdown.trim()
            ? `${DEFAULT_INSTRUCTIONS}\n\nThe recipe currently open is:\n${session.recipeMarkdown}`
            : DEFAULT_INSTRUCTIONS;
        const client = new RecipeVoiceClient({
          callbacks: {
            onError: (caught) => {
              if (!active) return;
              let message = t('voice.error');
              if (caught instanceof VoiceClientError && caught.code === 'permission') {
                message = t('voice.permissionError');
              } else if (caught instanceof VoiceClientError && caught.code === 'unavailable') {
                message = t('voice.unavailable');
              }
              setError(message);
              setStatus('error');
            },
            onInputLevel: (next) => {
              Animated.timing(level, {
                duration: 80,
                toValue: next,
                useNativeDriver: true,
              }).start();
            },
            onResponseFinished: (responseId, assistantText) => {
              if (!assistantText || isSilentResponse(assistantText)) return;
              if (!session.conversationId || !lastUserText.current.trim()) return;
              const body: PersistCookingVoiceTurnRequest = {
                assistantText,
                conversationId: session.conversationId,
                turnId: responseId || `voice-${Date.now()}`,
                userText: lastUserText.current,
              };
              void apiFetch(cookingVoiceTurns(), { body, method: 'POST' }).catch(() => undefined);
            },
            onStatus: (next) => {
              if (!active) return;
              setStatus(next);
            },
            onTranscript: (role, text) => {
              if (!active || !text.trim()) return;
              if (role === 'user') lastUserText.current = text;
              if (!isSilentResponse(text)) setTranscript(text);
            },
          },
          createSession: async () => {
            const grant = await apiFetch<CookingVoiceSessionGrant>(sessionUrl, {
              body: {},
              method: 'POST',
            });
            return {
              connectUrl: grant.connect_url,
              token: grant.token,
            };
          },
          instructions,
        });
        clientRef.current = client;
        await client.connect();
      } catch (caught) {
        if (!active) return;
        let message = t('voice.error');
        if (caught instanceof VoiceClientError && caught.code === 'permission') {
          message = t('voice.permissionError');
        }
        if (
          caught instanceof ApiError ||
          (caught instanceof VoiceClientError && caught.code === 'unavailable')
        ) {
          message = t('voice.unavailable');
        }
        setError(message);
        setStatus('error');
      }
    };
    void connect();
    return () => {
      active = false;
      const client = clientRef.current;
      clientRef.current = undefined;
      void client?.close();
    };
  }, [level, session, t]);

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    clientRef.current?.setMuted(next);
    void Haptics.selectionAsync();
  };

  let statusText = t(statusKey(status));
  if (muted) statusText = t('voice.muted');

  return (
    <RecipeVoiceContext.Provider value={value}>
      {children}
      {session ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.dock,
              {
                bottom: insets.bottom + space.lg,
                opacity: entrance,
                transform: [
                  {
                    translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.voiceIndicator,
                {
                  transform: [{ scale: Animated.add(1, Animated.multiply(level, 0.12)) }],
                },
              ]}
            >
              <SymbolView
                name={{ android: muted ? 'mic_off' : 'mic', ios: muted ? 'mic.slash' : 'waveform' }}
                size={21}
                tintColor={colors.white}
              />
            </Animated.View>
            <View style={styles.dockCopy}>
              <Text numberOfLines={1} style={[styles.status, error && styles.statusError]}>
                {error || statusText}
              </Text>
              <Text numberOfLines={1} style={styles.detail}>
                {error ? session.recipeTitle : transcript || session.recipeTitle}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={muted ? t('voice.unmute') : t('voice.mute')}
              accessibilityRole="button"
              onPress={toggleMuted}
              style={[styles.control, muted && styles.controlActive]}
            >
              <SymbolView
                name={{ android: muted ? 'mic_off' : 'mic', ios: muted ? 'mic.slash' : 'mic' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t('voice.close')}
              accessibilityRole="button"
              onPress={stop}
              style={styles.end}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.white}
              />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </RecipeVoiceContext.Provider>
  );
}

export function useRecipeVoice(): RecipeVoiceContextValue {
  const value = useContext(RecipeVoiceContext);
  if (!value) throw new Error('useRecipeVoice must be used inside RecipeVoiceProvider');
  return value;
}

const useStyles = createThemeStyles((palette) => ({
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 100 },
  dock: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    left: space.lg,
    minHeight: 72,
    padding: space.sm,
    position: 'absolute',
    right: space.lg,
    ...shadow,
  },
  voiceIndicator: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  dockCopy: { flex: 1, gap: 2, minWidth: 0 },
  status: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 14 },
  statusError: { color: palette.danger },
  detail: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12 },
  control: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  controlActive: { backgroundColor: palette.softClay },
  end: {
    alignItems: 'center',
    backgroundColor: palette.danger,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
}));
