import { defineCatalog, defineSchema } from '@json-render/core';
import { z } from 'zod4';
import type { ComponentSchema } from '@json-render/core';

const optionalText = z.string().trim().min(1).optional();
const textArray = z.array(z.string().trim().min(1)).min(1).max(12);

const comparisonColumn = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(240),
});

export const metricRowPropsSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(32),
        value: z.string().trim().min(1).max(64),
      }),
    )
    .min(1)
    .max(6),
});

export const ingredientSwapTablePropsSchema = z.object({
  title: optionalText,
  rows: z
    .array(
      z.object({
        ingredient: z.string().trim().min(1).max(64),
        swap: z.string().trim().min(1).max(96),
        note: z.string().trim().min(1).max(180),
      }),
    )
    .min(1)
    .max(8),
});

export const checklistPropsSchema = z.object({
  title: optionalText,
  items: textArray,
});

export const comparisonGridPropsSchema = z.object({
  title: optionalText,
  columns: z.array(comparisonColumn).min(2).max(4),
});

export const rekkyJsonRenderElementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MetricRow'),
    props: metricRowPropsSchema,
    children: z.array(z.string()),
  }),
  z.object({
    type: z.literal('IngredientSwapTable'),
    props: ingredientSwapTablePropsSchema,
    children: z.array(z.string()),
  }),
  z.object({
    type: z.literal('Checklist'),
    props: checklistPropsSchema,
    children: z.array(z.string()),
  }),
  z.object({
    type: z.literal('ComparisonGrid'),
    props: comparisonGridPropsSchema,
    children: z.array(z.string()),
  }),
]);

export const rekkyJsonRenderSpecSchema = z.object({
  root: z.string().trim().min(1),
  elements: z.record(z.string(), rekkyJsonRenderElementSchema),
});

function jsonRenderProps<T extends z.ZodRawShape>(schema: z.ZodObject<T>): ComponentSchema {
  return schema;
}

export const rekkyJsonRenderSchema = defineSchema(
  (schema) => ({
    spec: schema.object({
      root: schema.string(),
      elements: schema.record(
        schema.object({
          type: schema.ref('catalog.components'),
          props: schema.propsOf('catalog.components'),
          children: schema.array(schema.string()),
        }),
      ),
    }),
    catalog: schema.object({
      components: schema.map({
        props: schema.zod(),
        description: schema.string(),
      }),
      actions: schema.map({
        description: schema.string(),
      }),
    }),
  }),
  {
    defaultRules: [
      'Use these widgets only for compact cooking utility, not decoration.',
      'Keep labels short, sensory, and practical.',
      'Prefer 1-4 widgets per answer; normal prose should stay in markdown.',
      'Never invent component names outside the catalog.',
    ],
  },
);

export const rekkyJsonRenderCatalog = defineCatalog(rekkyJsonRenderSchema, {
  components: {
    MetricRow: {
      description: 'Compact label/value cooking metrics such as time, yield, heat, or difficulty.',
      props: jsonRenderProps(metricRowPropsSchema),
    },
    IngredientSwapTable: {
      description: 'Ingredient substitutions with reason and when each swap works.',
      props: jsonRenderProps(ingredientSwapTablePropsSchema),
    },
    Checklist: {
      description: 'A short actionable checklist for prep, shopping, troubleshooting, or serving.',
      props: jsonRenderProps(checklistPropsSchema),
    },
    ComparisonGrid: {
      description: 'A concise comparison of cooking choices, dishes, methods, or adaptations.',
      props: jsonRenderProps(comparisonGridPropsSchema),
    },
  },
  actions: {},
});
