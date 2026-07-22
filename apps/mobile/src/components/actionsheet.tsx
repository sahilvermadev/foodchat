import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import type { ThemePalette } from '@/constants/theme';

import { fonts, radius, shadow, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';

export type ActionSheetAction = {
  description?: string;
  icon: { android: AndroidSymbol; ios: SFSymbol };
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'danger' | 'neutral';
};

const actionColor = (tone: ActionSheetAction['tone'], colors: ThemePalette) => {
  if (tone === 'danger') return colors.danger;
  if (tone === 'accent') return colors.ember;
  return colors.ink;
};

export function ActionSheet({
  actions,
  closeLabel,
  description,
  onClose,
  title,
  visible,
}: {
  actions: ActionSheetAction[];
  closeLabel: string;
  description?: string;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView
          edges={[]}
          style={[
            styles.sheet,
            {
              maxHeight: height - insets.top - space.xl,
              paddingBottom: insets.bottom + space.md,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            <Pressable
              accessibilityLabel={closeLabel}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
          </View>
          <View style={styles.actions}>
            {actions.map((action) => {
              const tone = action.tone ?? 'neutral';
              const iconColor = actionColor(tone, colors);
              return (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    action.onPress();
                  }}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      tone === 'accent' && styles.actionIconAccent,
                      tone === 'danger' && styles.actionIconDanger,
                    ]}
                  >
                    <SymbolView name={action.icon} size={20} tintColor={iconColor} />
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={[styles.actionLabel, tone === 'danger' && styles.actionDanger]}>
                      {action.label}
                    </Text>
                    {action.description ? (
                      <Text style={styles.actionDescription}>{action.description}</Text>
                    ) : null}
                  </View>
                  <SymbolView
                    name={{ android: 'chevron_right', ios: 'chevron.right' }}
                    size={17}
                    tintColor={colors.inkMuted}
                  />
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const useStyles = createThemeStyles((palette) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    backgroundColor: 'rgba(8, 6, 7, 0.72)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: space.xl,
    ...shadow,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    position: 'absolute',
    top: 9,
    width: 38,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.lg,
    paddingBottom: space.lg,
    paddingHorizontal: space.xl,
  },
  copy: { flex: 1, gap: space.sm },
  title: {
    color: palette.ink,
    fontFamily: fonts.recipeHeading,
    fontSize: 25,
    lineHeight: 31,
  },
  description: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  close: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actions: { gap: space.sm, paddingBottom: space.lg, paddingHorizontal: space.lg },
  action: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 72,
    paddingHorizontal: space.md,
    paddingVertical: 11,
  },
  actionPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  actionIconAccent: { backgroundColor: palette.softClay },
  actionIconDanger: { backgroundColor: palette.dangerSoft },
  actionCopy: { flex: 1, gap: 3 },
  actionLabel: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 15 },
  actionDanger: { color: palette.danger },
  actionDescription: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: { opacity: 0.7 },
}));
