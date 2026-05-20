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

export type PreferencePatchOperation =
  | { op: 'set_section'; heading: PreferenceHeading; markdown: string }
  | { op: 'append_to_section'; heading: PreferenceHeading; markdown: string }
  | { op: 'remove_line'; heading: PreferenceHeading; line: string; confirmed?: boolean }
  | { op: 'replace'; markdown: string; confirmed?: boolean };

export type PreferencePatchResult = {
  markdown: string;
  changed: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
  changedHeadings: PreferenceHeading[];
};

const headingSet = new Set<string>(PREFERENCE_HEADINGS);
const safetyHeading = 'Safety';

export type PreferenceProfileStatus = {
  complete: boolean;
  populated: PreferenceHeading[];
  missing: PreferenceHeading[];
  nextQuestion?: string;
};

const headingKeywords: Record<PreferenceHeading, RegExp> = {
  Safety: /\b(allerg|intoleran|unsafe|medical|avoid for health|precaution|restriction)\b/i,
  Diet: /\b(vegan|vegetarian|halal|kosher|gluten|diet|macro|protein|calorie)\b/i,
  'Religious & Cultural Rules':
    /\b(religio|cultural|halal|kosher|jain|hindu|muslim|christian|buddhist|fasting|lent|ramadan|navratri|shravan|pork|beef|alcohol|gelatin|cross[- ]?contamination)\b/i,
  'Cooking Level': /\b(beginner|intermediate|advanced|skill|technique|confidence|cook for fun)\b/i,
  Household: /\b(parent|mom|dad|family|people|serving|household|cook for|meal prep)\b/i,
  Kitchen:
    /\b(oven|microwave|griddle|grill|bbq|freezer|blender|juicer|air ?fryer|stove|pan|equipment|appliance|cookware)\b/i,
  Taste: /\b(spicy|savou?ry|sweet|sour|bitter|fresh|herby|texture|flavo[u]?r|tasty|authentic)\b/i,
  Goals:
    /\b(goal|quick|time|long recipe|advance|experience|experiment|new dishes|memorable|authentic|efficient)\b/i,
  Location:
    /\b(delhi|dwarka|market|bazaar|local ingredient|ingredient access|city|country|store|locale|timezone|browser location|coordinates|measurement)\b/i,
  'Personal Context':
    /\b(work|schedule|routine|student|job|partner|roommate|parent|hosting|birthday|comfort food|nostalgia|learning style|confidence|stress|celebrat|tradition|memory)\b/i,
};

const nextQuestions: Record<PreferenceHeading, string> = {
  Safety: 'Any allergies, intolerances, or safety restrictions I should always respect?',
  Diet: 'Any dietary rules I should keep in mind, or can recipes be unrestricted?',
  'Religious & Cultural Rules':
    'Any religious or cultural food rules I should treat as hard boundaries?',
  'Cooking Level':
    'How would you describe your cooking level and the kind of difficulty you enjoy?',
  Household: 'Who do you usually cook for, and how many servings should I assume?',
  Kitchen: 'What equipment should I assume you have or do not have?',
  Taste: 'Are there flavors or textures you especially like or dislike?',
  Goals:
    'What are you usually trying to get from this app: speed, authenticity, learning, entertaining, or something else?',
  Location: 'Where do you usually shop or cook, so I can account for ingredient access?',
  'Personal Context':
    'Anything about your routines, cooking memories, or learning style that would help me cook with you better?',
};

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

function ensureBullet(line: string): string {
  const clean = line.trim().replace(/^[-*]\s*/, '');
  return clean ? `- ${clean}` : '';
}

function matchingHeadings(line: string): PreferenceHeading[] {
  return PREFERENCE_HEADINGS.filter((heading) => headingKeywords[heading].test(line));
}

function isValidSectionLine(heading: PreferenceHeading, line: string): boolean {
  const clean = line.trim();
  if (!clean) {
    return false;
  }
  if (clean.length > 180) {
    return false;
  }
  const matches = matchingHeadings(clean);
  if (matches.length === 0) {
    return true;
  }
  if (!matches.includes(heading)) {
    return false;
  }
  return matches.length <= 2;
}

function normalizeSectionBody(
  heading: PreferenceHeading,
  markdown: string,
): { lines: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = cleanLines(markdown)
    .map((line) => ensureBullet(line.trimEnd()))
    .filter((line) => {
      if (!line.trim()) {
        return false;
      }
      if (isValidSectionLine(heading, line)) {
        return true;
      }
      warnings.push(`Skipped broad or misplaced ${heading} preference: ${line}`);
      return false;
    });

  return { lines, warnings };
}

function normalizeSectionsMarkdown(markdown: string): { markdown: string; warnings: string[] } {
  const sections = parseSections(markdown);
  const warnings: string[] = [];
  PREFERENCE_HEADINGS.forEach((heading) => {
    const body = sections.get(heading);
    if (!body) {
      return;
    }
    const normalized = normalizeSectionBody(heading, body.join('\n'));
    sections.set(heading, normalized.lines);
    warnings.push(...normalized.warnings);
  });
  return { markdown: renderSections(sections), warnings };
}

function rawSectionBody(markdown: string): string[] {
  return cleanLines(markdown)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function appendUnique(existing: string[], addition: string[]): string[] {
  const seen = new Set(existing.map((line) => line.trim().toLowerCase()));
  return [
    ...existing,
    ...addition.filter((line) => {
      const key = line.trim().toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }),
  ];
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
    const body = rawSectionBody(lines.slice(range.start + 1, range.end).join('\n'));
    sections.set(heading, body);
    return sections;
  }, new Map<string, string[]>());
}

function uniqueHeadings(headings: PreferenceHeading[]): PreferenceHeading[] {
  return PREFERENCE_HEADINGS.filter((heading) => headings.includes(heading));
}

function removesSafety(currentMarkdown: string, operation: PreferencePatchOperation): boolean {
  if (operation.op === 'remove_line' && operation.heading === safetyHeading) {
    return true;
  }
  if (operation.op !== 'replace') {
    return false;
  }
  const currentSafety = parseSections(currentMarkdown).get(safetyHeading) ?? [];
  if (currentSafety.length === 0) {
    return false;
  }
  const nextSafety = parseSections(operation.markdown).get(safetyHeading) ?? [];
  return nextSafety.join('\n').length < currentSafety.join('\n').length;
}

export function isPreferenceHeading(value: unknown): value is PreferenceHeading {
  return typeof value === 'string' && headingSet.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePreferenceOperation(value: unknown): PreferencePatchOperation | null {
  if (!isRecord(value) || typeof value.op !== 'string') {
    return null;
  }

  if (
    (value.op === 'set_section' || value.op === 'append_to_section') &&
    isPreferenceHeading(value.heading) &&
    typeof value.markdown === 'string'
  ) {
    return {
      op: value.op,
      heading: value.heading,
      markdown: value.markdown,
    };
  }

  if (
    value.op === 'remove_line' &&
    isPreferenceHeading(value.heading) &&
    typeof value.line === 'string'
  ) {
    return {
      op: 'remove_line',
      heading: value.heading,
      line: value.line,
      confirmed: value.confirmed === true,
    };
  }

  if (value.op === 'replace' && typeof value.markdown === 'string') {
    return {
      op: 'replace',
      markdown: value.markdown,
      confirmed: value.confirmed === true,
    };
  }

  return null;
}

export function normalizePreferenceOperations(value: unknown): PreferencePatchOperation[] {
  return Array.isArray(value)
    ? value
        .map(normalizePreferenceOperation)
        .filter((operation): operation is PreferencePatchOperation => Boolean(operation))
    : [];
}

export function applyPreferencePatch(
  currentMarkdown: string,
  operation: PreferencePatchOperation,
): PreferencePatchResult {
  const confirmed =
    (operation.op === 'remove_line' || operation.op === 'replace') && operation.confirmed === true;
  if (removesSafety(currentMarkdown, operation) && !confirmed) {
    return {
      markdown: currentMarkdown,
      changed: false,
      requiresConfirmation: true,
      warnings: ['Safety changes require confirmation.'],
      changedHeadings: [],
    };
  }

  if (operation.op === 'replace') {
    const normalized = normalizeSectionsMarkdown(operation.markdown);
    const markdown = normalized.markdown;
    return {
      markdown,
      changed: markdown !== currentMarkdown.trim(),
      requiresConfirmation: false,
      warnings: normalized.warnings,
      changedHeadings: [...PREFERENCE_HEADINGS],
    };
  }

  const sections = parseSections(currentMarkdown);
  const existing = sections.get(operation.heading) ?? [];
  const warnings: string[] = [];

  if (operation.op === 'set_section') {
    const normalized = normalizeSectionBody(operation.heading, operation.markdown);
    sections.set(operation.heading, normalized.lines);
    warnings.push(...normalized.warnings);
  }

  if (operation.op === 'append_to_section') {
    const normalized = normalizeSectionBody(operation.heading, operation.markdown);
    sections.set(operation.heading, appendUnique(existing.map(ensureBullet), normalized.lines));
    warnings.push(...normalized.warnings);
  }

  if (operation.op === 'remove_line') {
    const needle = operation.line.trim();
    sections.set(
      operation.heading,
      existing.filter((line) => line.trim() !== needle),
    );
  }

  const markdown = renderSections(sections);
  return {
    markdown,
    changed: markdown !== currentMarkdown.trim(),
    requiresConfirmation: false,
    warnings,
    changedHeadings: markdown !== currentMarkdown.trim() ? [operation.heading] : [],
  };
}

export function renderPreferencesMarkdown(markdown: string): string {
  return normalizeSectionsMarkdown(markdown).markdown;
}

export function preferenceSections(markdown: string): Map<PreferenceHeading, string[]> {
  const sections = parseSections(markdown);
  return PREFERENCE_HEADINGS.reduce((result, heading) => {
    result.set(
      heading,
      (sections.get(heading) ?? []).filter((line) => line.trim()),
    );
    return result;
  }, new Map<PreferenceHeading, string[]>());
}

export function preferenceProfileStatus(markdown: string): PreferenceProfileStatus {
  const sections = preferenceSections(markdown);
  const populated = PREFERENCE_HEADINGS.filter(
    (heading) => (sections.get(heading) ?? []).length > 0,
  );
  const required: PreferenceHeading[] = [
    'Safety',
    'Diet',
    'Religious & Cultural Rules',
    'Cooking Level',
    'Household',
    'Kitchen',
    'Goals',
    'Location',
  ];
  const missing = required.filter((heading) => !populated.includes(heading));
  return {
    populated,
    missing,
    complete: missing.length === 0,
    nextQuestion: missing[0] ? nextQuestions[missing[0]] : undefined,
  };
}

export function normalizeChangedHeadings(headings: PreferenceHeading[]): PreferenceHeading[] {
  return uniqueHeadings(headings);
}
