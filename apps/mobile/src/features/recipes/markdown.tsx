import { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';
import type { MarkedStyles } from 'react-native-marked';

import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';

export function RecipeMarkdown({ value }: { value: string }) {
  const { colors, mode } = useTheme();
  const markdownStyles = useMemo<MarkedStyles>(
    () => ({
      text: { color: colors.ink, fontFamily: fonts.recipeBody, fontSize: 16, lineHeight: 27 },
      paragraph: { marginBottom: space.md },
      strong: { fontFamily: fonts.recipeBodyBold },
      h1: { display: 'none' },
      h2: {
        color: colors.ink,
        fontFamily: fonts.recipeHeading,
        fontSize: 24,
        marginBottom: space.md,
        marginTop: space.xl,
      },
      h3: {
        color: colors.ink,
        fontFamily: fonts.recipeHeading,
        fontSize: 19,
        marginBottom: space.sm,
        marginTop: space.lg,
      },
      li: { color: colors.ink, fontFamily: fonts.recipeBody, fontSize: 16, lineHeight: 27 },
      link: { color: colors.emberDark, textDecorationLine: 'underline' },
      code: { backgroundColor: colors.canvas, borderRadius: radius.md, padding: space.md },
      codespan: { backgroundColor: colors.canvas, color: colors.ink, fontFamily: fonts.mono },
      table: { borderColor: colors.line, marginBottom: space.lg },
      tableCell: { padding: space.sm },
    }),
    [colors],
  );
  const elements = useMarkdown(value.replace(/^#\s+.*$/m, '').trim(), {
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
        <Fragment key={index}>{element}</Fragment>
      ))}
    </View>
  );
}
