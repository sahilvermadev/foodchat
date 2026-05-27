export type CookingArtifactOperation =
  | { op: 'set_title'; title: string }
  | { op: 'replace_section'; heading: string; markdown: string }
  | { op: 'append_to_section'; heading: string; markdown: string }
  | { op: 'replace_step'; step: number; markdown: string }
  | { op: 'append_note'; markdown: string };

export type CookingArtifactAction =
  | { type: 'create'; markdown: string; summary?: string }
  | { type: 'replace'; markdown: string; summary?: string }
  | { type: 'patch'; operations: CookingArtifactOperation[]; summary?: string }
  | { type: 'none'; summary?: string };

export type CookingAssistantParts = {
  artifactMarkdown: string;
  artifactAction: CookingArtifactAction;
  chatResponse: string;
  hasProtocol: boolean;
};

type ArtifactActionInput = {
  type?: unknown;
  markdown?: unknown;
  operations?: unknown;
  summary?: unknown;
};

const EMPTY_ACTION: CookingArtifactAction = { type: 'none' };
const SECTION_HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;
const TIMER_TOKEN_PATTERN = /\[timer:(\d+)\]/i;
const TIMER_TOKEN_GLOBAL_PATTERN = /\[timer:\d+\]/gi;
const TEXT_PROMPT_SUGGESTION_CALL_PATTERN =
  /(?:```(?:\w+)?\s*)?set_prompt_suggestions\s*\(\s*suggestions\s*=\s*\[[\s\S]*?\]\s*\)\s*;?\s*(?:```)?/gi;

function cleanMarkdownText(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTimerTokenSeconds(text: string): number | undefined {
  const match = text.match(TIMER_TOKEN_PATTERN);
  if (!match) {
    return undefined;
  }

  return Math.max(1, Number(match[1]));
}

export function stripCookingTimerTokens(text: string): string {
  return text.replace(TIMER_TOKEN_GLOBAL_PATTERN, '').replace(/\s+/g, ' ').trim();
}

function stripTextPromptSuggestionCalls(text: string): string {
  return text
    .replace(TEXT_PROMPT_SUGGESTION_CALL_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTaggedBlock(text: string, tag: string): string {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
  return text.match(pattern)?.[1]?.trim() ?? '';
}

function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return '';
}

function parseJsonProtocol(
  text: string,
): { action: CookingArtifactAction; chatResponse: string } | null {
  const jsonText = extractJsonText(text);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      artifact_action?: ArtifactActionInput;
      chat_response?: unknown;
    };
    if (!parsed || typeof parsed !== 'object' || !parsed.artifact_action) {
      return null;
    }

    return {
      action: normalizeArtifactAction(parsed.artifact_action),
      chatResponse: typeof parsed.chat_response === 'string' ? parsed.chat_response.trim() : '',
    };
  } catch {
    return null;
  }
}

function normalizeArtifactAction(value: ArtifactActionInput): CookingArtifactAction {
  const summary = typeof value.summary === 'string' ? value.summary.trim() : undefined;
  if (value.type === 'create' || value.type === 'replace') {
    return {
      type: value.type,
      markdown: typeof value.markdown === 'string' ? value.markdown.trim() : '',
      summary,
    };
  }

  if (value.type === 'patch') {
    return {
      type: 'patch',
      operations: Array.isArray(value.operations)
        ? value.operations.map(normalizeOperation).filter(isCookingArtifactOperation)
        : [],
      summary,
    };
  }

  return { type: 'none', summary };
}

function normalizeOperation(value: unknown): CookingArtifactOperation | null {
  if (!value || typeof value !== 'object' || !('op' in value)) {
    return null;
  }

  const operation = value as Record<string, unknown>;
  if (operation.op === 'set_title' && typeof operation.title === 'string') {
    return { op: 'set_title', title: operation.title.trim() };
  }
  if (
    (operation.op === 'replace_section' || operation.op === 'append_to_section') &&
    typeof operation.heading === 'string' &&
    typeof operation.markdown === 'string'
  ) {
    return {
      op: operation.op,
      heading: operation.heading.trim(),
      markdown: operation.markdown.trim(),
    };
  }
  if (
    operation.op === 'replace_step' &&
    typeof operation.step === 'number' &&
    typeof operation.markdown === 'string'
  ) {
    return { op: 'replace_step', step: operation.step, markdown: operation.markdown.trim() };
  }
  if (operation.op === 'append_note' && typeof operation.markdown === 'string') {
    return { op: 'append_note', markdown: operation.markdown.trim() };
  }

  return null;
}

function isCookingArtifactOperation(
  value: CookingArtifactOperation | null,
): value is CookingArtifactOperation {
  return value != null;
}

export function parseCookingAssistantResponse(text: string): CookingAssistantParts {
  const jsonProtocol = parseJsonProtocol(text);
  if (jsonProtocol) {
    return {
      artifactMarkdown:
        jsonProtocol.action.type === 'create' || jsonProtocol.action.type === 'replace'
          ? jsonProtocol.action.markdown
          : '',
      artifactAction: jsonProtocol.action,
      chatResponse: jsonProtocol.chatResponse,
      hasProtocol: true,
    };
  }

  const legacyArtifactMarkdown = extractTaggedBlock(text, 'recipe_artifact');
  const legacyChatResponse = extractTaggedBlock(text, 'chat_response');
  if (legacyArtifactMarkdown || legacyChatResponse) {
    return {
      artifactMarkdown: legacyArtifactMarkdown,
      artifactAction: legacyArtifactMarkdown
        ? { type: 'replace', markdown: legacyArtifactMarkdown }
        : EMPTY_ACTION,
      chatResponse: legacyChatResponse,
      hasProtocol: true,
    };
  }

  return {
    artifactMarkdown: isRecipeDocumentMarkdown(text) ? text.trim() : '',
    artifactAction: isRecipeDocumentMarkdown(text)
      ? { type: 'create', markdown: text.trim() }
      : EMPTY_ACTION,
    chatResponse: text.trim(),
    hasProtocol: false,
  };
}

export function getCookingCanvasMarkdown({
  draftMarkdown,
}: {
  assistantMarkdown?: string | null;
  draftMarkdown?: string | null;
}): string {
  return draftMarkdown?.trim() || '';
}

export function getCookingChatDisplayText(text: string, fallback: string): string | null {
  const visibleText = stripTextPromptSuggestionCalls(text);
  const parts = parseCookingAssistantResponse(visibleText);
  if (!parts.hasProtocol && !parts.artifactMarkdown) {
    if (visibleText !== text) {
      return visibleText || fallback;
    }
    if (visibleText.includes('artifact_action') || visibleText.includes('<recipe_artifact>')) {
      return fallback;
    }
    return null;
  }

  return parts.chatResponse || parts.artifactAction.summary || fallback;
}

export function applyRecipeArtifactAction(
  currentMarkdown: string,
  action: CookingArtifactAction,
): { markdown: string; changed: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (action.type === 'none') {
    return { markdown: currentMarkdown, changed: false, warnings };
  }
  if (action.type === 'create' || action.type === 'replace') {
    const markdown = action.markdown.trim();
    return { markdown, changed: markdown !== currentMarkdown.trim(), warnings };
  }

  let nextMarkdown = currentMarkdown;
  for (const operation of action.operations) {
    const result = applyOperation(nextMarkdown, operation);
    nextMarkdown = result.markdown;
    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  return {
    markdown: nextMarkdown,
    changed: nextMarkdown.trim() !== currentMarkdown.trim(),
    warnings,
  };
}

function applyOperation(
  markdown: string,
  operation: CookingArtifactOperation,
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

function setTitle(markdown: string, title: string): string {
  const lines = markdown.split('\n');
  const index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (index >= 0) {
    lines[index] = `# ${title}`;
    return lines.join('\n');
  }
  return [`# ${title}`, markdown.trim()].filter(Boolean).join('\n\n');
}

function findSection(lines: string[], heading: string): { start: number; end: number } | null {
  const normalizedTarget = cleanMarkdownText(heading).toLowerCase();
  const start = lines.findIndex((line) => {
    const match = line.match(SECTION_HEADING_PATTERN);
    return match ? cleanMarkdownText(match[2]).toLowerCase() === normalizedTarget : false;
  });
  if (start < 0) {
    return null;
  }

  const level = lines[start].match(SECTION_HEADING_PATTERN)?.[1].length ?? 6;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(SECTION_HEADING_PATTERN);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }

  return { start, end };
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

  const replacement = sectionMarkdown.match(SECTION_HEADING_PATTERN)
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

  const insertAt = section.end;
  lines.splice(insertAt, 0, '', note);
  return { markdown: lines.join('\n').trim() };
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
  const hasCookingActions =
    /\b(marinate|mix|blend|grind|heat|cook|simmer|steam|bake|fry|roast|stir|serve)\b/.test(
      normalized,
    );

  return (
    hasIngredientSection && (hasInstructionSection || (numberedStepCount >= 2 && hasCookingActions))
  );
}

export function getCookingNewChatPath(_pathname: string): string {
  return '/cook';
}

export function getCookingConversationPath(
  pathname: string,
  conversationId?: string | null,
): string {
  const id = conversationId || 'new';
  return id === 'new' ? '/cook' : `/cook/${id}`;
}
