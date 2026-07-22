import { Fragment, memo, useMemo } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useMarkdown } from 'react-native-marked';

import type { CookingChatMessage, CookingWebSource } from 'librechat-data-provider';
import type { MarkedStyles } from 'react-native-marked';

import { fonts, radius, space } from '@/constants/theme';
import { AuthenticatedImage } from '@/features/recipes/authenticated-image';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

const sourceDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function RichMessage({ text }: { text: string }) {
  const { colors, mode } = useTheme();
  const markdownStyles = useMemo<MarkedStyles>(
    () => ({
      text: { color: colors.ink, fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
      paragraph: { marginBottom: space.sm },
      strong: { fontFamily: fonts.sansBold },
      em: { fontFamily: fonts.sans, fontStyle: 'italic' },
      link: { color: colors.emberDark, textDecorationLine: 'underline' },
      list: { marginBottom: space.sm },
      li: { color: colors.ink, fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
      blockquote: {
        borderLeftColor: colors.ember,
        borderLeftWidth: 3,
        marginVertical: space.sm,
        paddingLeft: space.md,
      },
      codespan: {
        backgroundColor: colors.canvas,
        color: colors.ink,
        fontFamily: fonts.mono,
      },
      code: { backgroundColor: colors.canvas, borderRadius: radius.md, padding: space.md },
    }),
    [colors],
  );
  const elements = useMarkdown(text, {
    colorScheme: mode,
    styles: markdownStyles,
    theme: {
      colors: {
        border: colors.line,
        code: colors.canvas,
        link: colors.emberDark,
        text: colors.ink,
      },
    },
  });

  return (
    <View>
      {elements.map((element, index) => (
        <Fragment key={`${index}-${text.length}`}>{element}</Fragment>
      ))}
    </View>
  );
}

function Sources({ sources }: { sources: CookingWebSource[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  if (!sources.length) return null;

  return (
    <View accessibilityLabel={t('cook.sources')} style={styles.sources}>
      <View style={styles.sourcesHeading}>
        <SymbolView
          name={{ android: 'language', ios: 'globe' }}
          size={15}
          tintColor={colors.inkMuted}
        />
        <Text style={styles.sourcesTitle}>{t('cook.sources')}</Text>
      </View>
      {sources.map((source, index) => (
        <Pressable
          key={`${source.url}-${index}`}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(source.url)}
          style={({ pressed }) => [styles.source, pressed && styles.pressed]}
        >
          <View style={styles.sourceIndex}>
            <Text style={styles.sourceIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.sourceCopy}>
            <Text numberOfLines={1} style={styles.sourceName}>
              {source.title?.trim() || sourceDomain(source.url)}
            </Text>
            <Text numberOfLines={1} style={styles.sourceDomain}>
              {sourceDomain(source.url)}
            </Text>
          </View>
          <SymbolView
            name={{ android: 'open_in_new', ios: 'arrow.up.right' }}
            size={14}
            tintColor={colors.inkMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}

function ConversationMessageView({ message }: { message: CookingChatMessage }) {
  const styles = useStyles();
  const sources = message.metadata?.cookingWebSources ?? [];
  const images = message.files?.filter((file) => file.type.startsWith('image/')) ?? [];
  const attachments = images.length ? (
    <View style={styles.attachments}>
      {images.map((file) => (
        <AuthenticatedImage
          key={file.file_id}
          contentFit="cover"
          path={file.filepath}
          style={styles.attachment}
          transition={180}
        />
      ))}
    </View>
  ) : null;

  if (message.isCreatedByUser) {
    return (
      <View style={styles.userBubble}>
        {attachments}
        <Text style={styles.userText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantMark}>
        <Text style={styles.assistantGlyph}>R</Text>
      </View>
      <View style={styles.assistantContent}>
        {attachments}
        <RichMessage text={message.text} />
        <Sources sources={sources} />
      </View>
    </View>
  );
}

export const ConversationMessage = memo(ConversationMessageView);

const useStyles = createThemeStyles((palette) => ({
  assistantRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
  },
  assistantMark: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  assistantGlyph: { color: palette.white, fontFamily: fonts.sansBold, fontSize: 11 },
  assistantContent: { flex: 1, paddingRight: space.sm },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: palette.herb,
    borderBottomRightRadius: 5,
    borderRadius: radius.lg,
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  userText: { color: palette.white, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  attachments: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  attachment: { backgroundColor: palette.line, borderRadius: radius.md, height: 132, width: 132 },
  sources: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    gap: space.xs,
    marginTop: space.sm,
    paddingTop: space.md,
  },
  sourcesHeading: { alignItems: 'center', flexDirection: 'row', gap: space.xs, marginBottom: 2 },
  sourcesTitle: {
    color: palette.inkMuted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  source: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.sm,
  },
  sourceIndex: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  sourceIndexText: { color: palette.inkMuted, fontFamily: fonts.mono, fontSize: 10 },
  sourceCopy: { flex: 1 },
  sourceName: { color: palette.ink, fontFamily: fonts.sansMedium, fontSize: 13 },
  sourceDomain: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 11 },
  pressed: { opacity: 0.65 },
}));
