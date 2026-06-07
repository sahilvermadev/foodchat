import { autoFixSpec, validateSpec } from '@json-render/core';
import type { SpecIssue } from '@json-render/core';
import { rekkyJsonRenderCatalog, rekkyJsonRenderSpecSchema } from './catalog';
import type { RekkyJsonRenderSpec } from './types';

export type RekkyJsonRenderParseResult =
  | {
      success: true;
      spec: RekkyJsonRenderSpec;
    }
  | {
      success: false;
      error: string;
      issues?: SpecIssue[];
    };

function parseJson(value: string): unknown {
  return JSON.parse(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSpec(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if ('root' in value && 'elements' in value) {
    return value;
  }

  if (typeof value.type !== 'string') {
    return value;
  }

  const element = {
    type: value.type,
    props: isRecord(value.props) ? value.props : {},
    children: Array.isArray(value.children)
      ? value.children.filter((child): child is string => typeof child === 'string')
      : [],
  };

  return {
    root: 'root',
    elements: {
      root: element,
    },
  };
}

export function parseRekkyJsonRenderSpec(value: string): RekkyJsonRenderParseResult {
  let parsed: unknown;
  try {
    parsed = normalizeSpec(parseJson(value));
  } catch {
    return { success: false, error: 'Invalid Rekky widget JSON.' };
  }

  const localResult = rekkyJsonRenderSpecSchema.safeParse(parsed);
  if (!localResult.success) {
    return { success: false, error: 'Rekky widget does not match the allowed catalog.' };
  }

  const catalogResult = rekkyJsonRenderCatalog.validate(localResult.data);
  if (!catalogResult.success || !catalogResult.data) {
    return { success: false, error: 'Rekky widget does not match the allowed catalog.' };
  }

  const fixed = autoFixSpec(catalogResult.data);
  const structuralResult = validateSpec(fixed.spec, { checkOrphans: true });
  if (!structuralResult.valid) {
    return {
      success: false,
      error: 'Rekky widget has an invalid tree.',
      issues: structuralResult.issues,
    };
  }

  const fixedResult = rekkyJsonRenderSpecSchema.safeParse(fixed.spec);
  if (!fixedResult.success) {
    return { success: false, error: 'Rekky widget has an invalid tree.' };
  }

  return { success: true, spec: fixedResult.data };
}
