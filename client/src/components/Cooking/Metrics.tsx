import type { RecipeMetric } from './recipe';

type RecipeMetricsProps = {
  metrics: RecipeMetric[];
};

export default function RecipeMetrics({ metrics }: RecipeMetricsProps) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div data-testid="recipe-metrics" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={`${metric.label}:${metric.value}`}
          className="min-w-0 rounded-md border border-border-light bg-surface-primary-alt px-3 py-3 sm:px-4"
        >
          <div className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {metric.label}
          </div>
          <div className="mt-1 break-words text-sm font-semibold leading-5 text-text-primary">
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
