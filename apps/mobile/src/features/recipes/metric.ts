import type { RecipeMetric } from './content';

export const visibleRecipeMetrics = (metrics: RecipeMetric[]) =>
  metrics.filter((metric) => {
    const label = metric.label.trim();
    if (/^(servings?|yield)$/i.test(label)) return false;
    const zeroTime = /^0(?:\.0+)?(?:\s*(?:minutes?|mins?|hours?|hrs?))?$/i.test(
      metric.value.trim(),
    );
    return !(/time$/i.test(label) && zeroTime);
  });
