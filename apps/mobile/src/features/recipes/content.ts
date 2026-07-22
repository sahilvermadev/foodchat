export type RecipeMetric = { label: string; value: string };

export type RecipeReaderContent = {
  afterMetrics: string;
  beforeMetrics: string;
  metrics: RecipeMetric[];
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
