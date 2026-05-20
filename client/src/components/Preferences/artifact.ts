export const PREFERENCE_HEADINGS = [
  'Safety',
  'Diet',
  'Religious & Cultural Rules',
  'Cooking Level',
  'Household',
  'Kitchen',
  'Taste',
  'Goals',
  'Location',
  'Personal Context',
] as const;

export type PreferenceHeading = (typeof PREFERENCE_HEADINGS)[number];

function cleanLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, '\n').split('\n');
}

function sectionRanges(markdown: string): Map<string, { start: number; end: number }> {
  const lines = cleanLines(markdown);
  const ranges = new Map<string, { start: number; end: number }>();
  let active: { heading: string; start: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    if (active) {
      ranges.set(active.heading, { start: active.start, end: index });
    }
    active = { heading: match[1], start: index };
  }

  if (active) {
    ranges.set(active.heading, { start: active.start, end: lines.length });
  }

  return ranges;
}

function renderSections(sections: Map<string, string[]>): string {
  return PREFERENCE_HEADINGS.flatMap((heading) => {
    const body = sections.get(heading) ?? [];
    const populated = body.filter((line) => line.trim().length > 0);
    return populated.length > 0 ? [`## ${heading}`, ...populated, ''] : [];
  })
    .join('\n')
    .trim();
}

function parseSections(markdown: string): Map<string, string[]> {
  const lines = cleanLines(markdown);
  const ranges = sectionRanges(markdown);
  return PREFERENCE_HEADINGS.reduce((sections, heading) => {
    const range = ranges.get(heading);
    if (!range) {
      return sections;
    }
    const body = lines.slice(range.start + 1, range.end).filter((line) => line.trim());
    sections.set(heading, body);
    return sections;
  }, new Map<string, string[]>());
}

export function renderPreferencesMarkdown(markdown: string): string {
  return renderSections(parseSections(markdown));
}

export function renderEditablePreferencesMarkdown(markdown: string): string {
  const sections = parseSections(markdown);
  return PREFERENCE_HEADINGS.flatMap((heading) => [
    `## ${heading}`,
    ...(sections.get(heading) ?? []),
    '',
  ])
    .join('\n')
    .trim();
}

export function populatedPreferenceSections(markdown: string): Array<{
  heading: PreferenceHeading;
  lines: string[];
}> {
  const sections = parseSections(markdown);
  return PREFERENCE_HEADINGS.flatMap((heading) => {
    const lines = (sections.get(heading) ?? []).filter((line) => line.trim());
    return lines.length > 0 ? [{ heading, lines }] : [];
  });
}

export function preferenceSections(markdown: string): Array<{
  heading: PreferenceHeading;
  lines: string[];
}> {
  const sections = parseSections(markdown);
  return PREFERENCE_HEADINGS.map((heading) => ({
    heading,
    lines: (sections.get(heading) ?? []).filter((line) => line.trim()),
  }));
}
