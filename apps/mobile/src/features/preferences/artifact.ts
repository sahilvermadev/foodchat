export const preferenceHeadings = [
  'Safety',
  'Diet',
  'Religious & Cultural Rules',
  'Cooking Level',
  'Household',
  'Kitchen',
  'Specialty Ingredients',
  'Taste',
  'Goals',
  'Location',
  'Personal Context',
] as const;

export type PreferenceHeading = (typeof preferenceHeadings)[number];

export type PreferenceSection = {
  heading: PreferenceHeading;
  lines: string[];
};

const markdownLines = (markdown: string) => markdown.replace(/\r\n/g, '\n').split('\n');

const parsedSections = (markdown: string) => {
  const sections = new Map<string, string[]>();
  let activeHeading: string | undefined;

  markdownLines(markdown).forEach((line) => {
    const heading = line.match(/^##\s+(.+?)\s*$/)?.[1];
    if (heading) {
      activeHeading = heading;
      if (!sections.has(heading)) sections.set(heading, []);
      return;
    }
    if (activeHeading && line.trim()) sections.get(activeHeading)?.push(line);
  });

  return sections;
};

const renderedSections = (sections: Map<string, string[]>) =>
  preferenceHeadings
    .flatMap((heading) => {
      const lines = sections.get(heading)?.filter((line) => line.trim()) ?? [];
      return lines.length ? [`## ${heading}`, ...lines, ''] : [];
    })
    .join('\n')
    .trim();

export const cleanPreferenceLine = (line: string) =>
  line
    .trim()
    .replace(/^[-*]\s*/, '')
    .replace(/\s+/g, ' ');

export const preferenceSections = (markdown: string): PreferenceSection[] => {
  const sections = parsedSections(markdown);
  return preferenceHeadings.map((heading) => ({
    heading,
    lines: (sections.get(heading) ?? []).map(cleanPreferenceLine).filter(Boolean),
  }));
};

export const replacePreferenceSection = (
  markdown: string,
  heading: PreferenceHeading,
  lines: string[],
) => {
  const sections = parsedSections(markdown);
  const normalized = lines
    .map(cleanPreferenceLine)
    .filter(Boolean)
    .map((line) => `- ${line}`);
  if (normalized.length) sections.set(heading, normalized);
  else sections.delete(heading);
  return renderedSections(sections);
};
