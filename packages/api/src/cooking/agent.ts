import { logger } from '@librechat/data-schemas';

import type {
  CookingDocumentType,
  CookingDraft,
  TCustomConfig,
  TMessage,
} from 'librechat-data-provider';

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
  | 'create_cooking_document'
  | 'read_cooking_document'
  | 'revise_cooking_document'
  | 'set_prompt_suggestions'
  | 'request_external_research'
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

type ToolChoice =
  | 'auto'
  | {
      type: 'function';
      function: { name: 'set_prompt_suggestions' };
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
  documents?: CookingDraft[];
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
  canvasToolName?: 'create_cooking_document' | 'revise_cooking_document';
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
const defaultFallbackModel = 'deepseek/deepseek-v4-pro';
const maxActiveCanvasContextChars = 18_000;
const textPromptSuggestionCallPattern =
  /(?:```(?:\w+)?\s*)?set_prompt_suggestions\s*\(\s*suggestions\s*=\s*(\[[\s\S]*?\])\s*\)\s*;?\s*(?:```)?/gi;
const textPromptSuggestionMarker = 'set_prompt_suggestions';
const streamedTextTailLength = textPromptSuggestionMarker.length + 24;

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
- Some turns need durable document work: the user wants a recipe, guide, or preparation plan they will use later, or wants the selected document changed. Use a document mutation tool for these turns.
- If the user is still exploring, keep the conversation open. If the user has committed to a recipe or asks for the cooking instructions to change, update the canvas instead of merely describing the update.
- Prior discussion is not consent to edit the canvas. A concept mentioned in chat becomes part of the recipe only when the current request asks to apply it, or when fulfilling the request would otherwise leave the durable recipe wrong.
- If the request is ambiguous, prefer an honest chat response that answers the immediate need and offers the concrete canvas change, rather than silently rewriting the recipe.

Cooking document contract:
- A conversation can contain multiple durable cooking documents, with one selected document open in the canvas.
- create_cooking_document creates and selects a separate document. Use it for a distinct deliverable such as a starter guide, loaf recipe, discard recipe, shopping/prep plan, or a variant the user explicitly wants preserved.
- revise_cooking_document replaces only the selected document. Use it for substitutions, scaling, added notes, equipment alternatives, timing adjustments, dietary adaptations, or restructuring of that same deliverable.
- read_cooking_document inspects the exact selected document without changing it.
- For an ambiguous request to make a version, such as "make this spicier," ask whether to update the selected document or keep both versions before mutating.
- Document mutation tools expect complete markdown, not a patch or intent summary. Keep each document coherent, with exactly one top-level title, ingredients/materials, and chronological instructions/method.
- A multi-day preparation or cultivation project may use a canvas, but it must still be a complete usable document: list its materials in Ingredients and put the chronological actions in Instructions or Method.
- After a successful canvas mutation, user_message is the final response shown to the user. It should plainly say what changed or was created, in one short sentence, without protocol or tool details.
- Never claim the canvas was created or changed unless a canvas mutation tool succeeds. If a tool call fails validation, use the feedback to correct the document before responding to the user.
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
- Do not browse for routine cooking conversation, ordinary recipe requests, broad dish ideas, or technique guidance when established culinary knowledge is sufficient to answer well. A dish name like "blueberry cheesecake" is a normal cooking request, not a web-search request.
- Use internet tools only when the answer materially depends on external evidence: user-requested research or verification, supplied URLs, current availability or product details, authenticity/source comparison, restaurant or menu recreation, and food safety.
- If web tools are not currently available but the request genuinely needs external evidence, call request_external_research with a specific reason. After access is unlocked, use the narrowest web tool needed.
- Read URLs explicitly pasted by the user before importing, adapting, summarizing, or critiquing the linked content.
- Search only for current facts, authenticity/source comparison, food safety, product/equipment details, grocery availability, restaurant/menu recreation, and claims that need source backing. Do not search merely for recipe inspiration.
- Prefer one to three directly relevant sources when external evidence is needed. Use a broader source set only when the user explicitly asks for research depth, comparison, verification, or multiple perspectives.
- Prefer USDA, FDA, CDC, extension offices, and manufacturer documentation for food safety. If authoritative confirmation is not found, say so.
- When web research is used, sources are supporting evidence, not the shape of the answer. First give the user useful cooking judgment in Mise's own voice; cite only the claims that depend on those sources.
- Results from a web tool are working evidence, not a final answer. After using them, answer the user's request substantively; never return only a source list, bibliography, attribution line, or thin one-sentence summary.
- Do not copy long recipe text verbatim. Transform external recipes into Mise's own guidance or canvas format and cite the source URL once in chat.

Conversation flow:
- When an exploratory reply presents useful next steps or requires a choice, finish the user-facing answer with a clear, natural question.
- The product enriches completed replies with optional follow-up controls separately. Do not output tool-like UI instructions or protocol syntax in chat prose.

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
    'Treat Safety, Diet, and Religious & Cultural Rules as hard constraints. Treat Kitchen, Household, Specialty Ingredients, Taste, Goals, Location, Cooking Level, and Personal Context as relationship context and optimization context, not commands. Specialty Ingredients are usually available extras; consider them when they can make a recipe more interesting, but do not force them into every dish. The latest explicit chat request can override soft preferences only. If the user states a lasting preference or personal detail in chat, respect it for this conversation; a backend batch curator may later fold durable facts into the saved profile.',
    preferences,
  ].join('\n\n');
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_cooking_document',
      description:
        'Create and select a new durable cooking document. Use it for a distinct recipe, guide, prep plan, imported recipe, or explicitly preserved variant, including when another document already exists. Do not use it for a small change to the selected document. The markdown must be one complete usable document with exactly one top-level title, an Ingredients section, and an Instructions or Method section.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          document_type: { type: 'string', enum: ['recipe', 'guide', 'prep_plan'] },
          markdown: { type: 'string' },
          change_summary: { type: 'string' },
          user_message: { type: 'string' },
        },
        required: ['title', 'document_type', 'markdown', 'change_summary', 'user_message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_cooking_document',
      description:
        'Read the selected cooking document title and markdown when exact contents are needed. This is an inspection tool only and never changes the canvas.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revise_cooking_document',
      description:
        'Replace only the selected cooking document when that same deliverable should change for future cooking. Use for substitutions, scaling, notes, equipment alternatives, timing adjustments, adaptations, or restructuring. If the user may want both versions, ask before mutation. Send complete updated markdown, not a patch.',
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
  {
    type: 'function',
    function: {
      name: 'request_external_research',
      description:
        'Ask to unlock web research tools for this turn when the user request genuinely depends on external evidence. Use this instead of guessing from memory for source comparison, verification, current facts, products, restaurants, safety, or linked/source-driven work. Do not use it for ordinary recipe inspiration or routine cooking advice.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description:
              'Concrete reason external evidence is needed for the user request, not a generic desire for sources.',
          },
          research_type: {
            type: 'string',
            enum: [
              'verification',
              'current_fact',
              'food_safety',
              'product_or_equipment',
              'restaurant_or_menu',
              'authenticity_or_source_comparison',
              'linked_source',
              'other',
            ],
          },
          likely_query: {
            type: 'string',
            description: 'Optional focused search query you expect to run after tools unlock.',
          },
        },
        required: ['reason', 'research_type'],
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
      ? `${markdown.slice(0, maxActiveCanvasContextChars)}\n\n[Canvas truncated: use read_cooking_document if the exact omitted text is needed.]`
      : markdown;
  return [
    'Selected Cooking Document:',
    `The selected ${draft.documentType} document is "${title}".`,
    'Revise this document only when the request changes this deliverable; create a new document for a distinct deliverable; otherwise answer in chat.',
    visibleMarkdown ? `Selected document markdown:\n${visibleMarkdown}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function documentsContext(
  documents: CookingDraft[] | undefined,
  selected?: CookingDraft | null,
): string {
  if (!documents?.length) {
    return 'Conversation Cooking Documents:\n- None yet.';
  }
  return [
    'Conversation Cooking Documents:',
    ...documents.map((document) => {
      const title = draftTitle(document) ?? 'Untitled';
      const marker = document._id === selected?._id ? ' [selected]' : '';
      return `- ${document._id}: ${title} (${document.documentType})${marker}`;
    }),
  ].join('\n');
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
    `- Selected cooking document: ${hasActiveCanvas ? 'yes' : 'no'}.`,
    `- Available tools this turn: ${toolNames}.`,
    hasActiveCanvas
      ? '- Changes to the selected document go through revise_cooking_document; distinct deliverables go through create_cooking_document; exact inspection goes through read_cooking_document.'
      : '- A new durable cooking document should go through create_cooking_document after the user commits to usable instructions.',
    '- Chat is the right response for questions, clarification, comparison, reassurance, and decision support. Do not claim a canvas mutation unless a canvas mutation tool succeeds.',
  ].join('\n');
}

function selectCookingToolsForState(
  hasActiveCanvas: boolean,
  webTools: CookingWebToolDefinition[],
  options: { allowResearchRequest?: boolean } = {},
): AvailableCookingTool[] {
  const localToolNames: CookingToolName[] = hasActiveCanvas
    ? ['create_cooking_document', 'read_cooking_document', 'revise_cooking_document']
    : ['create_cooking_document'];
  const selected = localToolNames
    .map(cookingTool)
    .filter((tool): tool is CookingToolDefinition => Boolean(tool));
  if (options.allowResearchRequest) {
    const researchRequestTool = cookingTool('request_external_research');
    if (researchRequestTool) {
      selected.push(researchRequestTool);
    }
  }
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

type AvailableToolState = {
  availableTools: AvailableCookingTool[];
  availableToolNames: CookingToolName[];
  availableToolNameSet: Set<CookingToolName>;
};

function buildAvailableToolState({
  activeCanvas,
  sourceState,
  webContext,
  webToolsUnlocked,
}: {
  activeCanvas: boolean;
  sourceState: LinkedSourceState;
  webContext: Awaited<ReturnType<typeof createCookingWebContext>>;
  webToolsUnlocked: boolean;
}): AvailableToolState {
  const providerWebTools = webToolsUnlocked
    ? webToolsForProvider(webContext.tools, sourceState)
    : [];
  const availableTools = selectCookingToolsForState(activeCanvas, providerWebTools, {
    allowResearchRequest: !webToolsUnlocked && webContext.tools.length > 0,
  });
  const availableToolNames = availableTools.map((tool) => {
    const toolName = normalizeToolName(tool.function.name);
    if (!toolName) {
      throw new Error(`Unexpected cooking tool exposed: ${tool.function.name}`);
    }
    return toolName;
  });
  return {
    availableTools,
    availableToolNames,
    availableToolNameSet: new Set(availableToolNames),
  };
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

function fallbackModel(primaryModel: string): string | undefined {
  const model = (process.env.COOKING_AGENT_FALLBACK_MODEL || defaultFallbackModel).trim();
  if (!model || model === primaryModel) {
    return undefined;
  }
  return model;
}

function providerModels(primaryModel: string): string[] {
  const fallback = fallbackModel(primaryModel);
  return fallback ? [primaryModel, fallback] : [primaryModel];
}

function requestTimeoutMs(): number {
  const value = Number(process.env.COOKING_AGENT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 45000;
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('Cooking chat provider timed out') ||
    error.message.includes('fetch failed') ||
    error.message.includes('EAI_AGAIN') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ECONNRESET')
  );
}

function normalizeToolName(name: string | undefined): CookingToolName | undefined {
  if (
    name === 'create_cooking_document' ||
    name === 'read_cooking_document' ||
    name === 'revise_cooking_document' ||
    name === 'set_prompt_suggestions' ||
    name === 'request_external_research' ||
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
  const title = markdown?.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return validCanvasTitle(title);
}

function validCanvasTitle(value: unknown): string | undefined {
  const title = cleanOptionalText(value);
  return title && title !== '{' && title !== '}' ? title : undefined;
}

function draftTitle(draft: CookingDraft | undefined, fallback?: string): string | undefined {
  return (
    validCanvasTitle(draft?.recipe?.title) ||
    markdownTitle(draft?.documentMarkdown) ||
    validCanvasTitle(fallback)
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

export function extractTextPromptSuggestions(text: string): {
  text: string;
  promptSuggestions: string[];
} {
  const suggestions: string[] = [];
  const visibleText = text.replace(textPromptSuggestionCallPattern, (_call, serialized: string) => {
    try {
      suggestions.push(...sanitizePromptSuggestions(JSON.parse(serialized)));
    } catch {
      return '';
    }
    return '';
  });

  return {
    text: visibleText.replace(/\n{3,}/g, '\n\n').trim(),
    promptSuggestions: sanitizePromptSuggestions(suggestions),
  };
}

async function generatePromptSuggestions(
  messages: ChatMessage[],
  responseText: string,
  model: string,
): Promise<string[]> {
  const promptSuggestionTool = cookingTool('set_prompt_suggestions');
  if (!promptSuggestionTool || !responseText.includes('?')) {
    return [];
  }

  try {
    const assistant = await complete(
      [
        ...messages,
        {
          role: 'system',
          content: [
            'You add optional prompt suggestion chips after a completed cooking reply.',
            'Do not answer the user again. Call set_prompt_suggestions with zero to three exact prompts the user could send next.',
            'Use suggestions only when the completed reply offers meaningful next steps or asks the user to make a decision. For a rhetorical or informational question, submit an empty suggestions array.',
            'Suggestions should be concise, specific to the reply and conversation, and never generic filler.',
            '',
            'Completed user-facing reply:',
            responseText,
          ].join('\n'),
        },
      ],
      model,
      [promptSuggestionTool],
      undefined,
      { type: 'function', function: { name: 'set_prompt_suggestions' } },
    );
    const toolCall = assistant.tool_calls?.find(
      (candidate) => candidate.function.name === 'set_prompt_suggestions',
    );
    return toolCall
      ? sanitizePromptSuggestions(parseArguments(toolCall.function.arguments).suggestions)
      : [];
  } catch {
    return [];
  }
}

async function recoverEmptyResponse(messages: ChatMessage[], model: string): Promise<string> {
  try {
    const recovered = await complete(
      [
        ...messages,
        {
          role: 'system',
          content:
            'The previous turn did not include a user-facing response. Answer the user request directly now in normal chat prose. Do not call tools or output internal protocol.',
        },
      ],
      model,
      [],
    );
    return extractTextPromptSuggestions(recovered.content?.trim() ?? '').text;
  } catch {
    return '';
  }
}

function requestsBroadResearch(text: string): boolean {
  return /\b(?:compare|comparison|research|sources?|evidence|fact[- ]?check|verify|verification|multiple perspectives|deep dive|comprehensive)\b/i.test(
    text,
  );
}

function requestsExternalEvidence(text: string, sourceState: LinkedSourceState): boolean {
  if (sourceState.readRequired) {
    return true;
  }

  return (
    requestsBroadResearch(text) ||
    /\b(?:browse|internet|web|search|look\s*(?:it|this)?\s*up|google|source-backed|citation|cite|references?)\b/i.test(
      text,
    ) ||
    /\b(?:safe|safety|dangerous|botulism|canning|preserv(?:e|ing|ation)|pasteuri[sz]e|internal temperature|food poisoning|left out|expired|spoil(?:ed|age)|raw chicken|raw pork|raw egg)\b/i.test(
      text,
    ) ||
    /\b(?:current|latest|today|available|availability|price|buy|store|grocery|brand|product|model|equipment|manufacturer)\b/i.test(
      text,
    ) ||
    /\b(?:restaurant|menu|copycat|recreate|dupe|clone|authentic|traditional|origin|regional|history)\b/i.test(
      text,
    )
  );
}

function normalizedSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

function citedWebSources(
  text: string,
  sources: CookingWebSource[],
  limit: number,
): CookingWebSource[] {
  const linkedUrls = new Set(
    [...text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/gi)].map((match) =>
      normalizedSourceUrl(match[1]),
    ),
  );
  return sources
    .filter((source) => linkedUrls.has(normalizedSourceUrl(source.url)))
    .slice(0, limit);
}

function sourceLabel(source: CookingWebSource): string {
  if (source.title?.trim()) {
    return source.title.trim();
  }
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
}

function normalizedSourceText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[[\]()`*_#>]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceAttributionVariants(sources: CookingWebSource[]): string[] {
  const variants = new Set<string>();
  for (const source of sources) {
    const label = normalizedSourceText(sourceLabel(source));
    if (label) {
      variants.add(label);
    }
    try {
      const hostname = new URL(source.url).hostname.replace(/^www\./, '');
      const normalizedHost = normalizedSourceText(hostname);
      if (normalizedHost) {
        variants.add(normalizedHost);
      }
    } catch {
      // Ignore malformed URLs; sourceLabel already provides a usable fallback.
    }
  }
  return [...variants].sort((left, right) => right.length - left.length);
}

function isSourceAttributionLine(line: string, sourceVariants: string[]): boolean {
  const withoutListMarker = line.replace(/^(?:[-*]|\d+[.)])\s+/, '').trim();
  if (
    /^(?:#{1,6}\s*)?(?:sources?|references?|citations?)(?:\s+consulted)?\s*:?(?:\s|$)/i.test(
      withoutListMarker,
    ) ||
    /^source\s*:\s*\[[^\]]+\]\(https?:\/\//i.test(withoutListMarker) ||
    /^\[[^\]]+\]\(https?:\/\/[^)\s]+\)$/i.test(withoutListMarker) ||
    /^https?:\/\/\S+$/i.test(withoutListMarker) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(withoutListMarker)
  ) {
    return true;
  }

  const normalizedLine = normalizedSourceText(withoutListMarker);
  if (!normalizedLine) {
    return true;
  }
  const lineWords = normalizedLine.split(' ').length;
  return sourceVariants.some((variant) => {
    if (normalizedLine === variant) {
      return true;
    }
    const variantWords = variant.split(' ').length;
    return variantWords > 1 && normalizedLine.includes(variant) && lineWords <= variantWords + 3;
  });
}

function isAttributionOnlyResponse(text: string, sources: CookingWebSource[] = []): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return true;
  }
  const sourceVariants = sourceAttributionVariants(sources);
  return lines.every((line) => isSourceAttributionLine(line, sourceVariants));
}

function citedFallbackResponse(text: string, source: CookingWebSource): string {
  return `${text}\n\nReference: [${sourceLabel(source)}](${source.url})`;
}

async function ensureInlineSourceCitations(
  messages: ChatMessage[],
  text: string,
  sources: CookingWebSource[],
  model: string,
  sourceLimit: number,
): Promise<{ text: string; sources: CookingWebSource[] }> {
  if (!text || sources.length === 0) {
    return { text, sources: [] };
  }
  const attributionOnly = isAttributionOnlyResponse(text, sources);
  const existingCitations = citedWebSources(text, sources, sourceLimit);
  if (!attributionOnly && existingCitations.length > 0) {
    return { text, sources: existingCitations };
  }

  const sourceLines = sources
    .slice(0, sourceLimit)
    .map((source) => `- ${sourceLabel(source)}: ${source.url}`)
    .join('\n');
  const correctionMessages: ChatMessage[] = [
    ...messages,
    {
      role: 'system',
      content: [
        attributionOnly
          ? 'The previous draft contains only source attribution and does not answer the user request.'
          : 'The previous answer relied on web research but omitted inline markdown citations.',
        attributionOnly
          ? 'Write a substantive user-facing answer to the original request now, using the evidence only where relevant and citing supported factual claims inline with the source URLs below.'
          : 'Rewrite the same answer concisely, keeping its advice and final question, and cite externally supported factual claims inline using only the source URLs below.',
        'Return only the corrected user-facing answer. Do not call tools or mention this correction.',
        '',
        'Draft answer to revise:',
        text,
        '',
        'Available sources:',
        sourceLines,
      ].join('\n'),
    },
  ];
  for (const correctionModel of providerModels(model)) {
    try {
      const revised = await complete(correctionMessages, correctionModel, []);
      const revisedText = revised.content?.trim() ?? '';
      const revisedCitations = citedWebSources(revisedText, sources, sourceLimit);
      if (
        revisedText &&
        !isAttributionOnlyResponse(revisedText, sources) &&
        revisedCitations.length > 0
      ) {
        return { text: revisedText, sources: revisedCitations };
      }
    } catch {
      continue;
    }
  }
  if (attributionOnly) {
    return { text: '', sources: [] };
  }
  const source = sources[0];
  return { text: citedFallbackResponse(text, source), sources: [source] };
}

function cleanRequiredText(value: unknown, message: string): string {
  const text = cleanOptionalText(value);
  if (!text) {
    throw new CookingValidationError(message);
  }
  return text;
}

function cleanDocumentType(value: unknown): CookingDocumentType {
  if (value === 'guide' || value === 'prep_plan') {
    return value;
  }
  return 'recipe';
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
    throw new CookingValidationError(
      'Canvas document must include one title, an Ingredients section, and an Instructions or Method section with actionable steps. Rewrite a preparation plan in that structure and try again.',
    );
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
  return `I created ${title} in the cooking canvas.`;
}

function revisedCanvasMessage(changeSummary: string): string {
  return `I updated the selected cooking document: ${changeSummary}.`;
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

const externalResearchTypes = new Set([
  'verification',
  'current_fact',
  'food_safety',
  'product_or_equipment',
  'restaurant_or_menu',
  'authenticity_or_source_comparison',
  'linked_source',
  'other',
]);
const genericExternalResearchReasonPattern =
  /^(?:need|needs|use|uses|unlock|get|search|browse)?\s*(?:web|internet|research|sources?|citations?|external evidence)\s*\.?$/i;

function assertRevisionType(value: unknown): RevisionType {
  if (typeof value === 'string' && revisionTypes.has(value as RevisionType)) {
    return value as RevisionType;
  }
  throw new CookingValidationError('Recipe canvas revision type is malformed.');
}

function assertExternalResearchRequest(args: Record<string, unknown>): {
  reason: string;
  researchType: string;
} {
  const reason = cleanRequiredText(
    args.reason,
    'A concrete reason is required before unlocking web research tools.',
  );
  const researchType = cleanRequiredText(
    args.research_type,
    'A research type is required before unlocking web research tools.',
  );
  if (!externalResearchTypes.has(researchType)) {
    throw new CookingValidationError('External research type is malformed.');
  }
  if (reason.length < 20 || genericExternalResearchReasonPattern.test(reason)) {
    throw new CookingValidationError(
      'External research reason must explain why the user request depends on external evidence.',
    );
  }
  return { reason, researchType };
}

function assertToolAllowedForState(input: CookingChatInput, toolName: CookingToolName): void {
  if (
    (toolName === 'read_cooking_document' || toolName === 'revise_cooking_document') &&
    !input.activeDraft
  ) {
    throw new CookingValidationError('No cooking document is selected for this conversation.');
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
  webSources?: CookingWebSource[];
  unlockWebTools?: boolean;
}> {
  const args = parseArguments(toolCall.function.arguments);
  assertToolAllowedForState(input, toolCall.function.name);

  if (toolCall.function.name === 'request_external_research') {
    if (!webContext?.tools.length) {
      throw new CookingValidationError('Web research tools are not available for this chat.');
    }
    const { reason, researchType } = assertExternalResearchRequest(args);
    return {
      content: JSON.stringify({
        ok: true,
        webToolsUnlocked: webContext.tools.map((tool) => tool.function.name),
        researchType,
        reason,
        guidance:
          'Use the narrowest web tool needed, then answer the user substantively in Mise voice. Sources should support the answer, not replace it.',
      }),
      draftChanged: false,
      unlockWebTools: true,
    };
  }

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
    throw new CookingValidationError(
      'Prompt suggestions are generated only after a user-facing response is complete.',
    );
  }

  if (toolCall.function.name === 'read_cooking_document') {
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

  if (toolCall.function.name === 'create_cooking_document') {
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
    const requestedTitle = cleanRequiredText(args.title, 'Recipe canvas title is required.');
    const documentType = cleanDocumentType(args.document_type);
    const markdown = assertRecipeMarkdown(args.markdown);
    const title = markdownTitle(markdown) ?? validCanvasTitle(requestedTitle);
    if (!title) {
      throw new Error('Recipe canvas title is malformed.');
    }
    const changeSummary = cleanRequiredText(
      args.change_summary,
      'Canvas change summary is required.',
    );
    const userMessage = conciseCanvasUserMessage(args.user_message, createdCanvasMessage(title));
    const draft = await generateCookingDraft(
      input.user,
      title,
      input.conversationId,
      markdown,
      documentType,
    );
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
        documentType: draft.documentType,
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
    throw new CookingValidationError('No cooking document is selected for this conversation.');
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
    throw new CookingValidationError('No cooking document is selected for this conversation.');
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
  toolChoice: ToolChoice = 'auto',
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
        tool_choice: toolChoice,
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
    let streamedTextTail = '';
    let suppressLeakedSuggestionCall = false;

    const emitVisibleText = async (delta: string) => {
      if (!onTextDelta || suppressLeakedSuggestionCall) {
        return;
      }

      streamedTextTail += delta;
      const markerIndex = streamedTextTail.toLowerCase().indexOf(textPromptSuggestionMarker);
      if (markerIndex >= 0) {
        const visible = streamedTextTail
          .slice(0, markerIndex)
          .replace(/```(?:\w+)?\s*$/i, '')
          .replace(/\n{3,}$/g, '\n\n');
        if (visible) {
          await onTextDelta(visible);
        }
        streamedTextTail = '';
        suppressLeakedSuggestionCall = true;
        return;
      }

      if (streamedTextTail.length <= streamedTextTailLength) {
        return;
      }
      const visibleLength = streamedTextTail.length - streamedTextTailLength;
      await onTextDelta(streamedTextTail.slice(0, visibleLength));
      streamedTextTail = streamedTextTail.slice(visibleLength);
    };

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
        await emitVisibleText(delta.content);
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
    if (!suppressLeakedSuggestionCall && streamedTextTail) {
      await onTextDelta?.(streamedTextTail);
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
): toolName is 'create_cooking_document' | 'revise_cooking_document' {
  return toolName === 'create_cooking_document' || toolName === 'revise_cooking_document';
}

export async function runCookingChat(input: CookingChatInput): Promise<CookingChatResult> {
  const sourceState = linkedSourceState(input.text);
  const broadResearch = requestsBroadResearch(input.text);
  const sourceLimit = broadResearch ? 5 : 3;
  const webContextStartedAt = Date.now();
  const webContext = await createCookingWebContext({
    user: input.user,
    webSearchConfig: input.webSearchConfig,
    loadAuthValues: input.loadAuthValues,
    conversationCreatedAt: input.conversationCreatedAt,
    allowBroadResearch: broadResearch,
  });
  const linkedSourcePreload = await preloadLinkedRecipeSources(sourceState, webContext);
  const activeCanvas = Boolean(input.activeDraft);
  const externalEvidenceNeeded = requestsExternalEvidence(input.text, sourceState);
  let webToolsUnlocked = externalEvidenceNeeded;
  let availableToolState = buildAvailableToolState({
    activeCanvas,
    sourceState,
    webContext,
    webToolsUnlocked,
  });
  const refreshAvailableTools = (): void => {
    availableToolState = buildAvailableToolState({
      activeCanvas,
      sourceState,
      webContext,
      webToolsUnlocked,
    });
  };
  input.onTiming?.({
    stage: 'web_context_loaded',
    durationMs: Date.now() - webContextStartedAt,
    toolCount: availableToolState.availableTools.length,
    activeCanvas,
    availableToolNames: availableToolState.availableToolNames,
  });
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        input.promptPrefix,
        preferencesContext(input.preferencesMarkdown),
        webAvailabilityContext(webContext.unavailableReason),
        documentsContext(input.documents, input.activeDraft),
        activeCanvasContext(input.activeDraft),
        linkedSourceContext(sourceState),
        linkedSourcePreload.context,
        toolStateContext(activeCanvas, availableToolState.availableTools),
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
    availableToolNames: availableToolState.availableToolNames,
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
  let webSources: CookingWebSource[] = linkedSourcePreload.sources.slice(0, sourceLimit);
  let latestCanvasUserMessage = '';
  const resolvedModel = selectedModel(input.model);

  for (let turn = 0; turn < 5; turn += 1) {
    let assistant: ChatMessage | undefined;
    let providerStartedAt = Date.now();
    let selectedAttemptModel = resolvedModel;
    let streamedCharsThisTurn = 0;
    let lastProviderError: unknown;

    const attemptModels = providerModels(resolvedModel);
    const finalAttemptModel = attemptModels[attemptModels.length - 1];

    for (const attemptModel of attemptModels) {
      providerStartedAt = Date.now();
      selectedAttemptModel = attemptModel;
      input.onTiming?.({
        stage: 'provider_request_start',
        turn,
        model: attemptModel,
        messageCount: messages.length,
        toolCount: availableToolState.availableTools.length,
        activeCanvas,
        availableToolNames: availableToolState.availableToolNames,
        promptChars: messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0),
      });

      try {
        assistant = await complete(
          messages,
          attemptModel,
          availableToolState.availableTools,
          webSources.length === 0
            ? async (delta) => {
                streamedCharsThisTurn += delta.length;
                await input.onTextDelta?.(delta);
              }
            : undefined,
        );
        break;
      } catch (error) {
        lastProviderError = error;
        const canRetry = streamedCharsThisTurn === 0 && isRetryableProviderError(error);
        input.onTiming?.({
          stage: 'provider_response',
          turn,
          model: attemptModel,
          durationMs: Date.now() - providerStartedAt,
          toolCallCount: 0,
          providerToolCallCount: 0,
          outputChars: streamedCharsThisTurn,
          error: error instanceof Error ? error.message : 'Cooking chat provider failed.',
        });
        if (!canRetry || attemptModel === finalAttemptModel) {
          throw error;
        }
      }
    }

    if (!assistant) {
      throw lastProviderError instanceof Error
        ? lastProviderError
        : new Error('Cooking chat failed.');
    }
    input.onTiming?.({
      stage: 'provider_response',
      turn,
      model: selectedAttemptModel,
      durationMs: Date.now() - providerStartedAt,
      toolCallCount: assistant.tool_calls?.length ?? 0,
      providerToolCallCount: assistant.tool_calls?.length ?? 0,
      outputChars: assistant.content?.length ?? 0,
    });
    messages.push(assistant);
    assistantText = assistant.content?.trim() ?? '';

    if (!assistant.tool_calls?.length) {
      const extracted = extractTextPromptSuggestions(assistantText);
      const responseText =
        extracted.text || (await recoverEmptyResponse(messages, selectedAttemptModel));
      const citedResponse = await ensureInlineSourceCitations(
        messages,
        responseText,
        webSources,
        selectedAttemptModel,
        sourceLimit,
      );
      let responseSuggestions = extracted.promptSuggestions;
      if (responseSuggestions.length === 0) {
        responseSuggestions = await generatePromptSuggestions(
          messages,
          citedResponse.text,
          selectedAttemptModel,
        );
      }
      return {
        text:
          citedResponse.text ||
          latestCanvasUserMessage ||
          (draftChanged
            ? 'I updated the cooking canvas.'
            : 'I could not generate a cooking response just now. Please try again.'),
        draft,
        draftChanged,
        promptSuggestions: responseSuggestions,
        webSources: citedResponse.sources,
      };
    }

    let fastCanvasReturn = false;
    for (const toolCall of assistant.tool_calls) {
      if (fastCanvasReturn) {
        continue;
      }
      const toolStartedAt = Date.now();
      try {
        if (!availableToolState.availableToolNameSet.has(toolCall.function.name)) {
          throw new CookingValidationError('The requested tool is not available in this turn.');
        }
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
          ].slice(0, sourceLimit);
        }
        if (result.unlockWebTools) {
          webToolsUnlocked = true;
          refreshAvailableTools();
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
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: errorMessage,
            action: isCanvasMutationTool(toolCall.function.name)
              ? 'Correct the complete cooking document and retry the mutation, or explain naturally if the user request cannot be represented as a cooking document.'
              : undefined,
          }),
        });
      }
    }

    if (fastCanvasReturn) {
      return {
        draft,
        draftChanged,
        promptSuggestions: [],
        webSources,
        text: latestCanvasUserMessage,
      };
    }
  }

  const extracted = extractTextPromptSuggestions(assistantText);
  const responseText = extracted.text || (await recoverEmptyResponse(messages, resolvedModel));
  const citedResponse = await ensureInlineSourceCitations(
    messages,
    responseText,
    webSources,
    resolvedModel,
    sourceLimit,
  );
  const existingSuggestions = extracted.promptSuggestions;
  return {
    draft,
    draftChanged,
    promptSuggestions:
      existingSuggestions.length > 0
        ? existingSuggestions
        : await generatePromptSuggestions(messages, citedResponse.text, resolvedModel),
    webSources: citedResponse.sources,
    text:
      citedResponse.text ||
      latestCanvasUserMessage ||
      (draftChanged
        ? 'I updated the cooking canvas.'
        : 'I could not generate a cooking response just now. Please try again.'),
  };
}
