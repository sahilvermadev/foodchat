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
      className="mb-7 grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border-light pb-5 sm:mb-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4"
    >
      {metrics.map((metric) => (
        <div key={`${metric.label}:${metric.value}`} className="min-w-0">
          <div className="rekky-meta text-balance text-text-secondary">{metric.label}</div>
          <div className="rekky-quantity mt-1.5 max-w-[11rem] break-words text-[0.9rem] font-bold leading-5 text-text-primary sm:max-w-none sm:text-sm">
            {metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}
