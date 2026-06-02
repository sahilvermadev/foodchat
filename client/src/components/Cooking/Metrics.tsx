import type { RecipeMetric } from './recipe';

type RecipeMetricsProps = {
  metrics: RecipeMetric[];
};

export default function RecipeMetrics({ metrics }: RecipeMetricsProps) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="recipe-metrics"
      className="mb-8 grid gap-x-6 gap-y-4 border-y border-border-light py-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {metrics.map((metric) => (
        <div
          key={`${metric.label}:${metric.value}`}
          className="min-w-0 border-l border-border-light pl-4 first:border-l-0 first:pl-0 sm:odd:border-l-0 sm:odd:pl-0 lg:odd:border-l lg:odd:pl-4 lg:first:border-l-0 lg:first:pl-0"
        >
          <div className="rekky-meta truncate text-text-secondary">
            {metric.label}
          </div>
          <div className="rekky-quantity mt-2 break-words text-sm font-bold leading-5 text-text-primary">
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
