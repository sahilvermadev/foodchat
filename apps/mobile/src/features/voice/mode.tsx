import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';

import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { useRecipeVoice } from './provider';

export function RecipeVoiceMode({
  conversationId,
  recipeMarkdown,
  recipeTitle,
  tone = 'default',
  voiceId,
}: {
  conversationId?: string;
  recipeMarkdown: string;
  recipeTitle: string;
  tone?: 'compact' | 'default' | 'overlay';
  voiceId: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const { activeId, start, stop, stopIfActive } = useRecipeVoice();
  const active = activeId === voiceId;

  useEffect(
    () => () => {
      stopIfActive(voiceId);
    },
    [stopIfActive, voiceId],
  );

  const activate = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (active) {
      stop();
      return;
    }
    start({ conversationId, id: voiceId, recipeMarkdown, recipeTitle });
  };

  return (
    <Pressable
      accessibilityLabel={active ? t('voice.close') : t('voice.open')}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={activate}
      style={({ pressed }) => [
        styles.launcher,
        tone === 'overlay' && styles.launcherOverlay,
        active && styles.launcherActive,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={{ android: active ? 'stop' : 'mic', ios: active ? 'stop.fill' : 'waveform' }}
        size={18}
        tintColor={active || tone === 'overlay' ? colors.white : colors.ember}
      />
      {tone === 'default' ? (
        <Text style={[styles.launcherText, active && styles.launcherTextActive]}>
          {active ? t('voice.end') : t('voice.open')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const useStyles = createThemeStyles((palette) => ({
  launcher: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 42,
    paddingHorizontal: space.md,
  },
  launcherOverlay: {
    backgroundColor: 'rgba(18,14,16,0.76)',
    borderColor: 'rgba(255,255,255,0.14)',
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 0,
    width: 42,
  },
  launcherActive: { backgroundColor: palette.ember, borderColor: palette.ember },
  launcherText: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 12 },
  launcherTextActive: { color: palette.white },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
}));
