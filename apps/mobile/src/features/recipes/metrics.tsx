import { ScrollView, Text, View } from 'react-native';

import type { RecipeMetric } from './content';
import { fonts, space } from '@/constants/theme';
import { createThemeStyles } from '@/features/theme/styles';
import { visibleRecipeMetrics } from './metric';

export function RecipeMetrics({ metrics }: { metrics: RecipeMetric[] }) {
  const styles = useStyles();
  const visibleMetrics = visibleRecipeMetrics(metrics);
  if (!visibleMetrics.length) return null;
  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.section}
    >
      {visibleMetrics.map((metric, index) => (
        <View
          key={`${metric.label}:${metric.value}`}
          style={[styles.metric, index > 0 && styles.divider]}
        >
          <Text style={styles.label}>{metric.label}</Text>
          <Text style={styles.value}>{metric.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  section: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    marginTop: space.xs,
  },
  row: { flexGrow: 1, paddingVertical: space.md },
  metric: { flexGrow: 1, gap: 3, minWidth: 88, paddingHorizontal: space.md },
  divider: { borderLeftColor: palette.line, borderLeftWidth: 1 },
  label: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  value: {
    color: palette.ink,
    fontFamily: fonts.recipeBodyBold,
    fontSize: 13,
    lineHeight: 18,
  },
}));
