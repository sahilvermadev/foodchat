export { structuredRecipeFromMarkdown } from 'librechat-data-provider/mobile';

export type RecipeMetric = { label: string; value: string };

export type RecipeReaderContent = {
  afterMetrics: string;
  beforeMetrics: string;
  metrics: RecipeMetric[];
};

export type RecipeSupplement = {
  equipment: string[];
  makeAhead: string[];
  nutrition: string[];
  safety: string[];
  storage: string[];
  substitutions: string[];
};

const metadataHeading = /^##\s+(recipe data|at a glance)\s*$/i;
const sectionHeading = /^##\s+/;
const separatorCell = /^:?-{3,}:?$/;

const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const metricsFromLines = (lines: string[]) =>
  lines.reduce<RecipeMetric[]>((metrics, line) => {
    if (!line.trim().startsWith('|')) return metrics;
    const [label, ...valueCells] = tableCells(line);
    const value = valueCells.join(' | ').trim();
    if (!label || !value) return metrics;
    if (label.toLowerCase() === 'field' && value.toLowerCase() === 'value') return metrics;
    if (separatorCell.test(label) && separatorCell.test(value)) return metrics;
    return [...metrics, { label, value }];
  }, []);

export function recipeReaderContent(markdown: string): RecipeReaderContent {
  const lines = markdown.trim().split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => metadataHeading.test(line.trim()));
  if (headingIndex < 0) {
    return { afterMetrics: '', beforeMetrics: markdown.trim(), metrics: [] };
  }
  const nextSectionOffset = lines
    .slice(headingIndex + 1)
    .findIndex((line) => sectionHeading.test(line.trim()));
  const nextSectionIndex =
    nextSectionOffset < 0 ? lines.length : headingIndex + 1 + nextSectionOffset;
  const metrics = metricsFromLines(lines.slice(headingIndex + 1, nextSectionIndex));
  if (!metrics.length) {
    return { afterMetrics: '', beforeMetrics: markdown.trim(), metrics: [] };
  }
  return {
    afterMetrics: lines.slice(nextSectionIndex).join('\n').trim(),
    beforeMetrics: lines.slice(0, headingIndex).join('\n').trim(),
    metrics,
  };
}

const anyHeading = /^#{1,3}\s+/;

const sectionLines = (lines: string[], heading: RegExp) => {
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => anyHeading.test(line.trim()));
  return end < 0 ? rest : rest.slice(0, end);
};

const cleanSectionLines = (lines: string[]) =>
  lines.reduce<string[]>((items, line) => {
    const trimmed = line.trim();
    if (!trimmed || separatorCell.test(trimmed.replace(/\|/g, '').trim())) return items;
    if (trimmed.startsWith('|')) {
      const [label, ...values] = tableCells(trimmed);
      const value = values.join(' ').trim();
      if (
        !label ||
        !value ||
        (separatorCell.test(label) && separatorCell.test(value)) ||
        /^(field|item|nutrient)$/i.test(label)
      ) {
        return items;
      }
      return [...items, `${label}: ${value}`];
    }
    return [...items, trimmed.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '')];
  }, []);

const supplementHeadings: Array<[keyof RecipeSupplement, RegExp]> = [
  ['equipment', /^#{1,3}\s+(equipment|tools?|you(?:'|’)ll need)\s*$/i],
  ['safety', /^#{1,3}\s+(safety|food safety|warnings?)\s*$/i],
  ['storage', /^#{1,3}\s+(storage|storing|leftovers?|reheating)\s*$/i],
  ['substitutions', /^#{1,3}\s+(substitutions?|swaps?|variations?)\s*$/i],
  ['nutrition', /^#{1,3}\s+(nutrition|nutritional information)\s*$/i],
  ['makeAhead', /^#{1,3}\s+(make ahead|prep ahead|advance preparation)\s*$/i],
];

export function recipeSupplementFromMarkdown(markdown: string): RecipeSupplement {
  const lines = markdown.split(/\r?\n/);
  const empty: RecipeSupplement = {
    equipment: [],
    makeAhead: [],
    nutrition: [],
    safety: [],
    storage: [],
    substitutions: [],
  };
  return supplementHeadings.reduce<RecipeSupplement>((supplement, [key, heading]) => {
    return { ...supplement, [key]: cleanSectionLines(sectionLines(lines, heading)) };
  }, empty);
}
