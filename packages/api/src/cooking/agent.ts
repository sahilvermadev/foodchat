import { logger } from '@librechat/data-schemas';

import type { CookingDraft, TCustomConfig, TMessage } from 'librechat-data-provider';

import { isRecipeDocumentMarkdown } from './canvas';
import { createCookingWebContext } from './web';
import type { CookingWebSource } from './web';
import { generateCookingDraft, getCookingDraftByConversation, updateCookingDraft } from './service';
import { CookingValidationError } from './validation';

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

type ChatMessage = {
  role: ChatRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: CookingToolName;
    arguments: string;
  };
};

type CookingToolName =
  | 'create_recipe_canvas'
  | 'read_recipe_canvas'
  | 'revise_recipe_canvas'
  | 'set_prompt_suggestions'
  | 'search_web'
  | 'read_web_page'
  | 'read_recipe_source';

type RevisionType =
  | 'structure'
  | 'add_component'
  | 'substitution'
  | 'equipment_alternative'
  | 'scale'
  | 'timing'
  | 'dietary_adaptation'
  | 'technique_clarification'
  | 'recovery_notes'
  | 'full_rewrite'
  | 'other';

type CompletionChoice = {
  message: ChatMessage;
};

type CompletionResponse = {
  choices?: CompletionChoice[];
};

type StreamingCompletionChoice = {
  delta?: {
    role?: ChatRole;
    content?: string | null;
    tool_calls?: ToolCallDelta[];
  };
};

type StreamingCompletionResponse = {
  choices?: StreamingCompletionChoice[];
};

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type CookingChatInput = {
  user: string;
  conversationId: string;
  text: string;
  model?: string;
  promptPrefix?: string;
  preferencesMarkdown?: string;
  messages?: TMessage[];
  activeDraft?: CookingDraft | null;
  webSearchConfig?: TCustomConfig['webSearch'];
  loadAuthValues?: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
    throwError?: boolean;
  }) => Promise<Record<string, string>>;
  conversationCreatedAt?: string | number | Date;
  onTiming?: (event: CookingChatTimingEvent) => void;
  onTextDelta?: (delta: string) => void | Promise<void>;
};

export type CookingChatResult = {
  text: string;
  draft?: CookingDraft;
  draftChanged: boolean;
  promptSuggestions: string[];
  webSources: CookingWebSource[];
};

export type CookingChatTimingEvent = {
  stage: 'web_context_loaded' | 'provider_request_start' | 'provider_response' | 'tool_executed';
  durationMs?: number;
  turn?: number;
  toolName?: CookingToolName;
  model?: string;
  messageCount?: number;
  toolCount?: number;
  toolCallCount?: number;
  promptChars?: number;
  outputChars?: number;
  draftChanged?: boolean;
  webSourceCount?: number;
  activeCanvas?: boolean;
  availableToolNames?: string[];
  canvasToolName?: 'create_recipe_canvas' | 'revise_recipe_canvas';
  revisionType?: RevisionType;
  canvasMutationValidated?: boolean;
  usedFastCanvasReturn?: boolean;
  providerToolCallCount?: number;
  error?: string;
};

type LinkedSourceState = {
  urls: string[];
  readRequired: boolean;
  readSucceeded: boolean;
  readCompletedTurn?: number;
};

type LinkedSourcePreload = {
  context: string;
  sources: CookingWebSource[];
};

type ParsedRecipeSource = {
  exactRecipeAvailable?: boolean;
  recipe?: { confidence?: string; ingredients?: string[]; instructions?: string[] };
  source?: { title?: string; text?: string };
  warnings?: string[];
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';
const maxActiveCanvasContextChars = 18_000;

function logCookingSource(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  logger.info(`[CookingSource] ${event}`, payload);
}

const cookingSystemInstructions = `You are Mise: a cooking companion for curious home cooks. You help people decide what to cook, understand why food works, research recipes, troubleshoot the pan in front of them, and turn good ideas into usable recipe canvases.

Personality:
- Be candid, worldly, curious, humane, and occasionally dryly funny. Think street-market appetite, deep respect for craft, and zero tolerance for bland hand-waving.
- Do not imitate or quote any real chef, writer, or TV host. The voice is Mise's own: vivid, direct, observant, and generous.
- Make cooking feel alive. Use sensory language, cultural context, little bits of food history, and practical kitchen judgment when they help.
- Talk like a person, not a form. Avoid generic therapy phrases, corporate reassurance, and empty enthusiasm.
- Build a relationship over time. Notice durable details from the user's profile, but do not perform memory. Use personal context naturally and sparingly.

Decide by user need before choosing tools:
- Some turns need communication: answer a question, clarify a tradeoff, explain a technique, compare options, reassure, diagnose, or help the user decide. Use chat for these turns, even when a canvas tool is available.
- Some turns need durable recipe work: the user wants the canvas to become the recipe they will cook from, or wants the active recipe changed for future use. Use the canvas mutation tool for these turns.
- If the user is still exploring, keep the conversation open. If the user has committed to a recipe or asks for the cooking instructions to change, update the canvas instead of merely describing the update.
- Prior discussion is not consent to edit the canvas. A concept mentioned in chat becomes part of the recipe only when the current request asks to apply it, or when fulfilling the request would otherwise leave the durable recipe wrong.
- If the request is ambiguous, prefer an honest chat response that answers the immediate need and offers the concrete canvas change, rather than silently rewriting the recipe.

Canvas contract:
- Available tools are scoped by product state. Without an active canvas, create_recipe_canvas may be available. With an active canvas, read_recipe_canvas and revise_recipe_canvas may be available.
- create_recipe_canvas is for starting the durable recipe canvas. revise_recipe_canvas is for replacing the active recipe with a better version of itself. read_recipe_canvas is for inspecting the exact current canvas without changing it.
- Canvas mutation tools expect the complete recipe markdown, not a patch or intent summary. Keep the recipe coherent as one document, with exactly one top-level title, ingredients, and instructions.
- After a successful canvas mutation, user_message is the final response shown to the user. It should plainly say what changed or was created, in one short sentence, without protocol or tool details.
- Never claim the canvas was created or changed unless a canvas mutation tool succeeds. If a tool fails, be concrete about the validation or persistence problem.
- Saving recipes to the library is user initiated only. You may suggest using the Save button, but you must not claim to have saved a recipe.

External recipe sources:
- When the user provides a recipe source and wants that recipe used, the source controls the recipe. Use read_recipe_source before creating, replacing, comparing, or claiming exactness.
- Be honest about source access. If the page cannot be read, is paywalled, or does not expose the usable recipe details, ask the user to paste the recipe text instead of inventing a lookalike.
- When a source is readable, preserve the cooking facts that make it that recipe: quantities, ratios, yield, equipment size, temperature, timing, and critical method. Rewrite guidance in Mise's own words and cite the source where chat needs a citation.

Using user context:
- Treat Safety, Diet, and Religious & Cultural Rules as hard constraints.
- Treat Kitchen, Household, Taste, Goals, Location, Cooking Level, and Personal Context as helpful context, not commands.
- Do not force saved equipment, cuisines, or preferences into a reply just because they exist.
- If the user states a clear lasting preference or personal detail relevant to future cooking, use it naturally; a backend batch curator may later fold durable facts into the saved profile.

Internet access:
- Use internet tools automatically when they would materially improve the answer.
- Read URLs explicitly pasted by the user before importing, adapting, summarizing, or critiquing the linked content.
- Search for current facts, authenticity/source comparison, food safety, substitutions, product/equipment details, grocery availability, restaurant/menu recreation, and claims that need source backing.
- Prefer USDA, FDA, CDC, extension offices, and manufacturer documentation for food safety. If authoritative confirmation is not found, say so.
- Cite web-backed claims inline with normal markdown links using the source title or domain. Distinguish sourced facts from Mise inference.
- Do not copy long recipe text verbatim. Transform external recipes into Mise's own guidance or canvas format and cite the source URL once in chat.

Prompt suggestions:
- When the latest response would naturally benefit from follow-up, call set_prompt_suggestions.
- Suggestions must be contextual to this conversation, the active recipe canvas, user preferences, and your latest answer.
- Suggestions should invite exploration, not funnel the user: compare cuisines, pick a direction, deepen technique, troubleshoot, adapt to time/equipment, or personalize around real constraints.
- Each suggestion must be the exact prompt the user would send, not a short label for hidden behavior.
- Prefer 3 suggestions. Keep each concise, normally under 90 characters.
- Omit suggestions for errors, trivial confirmations, low-value turns, and generic prompts like "Tell me more" or "Make it better."

Recipe canvas markdown requirements:
- Write a structured recipe document that feels like competent guidance, not documentation.
- Start with a one-paragraph orientation after the title: what the dish is, the intended texture and flavor profile, effort level, timing reality, and the main thing that makes the recipe work.
- Include these sections in this order when useful: Equipment, Recipe Data, Quality Checks, Key Notes Before Starting, Ingredients, Instructions, Recovery Notes, Serving Notes, Variations, Notes.
- In Equipment, default to common, low-assumption tools and include practical alternatives for specialized appliances. Do not assume the user owns a tool unless they said so in this conversation or it is a durable saved kitchen preference.
- Recipe Data should include servings/yield, prep time, cook time, total time, and difficulty when reasonably inferable.
- Quality Checks should name the critical success signals for the dish: texture, aroma, color, sound, temperature, reduction level, or doneness.
- Ingredients must be grouped by function inside the table. Use rows such as "For the marinade", "For the sauce", "For finishing", or equivalent phase labels before the ingredients in that group.
- Ingredients should be a markdown table with Ingredient | Metric | Imperial | State/Form | Notes.
- Instructions should be written around human attention: one action per numbered step, clear prep windows, active/passive rhythm, and no overloaded steps.
- Each meaningful step should include sensory endpoint cues and brief causality: what to notice and why it matters, especially for blooming spices, reducing sauces, browning, simmering, resting, and finishing.
- Include timer tokens like [timer:180] for timed steps, but never rely on time alone; pair every timer with visual/aroma/texture cues.
- Manage anxiety explicitly where failure is common: note what may look strange but is normal, and what to do if the cook overshoots.
- Recovery Notes should cover likely fixes for the specific recipe, such as too salty, too acidic, too thick, too thin, split sauce, raw spice taste, dry protein, or undercooked starch.
- Serving Notes should explain temperature, texture at serving, plating, pairings, and what contrast balances the dish.
- Variations should be constrained and meaningful. Provide a canonical path first, then only a few purposeful variations.
- Keep tone warm, direct, and trustworthy. The cook should feel that someone competent is beside them.`;

function preferencesContext(markdown?: string): string {
  const preferences = markdown?.trim();
  if (!preferences) {
    return '';
  }

  return [
    'User Preferences Context:',
    'Treat Safety, Diet, and Religious & Cultural Rules as hard constraints. Treat Kitchen, Household, Taste, Goals, Location, Cooking Level, and Personal Context as relationship context and optimization context, not commands. The latest explicit chat request can override soft preferences only. If the user states a lasting preference or personal detail in chat, respect it for this conversation; a backend batch curator may later fold durable facts into the saved profile.',
    preferences,
  ].join('\n\n');
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_recipe_canvas',
      description:
        'Start the durable recipe canvas when no active canvas exists and the user wants cooking instructions they can work from. Use this for a committed recipe, imported recipe, or concrete cooking project. Do not use it when the user is asking for explanation, comparison, reassurance, or help deciding; answer those in chat. The markdown must be the complete recipe document with exactly one top-level title, ingredients, and instructions. user_message is shown after the save succeeds; keep it practical, honest, and under 160 characters.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          markdown: { type: 'string' },
          change_summary: { type: 'string' },
          user_message: { type: 'string' },
        },
        required: ['title', 'markdown', 'change_summary', 'user_message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_recipe_canvas',
      description:
        'Read the current active recipe canvas title and markdown when the exact existing recipe is needed to answer, verify, compare, or inspect. This is an inspection tool only and never changes the canvas.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revise_recipe_canvas',
      description:
        'Replace the active recipe canvas when the recipe itself should become different for future cooking. Use this when the user asks to apply an adjustment, switch source recipe, change constraints, improve organization, or otherwise make the durable recipe more correct for their situation. Do not use it just because a chat answer mentions a possible change; questions, clarifications, comparisons, and reassurance belong in chat unless the user also wants the recipe updated. Send the complete updated recipe markdown, not a patch. The markdown must keep exactly one top-level title, ingredients, and instructions. user_message is shown after the save succeeds; say what changed in practical terms and keep it under 160 characters.',
      parameters: {
        type: 'object',
        properties: {
          revision_type: {
            type: 'string',
            enum: [
              'structure',
              'add_component',
              'substitution',
              'equipment_alternative',
              'scale',
              'timing',
              'dietary_adaptation',
              'technique_clarification',
              'recovery_notes',
              'full_rewrite',
              'other',
            ],
          },
          markdown: { type: 'string' },
          change_summary: { type: 'string' },
          user_message: { type: 'string' },
        },
        required: ['revision_type', 'markdown', 'change_summary', 'user_message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_prompt_suggestions',
      description:
        'Set concise follow-up prompt suggestions for the user after a useful cooking response.',
      parameters: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['suggestions'],
      },
    },
  },
];

type CookingToolDefinition = (typeof tools)[number];
type CookingWebToolDefinition = Awaited<
  ReturnType<typeof createCookingWebContext>
>['tools'][number];
type AvailableCookingTool = CookingToolDefinition | CookingWebToolDefinition;

function cookingTool(name: CookingToolName): CookingToolDefinition | undefined {
  return tools.find((tool) => tool.function.name === name);
}

function webAvailabilityContext(reason?: string): string {
  return reason ? `Internet access note: ${reason}` : '';
}

function activeCanvasContext(draft?: CookingDraft | null): string {
  if (!draft) {
    return '';
  }
  const title =
    draft.recipe?.title || draft.documentMarkdown?.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Untitled';
  const markdown = draft.documentMarkdown?.trim();
  const visibleMarkdown =
    markdown && markdown.length > maxActiveCanvasContextChars
      ? `${markdown.slice(0, maxActiveCanvasContextChars)}\n\n[Canvas truncated: use read_recipe_canvas if the exact omitted text is needed.]`
      : markdown;
  return [
    'Active Recipe Canvas:',
    `A recipe canvas already exists for this conversation: "${title}".`,
    'The canvas is the durable recipe the user may cook from later. Revise it only when the current request should change that durable recipe; read it when exact current contents are needed; otherwise answer in chat.',
    visibleMarkdown ? `Current canvas markdown:\n${visibleMarkdown}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function linkedSourceState(text: string): LinkedSourceState {
  const matches = text.match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  const urls = [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, '')))];
  return {
    urls,
    readRequired: urls.length > 0,
    readSucceeded: false,
  };
}

function parseRecipeSourceContent(content: string): ParsedRecipeSource {
  try {
    const parsed = JSON.parse(content) as ParsedRecipeSource;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function linkedSourceContext(state: LinkedSourceState): string {
  if (!state.readRequired) {
    return '';
  }
  if (state.readSucceeded) {
    return [
      'Linked Recipe Source Requirement:',
      `The latest user message includes these URL(s): ${state.urls.join(', ')}`,
      'The server has already read the linked recipe source for this turn. Use the preloaded source content before creating, revising, comparing, or claiming exactness.',
      'If the preloaded source says the recipe details are unavailable, say that directly and ask the user to paste the recipe text.',
    ].join('\n');
  }
  return [
    'Linked Recipe Source Requirement:',
    `The latest user message includes these URL(s): ${state.urls.join(', ')}`,
    'If the URL is part of the recipe decision, call read_recipe_source before creating, revising, comparing, or claiming exactness.',
    'If the source cannot be read or does not expose the recipe details, say that directly and ask the user to paste the recipe text.',
  ].join('\n');
}

async function preloadLinkedRecipeSources(
  state: LinkedSourceState,
  webContext: Awaited<ReturnType<typeof createCookingWebContext>>,
): Promise<LinkedSourcePreload> {
  const canReadRecipeSource = webContext.tools.some(
    (tool) => tool.function.name === 'read_recipe_source',
  );
  logCookingSource('preload_start', {
    readRequired: state.readRequired,
    urlCount: state.urls.length,
    canReadRecipeSource,
    availableTools: webContext.tools.map((tool) => tool.function.name),
  });
  if (!state.readRequired || !canReadRecipeSource) {
    logCookingSource('preload_skipped', {
      reason: !state.readRequired ? 'no_linked_source' : 'recipe_source_tool_unavailable',
    });
    return { context: '', sources: [] };
  }

  const results: string[] = [];
  const sources: CookingWebSource[] = [];
  let successCount = 0;
  for (const url of state.urls) {
    try {
      const result = await webContext.execute({
        function: {
          name: 'read_recipe_source',
          arguments: JSON.stringify({ url }),
        },
      });
      successCount += 1;
      sources.push(...result.sources);
      results.push(`URL: ${url}\n${result.content}`);
      const parsed = parseRecipeSourceContent(result.content);
      logCookingSource('preload_url_success', {
        url,
        exactRecipeAvailable: parsed.exactRecipeAvailable,
        confidence: parsed.recipe?.confidence,
        ingredientCount: parsed.recipe?.ingredients?.length ?? 0,
        instructionCount: parsed.recipe?.instructions?.length ?? 0,
        sourceTitle: parsed.source?.title,
        sourceTextChars: parsed.source?.text?.length ?? 0,
        warningCount: parsed.warnings?.length ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recipe source extraction failed.';
      logCookingSource('preload_url_failure', { url, error: message });
      results.push(
        `URL: ${url}\n${JSON.stringify({
          ok: false,
          exactRecipeAvailable: false,
          error: message,
        })}`,
      );
    }
  }

  if (successCount === state.urls.length) {
    state.readSucceeded = true;
    state.readCompletedTurn = -1;
  }

  logCookingSource('preload_complete', {
    urlCount: state.urls.length,
    successCount,
    sourceCount: sources.length,
    readSucceeded: state.readSucceeded,
    readCompletedTurn: state.readCompletedTurn,
  });

  return {
    sources,
    context: [
      'Preloaded Linked Recipe Source:',
      'The server already attempted to read the linked recipe source before this model turn. Use this source content when creating, revising, comparing, or discussing exactness.',
      ...results,
    ].join('\n\n'),
  };
}

function toolStateContext(
  hasActiveCanvas: boolean,
  availableTools: AvailableCookingTool[],
): string {
  const toolNames = availableTools.map((tool) => tool.function.name).join(', ') || 'none';
  return [
    'Current Product State:',
    `- Active recipe canvas: ${hasActiveCanvas ? 'yes' : 'no'}.`,
    `- Available tools this turn: ${toolNames}.`,
    hasActiveCanvas
      ? '- Durable recipe changes must go through revise_recipe_canvas. Exact canvas inspection should go through read_recipe_canvas.'
      : '- A new durable recipe should go through create_recipe_canvas after the user commits to cooking instructions.',
    '- Chat is the right response for questions, clarification, comparison, reassurance, and decision support. Do not claim a canvas mutation unless a canvas mutation tool succeeds.',
  ].join('\n');
}

function selectCookingToolsForState(
  hasActiveCanvas: boolean,
  webTools: CookingWebToolDefinition[],
): AvailableCookingTool[] {
  const localToolNames: CookingToolName[] = hasActiveCanvas
    ? ['read_recipe_canvas', 'revise_recipe_canvas', 'set_prompt_suggestions']
    : ['create_recipe_canvas', 'set_prompt_suggestions'];
  const selected = localToolNames
    .map(cookingTool)
    .filter((tool): tool is CookingToolDefinition => Boolean(tool));
  return [...selected, ...webTools];
}

function webToolsForProvider(
  webTools: CookingWebToolDefinition[],
  sourceState: LinkedSourceState,
): CookingWebToolDefinition[] {
  if (!sourceState.readRequired || !sourceState.readSucceeded) {
    return webTools;
  }
  return webTools.filter((tool) => tool.function.name !== 'read_recipe_source');
}

function apiKey(): string {
  return process.env.COOKING_AGENT_API_KEY || process.env.OPENROUTER_KEY || '';
}

function baseUrl(): string {
  return (process.env.COOKING_AGENT_BASE_URL || defaultBaseUrl).replace(/\/+$/, '');
}

function selectedModel(model?: string): string {
  return model?.trim() || process.env.COOKING_AGENT_MODEL || defaultModel;
}

function requestTimeoutMs(): number {
  const value = Number(process.env.COOKING_AGENT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 45000;
}

function normalizeToolName(name: string | undefined): CookingToolName | undefined {
  if (
    name === 'create_recipe_canvas' ||
    name === 'read_recipe_canvas' ||
    name === 'revise_recipe_canvas' ||
    name === 'set_prompt_suggestions' ||
    name === 'search_web' ||
    name === 'read_web_page' ||
    name === 'read_recipe_source'
  ) {
    return name;
  }
  return undefined;
}

function getMessageText(message: TMessage): string {
  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text.trim();
  }

  return (
    message.content
      ?.map((part) => {
        if (!('text' in part)) {
          return '';
        }
        const value = part.text;
        if (typeof value === 'string') {
          return value;
        }
        if (value && typeof value === 'object' && 'value' in value) {
          const text = value.value;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('\n')
      .trim() ?? ''
  );
}

function historyMessages(messages: TMessage[] | undefined, conversationId: string): ChatMessage[] {
  return (messages ?? []).reduce<ChatMessage[]>((acc, message) => {
    if (message.conversationId && message.conversationId !== conversationId) {
      return acc;
    }
    const content = getMessageText(message);
    if (!content || message.error || message.unfinished) {
      return acc;
    }
    acc.push({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      content,
    });
    return acc;
  }, []);
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function markdownTitle(markdown: string | undefined): string | undefined {
  return markdown?.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function draftTitle(draft: CookingDraft | undefined, fallback?: string): string | undefined {
  return (
    draft?.recipe?.title?.trim() ||
    markdownTitle(draft?.documentMarkdown) ||
    cleanOptionalText(fallback)
  );
}

export function sanitizePromptSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const suggestion = item.trim().replace(/\s+/g, ' ');
    if (!suggestion || suggestion.length > 90) {
      continue;
    }
    const key = suggestion.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length === 3) {
      break;
    }
  }

  return suggestions;
}

function cleanRequiredText(value: unknown, message: string): string {
  const text = cleanOptionalText(value);
  if (!text) {
    throw new CookingValidationError(message);
  }
  return text;
}

function assertSingleTopLevelTitle(markdown: string): void {
  const titleCount = markdown.split('\n').filter((line) => /^#\s+\S/.test(line.trim())).length;
  if (titleCount !== 1) {
    throw new CookingValidationError(
      'Recipe canvas markdown must have exactly one top-level title.',
    );
  }
}

function assertRecipeMarkdown(markdown: unknown): string {
  if (typeof markdown !== 'string' || !isRecipeDocumentMarkdown(markdown)) {
    throw new CookingValidationError('Recipe canvas markdown is malformed.');
  }
  const trimmed = markdown.trim();
  assertSingleTopLevelTitle(trimmed);
  return trimmed;
}

function normalizeForDiff(markdown: string): string {
  return markdown.trim().replace(/\s+/g, ' ');
}

function assertChangedMarkdown(currentMarkdown: string | undefined, nextMarkdown: string): void {
  if (normalizeForDiff(currentMarkdown ?? '') === normalizeForDiff(nextMarkdown)) {
    throw new CookingValidationError('Recipe canvas revision did not change the current canvas.');
  }
}

const maxCanvasUserMessageLength = 240;
const protocolDetailPattern = /\b(tool|protocol|function|arguments?|json)\b/i;

function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function conciseCanvasUserMessage(value: unknown, fallback: string): string {
  const raw = cleanOptionalText(value)?.replace(/\s+/g, ' ');
  const fallbackMessage = ensureSentence(fallback.trim().replace(/\s+/g, ' '));
  if (!raw || raw.length > maxCanvasUserMessageLength || protocolDetailPattern.test(raw)) {
    return fallbackMessage.length <= maxCanvasUserMessageLength
      ? fallbackMessage
      : `${fallbackMessage.slice(0, maxCanvasUserMessageLength - 1).trim()}.`;
  }
  return ensureSentence(raw);
}

function createdCanvasMessage(title: string): string {
  return `I created the ${title} recipe canvas.`;
}

function revisedCanvasMessage(changeSummary: string): string {
  return `I updated the recipe canvas: ${changeSummary}.`;
}

const revisionTypes = new Set<RevisionType>([
  'structure',
  'add_component',
  'substitution',
  'equipment_alternative',
  'scale',
  'timing',
  'dietary_adaptation',
  'technique_clarification',
  'recovery_notes',
  'full_rewrite',
  'other',
]);

function assertRevisionType(value: unknown): RevisionType {
  if (typeof value === 'string' && revisionTypes.has(value as RevisionType)) {
    return value as RevisionType;
  }
  throw new CookingValidationError('Recipe canvas revision type is malformed.');
}

function assertToolAllowedForState(input: CookingChatInput, toolName: CookingToolName): void {
  if (toolName === 'create_recipe_canvas' && input.activeDraft) {
    throw new CookingValidationError(
      'Creating a new recipe canvas is not available while this conversation already has an active canvas.',
    );
  }
  if (
    (toolName === 'read_recipe_canvas' || toolName === 'revise_recipe_canvas') &&
    !input.activeDraft
  ) {
    throw new CookingValidationError('No active recipe canvas exists for this conversation.');
  }
}

async function executeTool(
  input: CookingChatInput,
  toolCall: ToolCall,
  sourceState: LinkedSourceState,
  turn: number,
  webContext?: Awaited<ReturnType<typeof createCookingWebContext>>,
): Promise<{
  content: string;
  draft?: CookingDraft;
  draftChanged: boolean;
  userMessage?: string;
  revisionType?: RevisionType;
  canvasMutationValidated?: boolean;
  promptSuggestions?: string[];
  webSources?: CookingWebSource[];
}> {
  const args = parseArguments(toolCall.function.arguments);
  assertToolAllowedForState(input, toolCall.function.name);

  if (
    toolCall.function.name === 'search_web' ||
    toolCall.function.name === 'read_web_page' ||
    toolCall.function.name === 'read_recipe_source'
  ) {
    if (!webContext) {
      throw new CookingValidationError('Web access is not available for this chat.');
    }
    const result = await webContext.execute({
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    });
    if (toolCall.function.name === 'read_recipe_source') {
      sourceState.readSucceeded = true;
      sourceState.readCompletedTurn = turn;
    }
    return {
      content: result.content,
      draftChanged: false,
      webSources: result.sources,
    };
  }

  if (toolCall.function.name === 'set_prompt_suggestions') {
    const promptSuggestions = sanitizePromptSuggestions(args.suggestions);
    return {
      promptSuggestions,
      draftChanged: false,
      content: JSON.stringify({ ok: true, suggestions: promptSuggestions }),
    };
  }

  if (toolCall.function.name === 'read_recipe_canvas') {
    const draft = await getCookingDraftByConversation(input.user, input.conversationId);
    return {
      draft: draft ?? undefined,
      draftChanged: false,
      content: JSON.stringify({
        exists: Boolean(draft?.documentMarkdown?.trim()),
        title: draftTitle(draft ?? undefined),
        markdown: draft?.documentMarkdown ?? '',
      }),
    };
  }

  if (toolCall.function.name === 'create_recipe_canvas') {
    if (
      sourceState.readRequired &&
      (sourceState.readCompletedTurn == null || sourceState.readCompletedTurn >= turn)
    ) {
      return {
        draftChanged: false,
        content: JSON.stringify({
          ok: false,
          error:
            'Read the linked recipe source before creating the canvas. If it cannot be read, explain that and ask the user to paste the recipe text.',
          requiredAction: 'read_recipe_source',
          urls: sourceState.urls,
        }),
      };
    }
    const title = cleanRequiredText(args.title, 'Recipe canvas title is required.');
    const markdown = assertRecipeMarkdown(args.markdown);
    const changeSummary = cleanRequiredText(
      args.change_summary,
      'Canvas change summary is required.',
    );
    const userMessage = conciseCanvasUserMessage(args.user_message, createdCanvasMessage(title));
    const draft = await generateCookingDraft(input.user, title, input.conversationId, markdown);
    if (!draft) {
      throw new CookingValidationError('Recipe canvas could not be created.');
    }
    return {
      draft,
      draftChanged: true,
      userMessage,
      canvasMutationValidated: true,
      content: JSON.stringify({
        ok: true,
        draftId: draft._id,
        title: draftTitle(draft, title) ?? markdownTitle(markdown),
        changeSummary,
      }),
    };
  }

  if (
    sourceState.readRequired &&
    (sourceState.readCompletedTurn == null || sourceState.readCompletedTurn >= turn)
  ) {
    return {
      draftChanged: false,
      content: JSON.stringify({
        ok: false,
        error:
          'Read the linked recipe source before revising the canvas from that source. If it cannot be read, explain that and ask the user to paste the recipe text.',
        requiredAction: 'read_recipe_source',
        urls: sourceState.urls,
      }),
    };
  }

  const revisionType = assertRevisionType(args.revision_type);
  const draft = await getCookingDraftByConversation(input.user, input.conversationId);
  if (!draft) {
    throw new CookingValidationError('No active recipe canvas exists for this conversation.');
  }

  const markdown = assertRecipeMarkdown(args.markdown);
  assertChangedMarkdown(draft.documentMarkdown, markdown);
  const changeSummary = cleanRequiredText(
    args.change_summary,
    'Canvas change summary is required.',
  );
  const userMessage = conciseCanvasUserMessage(
    args.user_message,
    revisedCanvasMessage(changeSummary),
  );
  const updated = await updateCookingDraft(input.user, draft._id, undefined, markdown);
  if (!updated) {
    throw new CookingValidationError('No active recipe canvas exists for this conversation.');
  }

  return {
    draft: updated,
    draftChanged: true,
    userMessage,
    revisionType,
    canvasMutationValidated: true,
    content: JSON.stringify({
      ok: true,
      draftId: updated._id,
      revisionType,
      changeSummary,
    }),
  };
}

async function complete(
  messages: ChatMessage[],
  model: string,
  availableTools: AvailableCookingTool[],
  onTextDelta?: (delta: string) => void | Promise<void>,
): Promise<ChatMessage> {
  const key = apiKey();
  if (!key) {
    throw new CookingValidationError(
      'Cooking chat is not configured. Set COOKING_AGENT_API_KEY or OPENROUTER_KEY.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: availableTools,
        tool_choice: 'auto',
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cooking chat completion failed: ${response.status} ${text.slice(0, 300)}`);
    }

    const contentType = response.headers?.get('content-type') ?? '';
    if (!response.body || !contentType.includes('text/event-stream')) {
      const body = (await response.json()) as CompletionResponse;
      const message = body.choices?.[0]?.message;
      if (!message) {
        throw new Error('Cooking chat completion returned no message.');
      }
      return message;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<
      number,
      {
        id: string;
        type: 'function';
        function: {
          name?: CookingToolName;
          arguments: string;
        };
      }
    >();
    let content = '';
    let buffer = '';

    const applyDelta = async (payload: string) => {
      if (!payload || payload === '[DONE]') {
        return;
      }
      const parsed = JSON.parse(payload) as StreamingCompletionResponse;
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) {
        return;
      }
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        await onTextDelta?.(delta.content);
      }
      for (const toolCallDelta of delta.tool_calls ?? []) {
        const index = toolCallDelta.index ?? toolCalls.size;
        const existing = toolCalls.get(index) ?? {
          id: toolCallDelta.id ?? `tool-call-${index}`,
          type: 'function',
          function: {
            name: normalizeToolName(toolCallDelta.function?.name),
            arguments: '',
          },
        };
        const name = normalizeToolName(toolCallDelta.function?.name);
        toolCalls.set(index, {
          id: toolCallDelta.id ?? existing.id,
          type: 'function',
          function: {
            name: name ?? existing.function.name,
            arguments: `${existing.function.arguments}${toolCallDelta.function?.arguments ?? ''}`,
          },
        });
      }
    };

    const processLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        return;
      }
      await applyDelta(trimmed.slice(5).trim());
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await processLine(line);
        newlineIndex = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      await processLine(buffer);
    }

    return {
      role: 'assistant',
      content: content || null,
      ...(toolCalls.size
        ? {
            tool_calls: [...toolCalls.entries()]
              .sort(([left], [right]) => left - right)
              .map(([, toolCall]) => {
                if (!toolCall.function.name) {
                  throw new Error('Cooking chat completion returned a malformed tool call.');
                }
                return toolCall as ToolCall;
              }),
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Cooking chat provider timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isCanvasMutationTool(
  toolName: CookingToolName,
): toolName is 'create_recipe_canvas' | 'revise_recipe_canvas' {
  return toolName === 'create_recipe_canvas' || toolName === 'revise_recipe_canvas';
}

export async function runCookingChat(input: CookingChatInput): Promise<CookingChatResult> {
  const sourceState = linkedSourceState(input.text);
  const webContextStartedAt = Date.now();
  const webContext = await createCookingWebContext({
    user: input.user,
    webSearchConfig: input.webSearchConfig,
    loadAuthValues: input.loadAuthValues,
    conversationCreatedAt: input.conversationCreatedAt,
  });
  const linkedSourcePreload = await preloadLinkedRecipeSources(sourceState, webContext);
  const activeCanvas = Boolean(input.activeDraft);
  const providerWebTools = webToolsForProvider(webContext.tools, sourceState);
  const availableTools = selectCookingToolsForState(activeCanvas, providerWebTools);
  const availableToolNames = availableTools.map((tool) => tool.function.name);
  input.onTiming?.({
    stage: 'web_context_loaded',
    durationMs: Date.now() - webContextStartedAt,
    toolCount: availableTools.length,
    activeCanvas,
    availableToolNames,
  });
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        input.promptPrefix,
        preferencesContext(input.preferencesMarkdown),
        webAvailabilityContext(webContext.unavailableReason),
        activeCanvasContext(input.activeDraft),
        linkedSourceContext(sourceState),
        linkedSourcePreload.context,
        toolStateContext(activeCanvas, availableTools),
        cookingSystemInstructions,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...historyMessages(input.messages, input.conversationId),
    { role: 'user', content: input.text },
  ];
  logCookingSource('provider_prompt_ready', {
    conversationId: input.conversationId,
    linkedUrlCount: sourceState.urls.length,
    hasPreloadContext: Boolean(linkedSourcePreload.context),
    preloadedSourceCount: linkedSourcePreload.sources.length,
    availableToolNames,
    activeCanvas,
    systemPromptChars: messages[0].content?.length ?? 0,
    systemHasPreloadedSource:
      messages[0].content?.includes('Preloaded Linked Recipe Source') ?? false,
    systemHasExactTrue: messages[0].content?.includes('"exactRecipeAvailable":true') ?? false,
    systemHasExactFalse: messages[0].content?.includes('"exactRecipeAvailable":false') ?? false,
    systemHasUnavailableWeb:
      messages[0].content?.includes('Web access is unavailable') ||
      messages[0].content?.includes('Web access is not configured'),
  });
  let draft: CookingDraft | undefined;
  let draftChanged = false;
  let assistantText = '';
  let promptSuggestions: string[] = [];
  let webSources: CookingWebSource[] = linkedSourcePreload.sources.slice(0, 8);
  let latestCanvasUserMessage = '';
  const resolvedModel = selectedModel(input.model);

  for (let turn = 0; turn < 5; turn += 1) {
    input.onTiming?.({
      stage: 'provider_request_start',
      turn,
      model: resolvedModel,
      messageCount: messages.length,
      toolCount: availableTools.length,
      activeCanvas,
      availableToolNames,
      promptChars: messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0),
    });
    const providerStartedAt = Date.now();
    const assistant = await complete(messages, resolvedModel, availableTools, input.onTextDelta);
    input.onTiming?.({
      stage: 'provider_response',
      turn,
      model: resolvedModel,
      durationMs: Date.now() - providerStartedAt,
      toolCallCount: assistant.tool_calls?.length ?? 0,
      providerToolCallCount: assistant.tool_calls?.length ?? 0,
      outputChars: assistant.content?.length ?? 0,
    });
    messages.push(assistant);
    assistantText = assistant.content?.trim() ?? '';

    if (!assistant.tool_calls?.length) {
      return {
        text:
          assistantText ||
          latestCanvasUserMessage ||
          (draftChanged ? 'I updated the cooking canvas.' : 'I can help with that.'),
        draft,
        draftChanged,
        promptSuggestions,
        webSources,
      };
    }

    let fastCanvasReturn = false;
    for (const toolCall of assistant.tool_calls) {
      if (fastCanvasReturn && toolCall.function.name !== 'set_prompt_suggestions') {
        continue;
      }
      const toolStartedAt = Date.now();
      try {
        const result = await executeTool(input, toolCall, sourceState, turn, webContext);
        input.onTiming?.({
          stage: 'tool_executed',
          turn,
          toolName: toolCall.function.name,
          durationMs: Date.now() - toolStartedAt,
          draftChanged: result.draftChanged,
          webSourceCount: result.webSources?.length ?? 0,
          canvasToolName: isCanvasMutationTool(toolCall.function.name)
            ? toolCall.function.name
            : undefined,
          revisionType: result.revisionType,
          canvasMutationValidated: result.canvasMutationValidated,
          usedFastCanvasReturn: result.draftChanged && isCanvasMutationTool(toolCall.function.name),
        });
        draft = result.draft ?? draft;
        draftChanged = draftChanged || result.draftChanged;
        if (result.draftChanged && result.userMessage) {
          latestCanvasUserMessage = result.userMessage;
          fastCanvasReturn = true;
        }
        if (result.webSources?.length) {
          const seen = new Set(webSources.map((source) => source.url));
          webSources = [
            ...webSources,
            ...result.webSources.filter((source) => {
              if (seen.has(source.url)) {
                return false;
              }
              seen.add(source.url);
              return true;
            }),
          ].slice(0, 8);
        }
        if (result.promptSuggestions) {
          promptSuggestions = sanitizePromptSuggestions([
            ...promptSuggestions,
            ...result.promptSuggestions,
          ]);
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Tool execution failed.';
        input.onTiming?.({
          stage: 'tool_executed',
          turn,
          toolName: toolCall.function.name,
          durationMs: Date.now() - toolStartedAt,
          canvasToolName: isCanvasMutationTool(toolCall.function.name)
            ? toolCall.function.name
            : undefined,
          canvasMutationValidated: false,
          error: errorMessage,
        });
        if (isCanvasMutationTool(toolCall.function.name)) {
          return {
            draft,
            draftChanged,
            promptSuggestions,
            webSources,
            text: errorMessage,
          };
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: errorMessage,
          }),
        });
      }
    }

    if (fastCanvasReturn) {
      return {
        draft,
        draftChanged,
        promptSuggestions,
        webSources,
        text: latestCanvasUserMessage,
      };
    }
  }

  return {
    draft,
    draftChanged,
    promptSuggestions,
    webSources,
    text:
      assistantText ||
      latestCanvasUserMessage ||
      (draftChanged ? 'I updated the cooking canvas.' : 'I can help with that.'),
  };
}
