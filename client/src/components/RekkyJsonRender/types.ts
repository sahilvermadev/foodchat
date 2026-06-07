import type { z } from 'zod4';
import type {
  checklistPropsSchema,
  comparisonGridPropsSchema,
  ingredientSwapTablePropsSchema,
  metricRowPropsSchema,
  rekkyJsonRenderElementSchema,
  rekkyJsonRenderSpecSchema,
} from './catalog';

export type RekkyJsonRenderElement = z.infer<typeof rekkyJsonRenderElementSchema>;
export type RekkyJsonRenderSpec = z.infer<typeof rekkyJsonRenderSpecSchema>;
export type MetricRowProps = z.infer<typeof metricRowPropsSchema>;
export type IngredientSwapTableProps = z.infer<typeof ingredientSwapTablePropsSchema>;
export type ChecklistProps = z.infer<typeof checklistPropsSchema>;
export type ComparisonGridProps = z.infer<typeof comparisonGridPropsSchema>;
