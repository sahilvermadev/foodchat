import type { SavedRecipe } from 'librechat-data-provider';

export type RecipeMetric = {
  label: string;
  value: string;
};

export type RecipeMarkdownDisplay = {
  title: string;
  body: string;
  metrics: RecipeMetric[];
};

function isWrapperLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '{' || trimmed === '}';
}

function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanMetricText(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMetricLabel(value: string): string {
  return cleanMetricText(value).replace(/:$/, '').trim();
}

function isRecipeDataHeading(line: string): boolean {
  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  return Boolean(heading && cleanMetricText(heading[2]).toLowerCase() === 'recipe data');
}

function headingDepth(line: string): number {
  const heading = line.match(/^(#{1,6})\s+/);
  return heading ? heading[1].length : 0;
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim());
}

function tableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.includes('|')) {
    return [];
  }
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cleanMetricText)
    .filter(Boolean);
}

function isTableHeader(label: string, value: string): boolean {
  return (
    ['label', 'metric', 'item', 'field'].includes(label.toLowerCase()) &&
    ['value', 'amount', 'detail', 'data'].includes(value.toLowerCase())
  );
}

function metricFromLine(line: string): RecipeMetric | null {
  const withoutListMarker = line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '');
  if (!withoutListMarker || isTableSeparator(withoutListMarker)) {
    return null;
  }

  const cells = tableCells(withoutListMarker);
  if (cells.length >= 2) {
    const [rawLabel, ...rawValue] = cells;
    const label = cleanMetricLabel(rawLabel);
    const value = cleanMetricText(rawValue.join(' | '));
    if (!label || !value || isTableHeader(label, value)) {
      return null;
    }
    return { label, value };
  }

  const boldLabel = withoutListMarker.match(/^(\*\*|__)(.+?)(?::)?\1\s*:?\s*(.+)$/);
  if (boldLabel) {
    const label = cleanMetricLabel(boldLabel[2]);
    const value = cleanMetricText(boldLabel[3]);
    return label && value ? { label, value } : null;
  }

  const labelValue = withoutListMarker.match(/^([^:\n|]{2,48}):\s*(.+)$/);
  if (!labelValue) {
    return null;
  }

  const label = cleanMetricLabel(labelValue[1]);
  const value = cleanMetricText(labelValue[2]);
  return label && value ? { label, value } : null;
}

function splitRecipeData(markdown: string): { body: string; metrics: RecipeMetric[] } {
  const lines = markdown.split('\n');
  const start = lines.findIndex(isRecipeDataHeading);

  if (start === -1) {
    return { body: markdown.trim(), metrics: [] };
  }

  const depth = headingDepth(lines[start]);
  const end = lines.findIndex(
    (line, index) => index > start && headingDepth(line) > 0 && headingDepth(line) <= depth,
  );
  const sectionEnd = end === -1 ? lines.length : end;
  const sectionLines = lines.slice(start + 1, sectionEnd);
  const metrics = sectionLines
    .map(metricFromLine)
    .filter((metric): metric is RecipeMetric => Boolean(metric));
  const body = [...lines.slice(0, start), ...lines.slice(sectionEnd)].join('\n').trim();

  if (metrics.length === 0) {
    return { body: markdown.trim(), metrics: [] };
  }

  return { body, metrics };
}

export function cleanRecipeMarkdown(markdown: string): string {
  const lines = markdown.trim().split('\n');
  while (lines.length > 0 && isWrapperLine(lines[0])) {
    lines.shift();
  }
  while (lines.length > 0 && isWrapperLine(lines[lines.length - 1])) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

export function recipeDisplayTitle(recipe: SavedRecipe): string {
  const title = recipe.title.trim();
  if (title && !isWrapperLine(title)) {
    return title;
  }

  const heading = cleanRecipeMarkdown(recipe.documentMarkdown)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  return heading ? headingText(heading) : 'Saved recipe';
}

export function recipeBodyMarkdown(recipe: SavedRecipe): string {
  const title = normalizeTitle(recipeDisplayTitle(recipe));
  const lines = cleanRecipeMarkdown(recipe.documentMarkdown).split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return '';
  }

  const firstContent = lines[firstContentIndex].trim();
  const isDuplicateHeading =
    /^#{1,3}\s+\S/.test(firstContent) && normalizeTitle(headingText(firstContent)) === title;

  if (!isDuplicateHeading) {
    return lines.join('\n').trim();
  }

  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    .join('\n')
    .trim();
}

export function recipeMarkdownDisplay(
  markdown: string,
  fallbackTitle?: string,
): RecipeMarkdownDisplay {
  const lines = cleanRecipeMarkdown(markdown).split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return {
      title: fallbackTitle?.trim() || '',
      body: '',
      metrics: [],
    };
  }

  const firstContent = lines[firstContentIndex].trim();
  const firstHeading = firstContent.match(/^#\s+(.+)$/);
  const title = firstHeading ? cleanMetricText(firstHeading[1]) : fallbackTitle?.trim() || '';
  const bodyLines = firstHeading
    ? [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    : lines;
  const { body, metrics } = splitRecipeData(bodyLines.join('\n').trim());

  return {
    title,
    body,
    metrics,
  };
}
