export type RecipeCanvasOperation =
  | { op: 'set_title'; title: string }
  | { op: 'replace_section'; heading: string; markdown: string }
  | { op: 'append_to_section'; heading: string; markdown: string }
  | { op: 'replace_step'; step: number; markdown: string }
  | { op: 'append_note'; markdown: string };

const sectionHeadingPattern = /^(#{1,6})\s+(.+?)\s*$/;
const cookingActionsPattern =
  /\b(marinate|mix|blend|grind|heat|cook|simmer|steam|bake|fry|roast|stir|serve)\b/;

function cleanMarkdownText(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSection(lines: string[], heading: string): { start: number; end: number } | null {
  const normalizedTarget = cleanMarkdownText(heading).toLowerCase();
  const start = lines.findIndex((line) => {
    const match = line.match(sectionHeadingPattern);
    return match ? cleanMarkdownText(match[2]).toLowerCase() === normalizedTarget : false;
  });
  if (start < 0) {
    return null;
  }

  const level = lines[start].match(sectionHeadingPattern)?.[1].length ?? 6;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(sectionHeadingPattern);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function setTitle(markdown: string, title: string): string {
  const lines = markdown.split('\n');
  const index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (index >= 0) {
    lines[index] = `# ${title}`;
    return lines.join('\n');
  }
  return [`# ${title}`, markdown.trim()].filter(Boolean).join('\n\n');
}

function replaceSection(
  markdown: string,
  heading: string,
  sectionMarkdown: string,
): { markdown: string; warning?: string } {
  const lines = markdown.split('\n');
  const section = findSection(lines, heading);
  if (!section) {
    return { markdown, warning: `Section not found: ${heading}` };
  }

  const replacement = sectionMarkdown.match(sectionHeadingPattern)
    ? sectionMarkdown.split('\n')
    : [lines[section.start], '', ...sectionMarkdown.split('\n')];

  lines.splice(section.start, section.end - section.start, ...replacement);
  return { markdown: lines.join('\n').trim() };
}

function appendToSection(
  markdown: string,
  heading: string,
  addition: string,
): { markdown: string; warning?: string } {
  const lines = markdown.split('\n');
  const section = findSection(lines, heading);
  if (!section) {
    return { markdown, warning: `Section not found: ${heading}` };
  }

  const insertAt = section.end;
  const prefix = lines[insertAt - 1]?.trim() ? ['', ...addition.split('\n')] : addition.split('\n');
  lines.splice(insertAt, 0, ...prefix);
  return { markdown: lines.join('\n').trim() };
}

function replaceStep(
  markdown: string,
  step: number,
  replacement: string,
): { markdown: string; warning?: string } {
  const lines = markdown.split('\n');
  const section = findSection(lines, 'Instructions') ?? findSection(lines, 'Method');
  const start = section ? section.start + 1 : 0;
  const end = section ? section.end : lines.length;
  const pattern = new RegExp(`^\\s*${step}[.)]\\s+`);
  const index = lines.findIndex(
    (line, lineIndex) => lineIndex >= start && lineIndex < end && pattern.test(line),
  );
  if (index < 0) {
    return { markdown, warning: `Step not found: ${step}` };
  }

  lines[index] = replacement;
  return { markdown: lines.join('\n').trim() };
}

function appendNote(markdown: string, note: string): { markdown: string } {
  const lines = markdown.split('\n');
  const section = findSection(lines, 'Notes');
  if (!section) {
    return { markdown: [markdown.trim(), '## Notes', note].join('\n\n') };
  }

  lines.splice(section.end, 0, '', note);
  return { markdown: lines.join('\n').trim() };
}

function applyOperation(
  markdown: string,
  operation: RecipeCanvasOperation,
): { markdown: string; warning?: string } {
  if (operation.op === 'set_title') {
    return { markdown: setTitle(markdown, operation.title) };
  }
  if (operation.op === 'replace_section') {
    return replaceSection(markdown, operation.heading, operation.markdown);
  }
  if (operation.op === 'append_to_section') {
    return appendToSection(markdown, operation.heading, operation.markdown);
  }
  if (operation.op === 'replace_step') {
    return replaceStep(markdown, operation.step, operation.markdown);
  }
  return appendNote(markdown, operation.markdown);
}

export function applyRecipeCanvasOperations(
  currentMarkdown: string,
  operations: RecipeCanvasOperation[],
): { markdown: string; changed: boolean; warnings: string[] } {
  const result = operations.reduce(
    (state, operation) => {
      const next = applyOperation(state.markdown, operation);
      return {
        markdown: next.markdown,
        warnings: next.warning ? [...state.warnings, next.warning] : state.warnings,
      };
    },
    { markdown: currentMarkdown, warnings: [] as string[] },
  );

  return {
    ...result,
    changed: result.markdown.trim() !== currentMarkdown.trim(),
  };
}

export function isRecipeDocumentMarkdown(markdown: string): boolean {
  const normalized = markdown.trim().toLowerCase();
  if (normalized.length < 120) {
    return false;
  }

  const hasIngredientSection =
    /(^|\n)\s*#{1,4}\s*(ingredients?|shopping list)\b/.test(normalized) ||
    /(^|\n)\s*(\*\*)?(ingredients?|shopping list)(\*\*)?\s*:?\s*$/m.test(normalized);
  const hasInstructionSection =
    /(^|\n)\s*#{1,4}\s*(instructions?|directions?|method|steps?)\b/.test(normalized) ||
    /(^|\n)\s*(\*\*)?(instructions?|directions?|method|steps?|preparation|process|procedure)(\*\*)?\s*:?\s*$/m.test(
      normalized,
    );
  const numberedStepCount = normalized.match(/(^|\n)\s*\d+[.)]\s+\S/g)?.length ?? 0;
  const hasCookingActions = cookingActionsPattern.test(normalized);

  return (
    hasIngredientSection && (hasInstructionSection || (numberedStepCount >= 2 && hasCookingActions))
  );
}
