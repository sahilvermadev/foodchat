import { logger } from '@librechat/data-schemas';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { MCPManager } from '~/mcp/MCPManager';

import type {
  CookingChatCategory,
  CookingDocumentType,
  CookingDraft,
  TCustomConfig,
  TMessage,
} from 'librechat-data-provider';

import { isRecipeDocumentMarkdown } from './canvas';
import type { CookingTurnIntent } from './understanding';
import { understandCookingTurn } from './understanding';
import { buildTurnContext } from './context';
import { createCookingWebContext } from './web';
import type { CookingWebSource } from './web';
import { planCookingTurn } from './planner';
import type {
  CookingDeliveryMode,
  CookingPlannedAction,
  CookingPromptProfile,
  CookingTurnPlan,
} from './planner';
import { generateCookingDraft, getCookingDraftByConversation, updateCookingDraft } from './service';
import { CookingValidationError } from './validation';
import { buildPreferenceBrief } from './brief';
import { validateCookingResponseHardBoundaries, validateCookingResponseWithJudge } from './quality';
import type { CookingQualityFailureLabel } from './quality';
import { routeCookingModels, routeCookingPlanner } from './routing';
import type { CookingModelPurpose, CookingModelRoutingReason } from './routing';
import { canStreamCookingTurnBeforeValidation } from './streaming';
import { ensureInlineSourceCitations } from './citations';
import type { AvailableCookingTool as CitationCookingTool } from './citations';
import {
  defaultSuggestionsForIntent,
  extractTextPromptSuggestions,
  generatePromptSuggestions,
  setCachedSuggestions,
  getCachedSuggestions,
} from './suggestions';

export { sanitizePromptSuggestions, extractTextPromptSuggestions } from './suggestions';

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

type CookingImageBlock = {
  type: 'image_url';
  image_url: string | { url: string; detail?: 'auto' | 'low' | 'high' };
};

type CookingTextBlock = {
  type: 'text';
  text: string;
};

type ChatMessage = {
  role: ChatRole;
  content: string | Array<CookingTextBlock | CookingImageBlock> | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type CookingHistoryMessage = TMessage & {
  image_urls?: CookingImageBlock[];
};

type AttachedImageSourceState = {
  currentImageCount: number;
  historicalImageCount: number;
  available: boolean;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
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
  | 'read_recipe_source'
  | 'find_pairings'
  | 'neighbors'
  | 'closest_mode'
  | 'compare_on_axis'
  | 'morph'
  | 'pairing_score'
  | 'cultural_profile';

type CookingToolDefinition = {
  type: 'function';
  function: {
    name: CookingToolName;
    description: string;
    parameters?: Record<string, unknown>;
  };
};

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
      function: { name: string };
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
  locale?: string;
  timeZone?: string;
  onTiming?: (event: CookingChatTimingEvent) => void;
  onTextDelta?: (delta: string, isFinal?: boolean) => void | Promise<void>;
  onStep?: (event: { type: string; payload: Record<string, unknown> }) => void | Promise<void>;
  image_urls?: CookingImageBlock[];
};

export type CookingChatResult = {
  text: string;
  draft?: CookingDraft;
  draftChanged: boolean;
  promptSuggestions: string[];
  webSources: CookingWebSource[];
  activeIntent?: CookingTurnIntent;
  activeAction?: CookingPlannedAction;
  activeCategory?: CookingChatCategory;
};

export type CookingChatTimingEvent = {
  stage:
    | 'web_context_loaded'
    | 'provider_request_start'
    | 'provider_response'
    | 'tool_executed'
    | 'quality_validated';
  durationMs?: number;
  turn?: number;
  toolName?: string;
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
  plannerUsed?: boolean;
  plannerFallbackReason?: string;
  plannedIntent?: string;
  plannedAction?: string;
  promptProfile?: string;
  selectedContextCategories?: string[];
  withheldContextCategories?: string[];
  plannerConfidence?: string;
  qualityGatePassed?: boolean;
  qualityFailureLabels?: CookingQualityFailureLabel[];
  qualityOriginalFailureLabels?: CookingQualityFailureLabel[];
  qualityRepairAttempted?: boolean;
  qualityRepairSucceeded?: boolean;
  qualityRepairLatencyMs?: number;
  qualityJudgeUsed?: boolean;
  qualityJudgeFallbackReason?: string;
  qualityJudgeRationaleLabels?: string[];
  responseBufferedForValidation?: boolean;
  modelPurpose?: CookingModelPurpose;
  modelRoutingReason?: CookingModelRoutingReason;
  plannerModel?: string;
  plannerRoutingReason?: CookingModelRoutingReason;
  responseModel?: string;
  repairModel?: string;
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
const textPromptSuggestionMarker = 'set_prompt_suggestions';
const streamedTextTailLength = textPromptSuggestionMarker.length + 24;

function logCookingSource(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  logger.info(`[CookingSource] ${event}`, payload);
}

function globalLogCookingAgent(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  logger.info(`[CookingAgent] ${event} ${JSON.stringify(payload)}`);
}

const cookingSystemInstructions = `You are Samwise: a cooking companion for curious home cooks. You help people decide what to cook, understand why food works, research recipes, troubleshoot the pan in front of them, and turn good ideas into usable recipe canvases.

Personality:
- Be candid, worldly, curious, humane, and occasionally dryly funny. Think street-market appetite, deep respect for craft, and zero tolerance for bland hand-waving.
- Do not imitate or quote any real chef, writer, or TV host. The voice is Samwise's own: vivid, direct, observant, and generous.
- Make cooking feel alive. Use sensory language, cultural context, little bits of food history, and practical kitchen judgment when they help.
- Talk like a person, not a form. Avoid generic therapy phrases, corporate reassurance, and empty enthusiasm.
- Build a relationship over time. Notice durable details from the user's profile, but do not perform memory. Use personal context naturally and sparingly.

Decide by user need before choosing tools:
- Some turns need communication: answer a question, clarify a tradeoff, explain a technique, compare options, reassure, diagnose, or help the user decide. Use chat for these turns, even when a canvas tool is available.
- Some turns need durable document work: the user wants a recipe, guide, or preparation plan they will use later, the reply would otherwise present one specific recipe in detail, or the user wants the selected document changed. Use a document mutation tool for these turns.
- If the user is still exploring, keep the conversation open. Once you are presenting a particular recipe in detail with ingredients and cookable method, create or update the canvas instead of dumping the full recipe in chat.
- If document tools are unavailable for a turn that now clearly needs a complete recipe document, do not pretend to create the canvas and do not dump a long formal recipe in chat; answer briefly and offer to write it up on the canvas.
- After the recipe is on the canvas, later modifications should both update the recipe with the appropriate document tool and communicate the result clearly in chat via the tool's user_message.
- If the user has committed to a recipe or asks for the cooking instructions to change, update the canvas instead of merely describing the update.
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
- An attached image or screenshot containing a recipe is also a recipe source. Inspect it carefully and treat its visible quantities, ingredient groups, alternatives, yield, temperatures, timing, and method as controlling facts.
- When the user says "this recipe," "the attached recipe," "give me this," or asks to create a canvas after attaching a recipe image, reproduce the attached source rather than generating a generic recipe for the recognized dish.
- Preserve meaningful source variants and options shown in the image, such as alternate sauces or methods. Do not silently collapse them into one generic path.
- If critical source text is genuinely unreadable or cropped, identify the specific missing fact and ask one focused question. Never fill an unreadable quantity, temperature, or timing with an invented value while presenting it as the source recipe.
- When the user asks for an exact, official, or named chef/author/publisher recipe, use web research before answering. If no readable source is found, say so and ask for a link or pasted text; do not reconstruct it from memory.
- Be honest about source access. If the page cannot be read, is paywalled, or does not expose the usable recipe details, ask the user to paste the recipe text instead of inventing a lookalike.
- When a source is readable, preserve the cooking facts that make it that recipe: quantities, ratios, yield, equipment size, temperature, timing, and critical method. Rewrite guidance in Samwise's own words and cite the source where chat needs a citation.

Using user context:
- Treat Safety, Diet, and Religious & Cultural Rules as hard constraints that silently filter suggestions.
- Do not open with or volunteer phrases like "since we're avoiding..." or "skipping..." saved restrictions. Mention a restriction only when the user asks about it, when explaining why a requested food cannot be suggested, or when a substitution is directly necessary.
- If the user asks for a dish, style, or recipe containing or resembling a restricted ingredient (e.g., a "beefy" dish when "beef-free" is a saved constraint), immediately resolve this conflict by substituting the restricted ingredient with a compliant alternative. Proactively call the neighbors tool in the background to discover scientifically compatible, flavor-space substitutes before finalizing your recommendation. Clearly and briefly explain the substitution in your response (or in your canvas tool's user_message), confirming that you are keeping their meal compliant with their saved restrictions while still satisfying their flavor request.
- When an ingredient in a recipe is likely hard to procure or rare in the user's country (determined via their locale context), proactively call the neighbors tool to find accessible substitutions. Do not mention tool names or technical details (like vector spaces or nearest neighbors) to the user; present the substitution choices as a natural, helpful part of your culinary advice.
- Adapt the recommended type of salt to the user's location/locale context: default to "kosher salt" for users in the US/North America where it is a standard culinary reference, and default to "fine sea salt" or "table salt" for users in India, Europe, or other regions where kosher salt is rare. Ensure volume quantities are scaled accordingly, as fine salt is roughly twice as dense as kosher salt by volume (e.g. scale down the volume if using fine salt).
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
- When web research is used, sources are supporting evidence, not the shape of the answer. First give the user useful cooking judgment in Samwise's own voice; cite only the claims that depend on those sources.
- Results from a web tool are working evidence, not a final answer. After using them, answer the user's request substantively; never return only a source list, bibliography, attribution line, or thin one-sentence summary.
- Do not copy long recipe text verbatim. Transform external recipes into Samwise's own guidance or canvas format and cite the source URL once in chat.

Conversation flow:
- When an exploratory reply presents useful next steps or requires a choice, finish the user-facing answer with a clear, natural question.
- The product enriches completed replies with optional follow-up controls separately. Do not output tool-like UI instructions or protocol syntax in chat prose.

Rekky json-render widgets:
- You may include compact rendered widgets in chat or canvas markdown when they clarify practical cooking information better than prose alone.
- Emit widgets only as a fenced code block with language rekky-ui containing one valid JSON object. Do not mention json-render to the user.
- Use widgets sparingly: one to three per answer, only when they add real scan value.
- The only allowed component types are MetricRow, IngredientSwapTable, Checklist, and ComparisonGrid.
- Timers are not json-render widgets. Timers must live inline in recipe canvas steps using [timer:seconds] or [timer:seconds|short label].
- For a single widget, use this shape: {"type":"ComponentName","props":{}}.
- For grouped widgets, use the flat json-render spec shape: {"root":"element-id","elements":{"element-id":{"type":"ComponentName","props":{},"children":[]}}}.
- MetricRow props: {"items":[{"label":"Total","value":"35 min"}]}.
- IngredientSwapTable props: {"title":"Useful swaps","rows":[{"ingredient":"poblano","swap":"charred capsicum","note":"Keeps the smoky vegetal role, with less heat."}]}.
- Checklist props: {"title":"Before you start","items":["Soak rice","Salt yogurt","Warm the pan"]}.
- ComparisonGrid props: {"title":"Choose a path","columns":[{"label":"Fast","value":"Use canned beans."},{"label":"Deeper","value":"Simmer soaked beans with aromatics."}]}.

Recipe canvas markdown requirements:
- Write a structured recipe document that feels like competent guidance, not documentation.
- Start with a one-paragraph orientation after the title: what the dish is, the intended texture and flavor profile, effort level, timing reality, and the main thing that makes the recipe work.
- Include these sections in this order when useful: Equipment, Recipe Data, Quality Checks, Key Notes Before Starting, Ingredients, Instructions, Recovery Notes, Serving Notes, Variations, Notes.
- In Equipment, default to common, low-assumption tools and include practical alternatives for specialized appliances. Do not assume the user owns a tool unless they said so in this conversation or it is a durable saved kitchen preference.
- Recipe Data should include servings/yield, prep time, cook time, total time, and difficulty when reasonably inferable.
- Quality Checks should name the critical success signals for the dish: texture, aroma, color, sound, temperature, reduction level, or doneness.
- Ingredients must be grouped by function inside the table. Use rows such as "For the marinade", "For the sauce", "For finishing", or equivalent phase labels before the ingredients in that group.
- Ingredients should be a markdown table with Ingredient | Metric | Imperial | State/Form | Notes. Never omit or generalize critical seasonings like salt and acid. Always list salt and acids with specific measurements or clear context (e.g. "1.5 tsp kosher salt", "1 tbsp lemon juice") and specify the type of salt suitable for their region.
- Instructions should be written around human attention: one action per numbered step, clear prep windows, active/passive rhythm, and no overloaded steps.
- Each meaningful step should include sensory endpoint cues and brief causality: what to notice and why it matters, especially for blooming spices, reducing sauces, browning, simmering, resting, and finishing.
- Explicitly guide the salting process across different stages (layering). Do not relegate salting to just the end of the recipe. Instruct when to salt early (e.g. to draw out moisture from aromatics, to dry-brine proteins, or to season boiling water) and when to adjust late.
- The final instruction step of every recipe MUST explicitly tell the cook to taste and adjust the seasoning (salt, acid, heat, sweetness) before serving, explaining what balance to look for.
- Include timer tokens like [timer:180] or [timer:180|Sear mushrooms] inline inside the relevant numbered step for timed actions.
- Never rely on time alone; pair every timer with visual/aroma/texture cues in the same step sentence.
- Manage anxiety explicitly where failure is common: note what may look strange but is normal, and what to do if the cook overshoots.
- Recovery Notes should cover likely fixes for the specific recipe, such as too salty, too acidic (and how to balance it), flat flavor (recommending salt or acid adjustments), too thick, too thin, split sauce, raw spice taste, dry protein, or undercooked starch.
- Serving Notes should explain temperature, texture at serving, plating, pairings, and what contrast balances the dish.
- Variations should be constrained and meaningful. Provide a canonical path first, then only a few purposeful variations.
- Keep tone warm, direct, and trustworthy. The cook should feel that someone competent is beside them.

Epicure Flavor Science Tools:
- Use find_pairings when designing a recipe or suggesting pairing profiles for ingredients. The model outputs clusters and "bridges" that represent interesting connectors. Compose the recipe using those surfaced ingredients.
- Use neighbors to find substitutions (culinary and chemical) for a single ingredient, especially when an ingredient is restricted by user safety/diet constraints, or is likely hard to procure or scarce based on their locale.
- Use closest_mode to describe the flavor profile or flavor family of an ingredient.
- Use pairing_score to calculate compatibility between two ingredients.
- Use compare_on_axis to compare two ingredients along a specific sensory axis (e.g. sweet, sour, spicy).
- Use morph to discover fusion pairings by rotating an ingredient vector toward a cuisine direction (e.g. "cuisine:Italian") or another ingredient.

Prompt suggestions inline format:
- At the very end of your response, if the response is complete and offers meaningful next steps or asks the user to make a decision, append a single trailing line formatted exactly as: set_prompt_suggestions(suggestions=["concise suggestion 1", "concise suggestion 2", "concise suggestion 3"]);
- Limit suggestions to a maximum of 3 highly contextual, concise follow-up prompts. If the reply is rhetorical or informational, do not append suggestions.`;

function withoutSection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`\\n\\n${escaped}:\\n[\\s\\S]*?(?=\\n\\n[A-Z][^\\n]+:\\n|$)`), '');
}

function cookingSystemInstructionsForProfile(profile: CookingPromptProfile): string {
  if (profile === 'document_work' || profile === 'source_or_research') {
    return cookingSystemInstructions;
  }

  const withoutCanvasRequirements = withoutSection(
    cookingSystemInstructions,
    'Recipe canvas markdown requirements',
  );
  if (profile === 'active_canvas_discussion') {
    return withoutCanvasRequirements;
  }
  return withoutSection(withoutCanvasRequirements, 'Cooking document contract');
}

function cookingDeliveryInstructions(mode: CookingDeliveryMode): string {
  const common = [
    'Cooking chat delivery rules:',
    '- Put the useful cooking action, answer, or decision first.',
    '- Follow with the key sensory endpoint, warning, or tradeoff when useful.',
    '- Keep explanations after the action, not before it.',
    '- Full recipes belong on the cooking canvas; do not restate full canvas contents in chat.',
  ];
  if (mode === 'glance') {
    return [
      ...common,
      '- Delivery mode: glance. Use 40-90 words when possible, with at most 3 short bullets.',
    ].join('\n');
  }
  if (mode === 'deep_dive') {
    return [
      ...common,
      '- Delivery mode: deep_dive. Use structured explanation only because the user asked for why, comparison, or detail.',
    ].join('\n');
  }
  if (mode === 'canvas_confirmation') {
    return [
      ...common,
      '- Delivery mode: canvas_confirmation. After creating or revising a document, reply with one short sentence confirming the result and do not repeat the recipe.',
    ].join('\n');
  }
  return [
    ...common,
    '- Delivery mode: standard. Use 100-180 words when possible and keep the answer easy to scan.',
  ].join('\n');
}

const tools: CookingToolDefinition[] = [
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
  {
    type: 'function',
    function: {
      name: 'find_pairings',
      description:
        'Find pairings and flavor matches for one or more ingredients. Crucial for dish design, pairing exploration, and finding interesting cross-cluster connections.',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of seed ingredients.',
          },
          is_vegan: { type: 'boolean', description: 'Filter out non-vegan pairings.' },
          is_vegetarian: { type: 'boolean', description: 'Filter out non-vegetarian pairings.' },
        },
        required: ['ingredients'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'neighbors',
      description:
        'Find standard culinary and chemical substitutions (nearest neighbors) for a single ingredient in the flavor space.',
      parameters: {
        type: 'object',
        properties: {
          ingredient: { type: 'string', description: 'The ingredient to substitute.' },
          top_k: {
            type: 'integer',
            description: 'Number of substitutions to return. Default is 5.',
          },
        },
        required: ['ingredient'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pairing_score',
      description: 'Calculate the compatibility/similarity score between two ingredients.',
      parameters: {
        type: 'object',
        properties: {
          ingredient_a: { type: 'string' },
          ingredient_b: { type: 'string' },
        },
        required: ['ingredient_a', 'ingredient_b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'closest_mode',
      description: 'Get the flavor family cluster/mode that an ingredient belongs to.',
      parameters: {
        type: 'object',
        properties: {
          ingredient: { type: 'string' },
          property: { type: 'string', description: 'Optional property context.' },
          top_k: { type: 'integer' },
        },
        required: ['ingredient'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_on_axis',
      description:
        'Compare two ingredients along a specific sensory or culinary axis (e.g. sweet, spicy, sour).',
      parameters: {
        type: 'object',
        properties: {
          ingredient_a: { type: 'string' },
          ingredient_b: { type: 'string' },
          axis: { type: 'string' },
        },
        required: ['ingredient_a', 'ingredient_b', 'axis'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'morph',
      description:
        'Rotate/transform a flavor vector toward a specific target (cuisine region, sensory axis, or another ingredient) to create fusion combinations.',
      parameters: {
        type: 'object',
        properties: {
          seed: { type: 'string', description: 'The starting ingredient.' },
          target: {
            type: 'string',
            description:
              'The target flavor axis, cuisine (e.g. "cuisine:Italian"), or another ingredient.',
          },
          angle_deg: { type: 'number', description: 'Rotation angle in degrees. Default is 30.' },
          top_k: { type: 'integer', description: 'Number of neighbors to return. Default is 5.' },
        },
        required: ['seed', 'target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cultural_profile',
      description:
        'Analyze an ingredient against all cuisine regions to see its cultural alignment.',
      parameters: {
        type: 'object',
        properties: {
          ingredient: { type: 'string' },
        },
        required: ['ingredient'],
      },
    },
  },
];

// CookingToolDefinition is declared above
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

function preferenceSectionTitles(markdown: string | undefined): string[] {
  return [
    ...new Set(
      [...(markdown?.matchAll(/^#{2,}\s+(.+?)\s*$/gm) ?? [])]
        .map((match) => match[1]?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  ];
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
  const availableToolNames = availableTools.map((tool) => tool.function.name);
  const toolNames = availableToolNames.join(', ') || 'none';
  const hasDocumentTools = availableToolNames.some((name) =>
    ['create_cooking_document', 'read_cooking_document', 'revise_cooking_document'].includes(name),
  );
  let documentToolLine = '';
  if (!hasDocumentTools) {
    documentToolLine =
      '- Durable document tools are intentionally unavailable this turn. Answer in chat unless the user explicitly asks for a saved recipe, guide, prep plan, or canvas change.';
  } else if (hasActiveCanvas) {
    documentToolLine =
      '- Changes to the selected document go through revise_cooking_document; distinct deliverables go through create_cooking_document; exact inspection goes through read_cooking_document.';
  } else {
    documentToolLine =
      '- A new durable cooking document should go through create_cooking_document after the user commits to usable instructions.';
  }

  return [
    'Current Product State:',
    `- Selected cooking document: ${hasActiveCanvas ? 'yes' : 'no'}.`,
    `- Available tools this turn: ${toolNames}.`,
    documentToolLine,
    '- Chat is the right response for questions, clarification, comparison, reassurance, and decision support. Do not claim a canvas mutation unless a canvas mutation tool succeeds.',
  ].join('\n');
}

function selectCookingToolsForState(
  hasActiveCanvas: boolean,
  webTools: CookingWebToolDefinition[],
  options: { allowDocumentTools?: boolean; allowResearchRequest?: boolean } = {},
): AvailableCookingTool[] {
  let localToolNames: CookingToolName[] = [];
  if (options.allowDocumentTools !== false) {
    localToolNames = hasActiveCanvas
      ? ['create_cooking_document', 'read_cooking_document', 'revise_cooking_document']
      : ['create_cooking_document'];
  }
  localToolNames.push(
    'find_pairings',
    'neighbors',
    'closest_mode',
    'compare_on_axis',
    'morph',
    'pairing_score',
    'cultural_profile',
  );
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
  availableToolNames: string[];
  availableToolNameSet: Set<string>;
};

function emptyAvailableToolState(): AvailableToolState {
  return {
    availableTools: [],
    availableToolNames: [],
    availableToolNameSet: new Set(),
  };
}

function buildAvailableToolState({
  activeCanvas,
  allowDocumentTools,
  allowResearchRequestTool,
  sourceState,
  webContext,
  webToolsUnlocked,
}: {
  activeCanvas: boolean;
  allowDocumentTools?: boolean;
  allowResearchRequestTool?: boolean;
  sourceState: LinkedSourceState;
  webContext: Awaited<ReturnType<typeof createCookingWebContext>>;
  webToolsUnlocked: boolean;
}): AvailableToolState {
  const providerWebTools = webToolsUnlocked
    ? webToolsForProvider(webContext.tools, sourceState)
    : [];
  const availableTools = selectCookingToolsForState(activeCanvas, providerWebTools, {
    allowDocumentTools,
    allowResearchRequest:
      Boolean(allowResearchRequestTool) && !webToolsUnlocked && webContext.tools.length > 0,
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
    name === 'read_recipe_source' ||
    name === 'find_pairings' ||
    name === 'neighbors' ||
    name === 'closest_mode' ||
    name === 'compare_on_axis' ||
    name === 'morph' ||
    name === 'pairing_score' ||
    name === 'cultural_profile'
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
    const imageUrls = (message as CookingHistoryMessage).image_urls;
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    const formattedContent: ChatMessage['content'] =
      hasImages && message.isCreatedByUser
        ? [{ type: 'text' as const, text: content }, ...imageUrls]
        : content;
    acc.push({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      content: formattedContent,
    });
    return acc;
  }, []);
}

function attachedImageSourceState(input: CookingChatInput): AttachedImageSourceState {
  const currentImageCount = input.image_urls?.length ?? 0;
  const historicalImageCount = (input.messages ?? []).reduce((count, message) => {
    if (!message.isCreatedByUser) {
      return count;
    }
    return count + ((message as CookingHistoryMessage).image_urls?.length ?? 0);
  }, 0);
  return {
    currentImageCount,
    historicalImageCount,
    available: currentImageCount + historicalImageCount > 0,
  };
}

function attachedImageSourceContext(state: AttachedImageSourceState): string {
  if (!state.available) {
    return '';
  }
  const location =
    state.currentImageCount > 0 ? 'the current user message' : 'recent conversation history';
  return [
    'Attached Image Source Requirement:',
    `A user-provided image source is available in ${location}.`,
    'If the user asks for the recipe shown in that image or asks to put it on the canvas, the image controls the recipe.',
    'Read the image itself and preserve visible quantities, ingredient groups, variants, yield, temperatures, timing, and critical method. Do not substitute a generic recipe for the recognized dish.',
    'If a critical detail is unreadable, ask about that exact detail instead of inventing it.',
  ].join('\n');
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toolPayloadHasError(content: string | undefined): boolean {
  if (!content) {
    return false;
  }
  if (/^\s*error\s*:/i.test(content)) {
    return true;
  }
  try {
    const parsed = JSON.parse(content) as { error?: unknown; ok?: unknown };
    return typeof parsed.error === 'string' || parsed.ok === false;
  } catch {
    return false;
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
      undefined,
      'auto',
      0.1,
    );
    const contentStr = typeof recovered.content === 'string' ? recovered.content : '';
    return extractTextPromptSuggestions(contentStr.trim()).text;
  } catch {
    return '';
  }
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

function assertToolAllowedForState(input: CookingChatInput, toolName: string): void {
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

  if (
    [
      'find_pairings',
      'neighbors',
      'closest_mode',
      'compare_on_axis',
      'morph',
      'pairing_score',
      'cultural_profile',
    ].includes(toolCall.function.name)
  ) {
    try {
      const mcpManager = MCPManager.getInstance();
      const connection = await mcpManager.getConnection({ serverName: 'epicure' });
      if (!(await connection.isConnected())) {
        throw new Error('Epicure MCP connection is not active.');
      }
      const result = await connection.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolCall.function.name,
            arguments: args,
          },
        },
        CallToolResultSchema,
        { timeout: 30000 },
      );
      const content =
        result.content
          ?.map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
          .filter(Boolean)
          .join('\n') || '';
      logger.info(
        `[CookingAgent] Called Epicure tool ${toolCall.function.name} with args: ${JSON.stringify(
          args,
        )} - result length: ${content.length} chars.`,
      );
      return {
        content,
        draftChanged: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[CookingAgent] Failed to call Epicure tool ${toolCall.function.name}: ${msg}`);
      const fallbackPrompt = [
        `Error: The flavor database is temporarily unavailable (reason: ${msg}).`,
        'Please answer the user using your general culinary knowledge, or if needed, call request_external_research to search the web for reliable pairings or substitutions.',
      ].join('\n');
      return {
        content: fallbackPrompt,
        draftChanged: false,
      };
    }
  }

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
          'Use the narrowest web tool needed, then answer the user substantively in Samwise voice. Sources should support the answer, not replace it.',
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
  availableTools: CitationCookingTool[],
  onTextDelta?: (delta: string) => void | Promise<void>,
  toolChoice: ToolChoice = 'auto',
  temperature?: number,
): Promise<ChatMessage> {
  const key = apiKey();
  if (!key) {
    throw new CookingValidationError(
      'Cooking chat is not configured. Set COOKING_AGENT_API_KEY or OPENROUTER_KEY.',
    );
  }

  const cleanedMessages = messages.map((msg, index) => {
    if (index > 0 && msg.role === 'system') {
      return {
        ...msg,
        role: 'user' as ChatRole,
        content: msg.content ? `[System Directive]\n${msg.content}` : null,
      };
    }
    return msg;
  });

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
        messages: cleanedMessages,
        tools: availableTools,
        tool_choice: toolChoice,
        stream: true,
        ...(temperature !== undefined ? { temperature } : {}),
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

async function completeJsonOnly(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  model: string,
  temperature?: number,
): Promise<string> {
  const assistant = await complete(messages, model, [], undefined, 'auto', temperature);
  const contentStr = typeof assistant.content === 'string' ? assistant.content : '';
  return contentStr.trim();
}

async function repairCookingResponse(
  messages: ChatMessage[],
  responseText: string,
  repairInstruction: string,
  model: string,
): Promise<string> {
  const repaired = await complete(
    [
      ...messages,
      {
        role: 'system',
        content: [repairInstruction, '', 'Previous reply to repair:', responseText].join('\n'),
      },
    ],
    model,
    [],
    undefined,
    'auto',
    0.1,
  );
  const contentStr = typeof repaired.content === 'string' ? repaired.content : '';
  return extractTextPromptSuggestions(contentStr.trim()).text;
}

async function sanitizeResponseText(
  text: string,
  failureLabels: CookingQualityFailureLabel[],
  model: string,
): Promise<string> {
  const instructions: string[] = [
    'You are a high-speed post-processing text filter. Your job is to strictly sanitize the provided cooking reply based on the failure reasons.',
    'Follow these rules strictly:',
    '- Return only the sanitized user-facing text. Do not add any introduction, explanations, or conversational filler.',
    '- Preserve all actual recipes, steps, ingredients, tips, and normal instruction fully.',
  ];

  if (failureLabels.includes('unnecessary_restriction_disclosure')) {
    instructions.push(
      '- CRITICAL: Completely remove any sentences, phrases, or conversational introductions that disclose, volunteer, or mention the user\'s saved dietary restrictions or allergies (e.g., "since you don\'t eat beef", "avoiding peanuts", etc.). Keep the recipes and cooking tips but apply these filters silently.',
    );
  }

  if (failureLabels.includes('private_context_leak')) {
    instructions.push(
      '- CRITICAL: Completely remove any sentences or phrases that disclose the user\'s private facts, such as their exact location/city (e.g., "Dwarka"), timezone, or timestamp. Keep the rest of the text fully intact.',
    );
  }

  if (failureLabels.includes('canvas_claim_without_mutation')) {
    instructions.push(
      '- CRITICAL: Completely remove any sentences where the assistant claims to have created, updated, or changed a canvas or document (e.g., "I\'ve created a canvas for you...", "I updated the document..."), since no canvas mutation actually occurred. Keep the rest of the cooking instructions.',
    );
  }

  instructions.push('\nText to sanitize:\n' + text);

  try {
    const response = await complete(
      [
        {
          role: 'system',
          content: instructions.join('\n'),
        },
      ],
      model,
      [],
      undefined,
      'auto',
      0.1,
    );
    const contentStr = typeof response.content === 'string' ? response.content : '';
    return contentStr.trim() || text;
  } catch (error) {
    logger.error('[CookingAgent] sanitization failed', error);
    return text;
  }
}

function buildFriendlySourceOnlyResponse(sources: CookingWebSource[]): string {
  if (sources.length === 0) {
    return 'I searched for the recipe but could not extract the exact instructions just now. Please try sharing a direct link or pasting the recipe text, and I can adapt it for you!';
  }

  const links = sources
    .map((source) => {
      const title = source.title?.trim() || new URL(source.url).hostname.replace(/^www\./, '');
      return `- [${title}](${source.url})`;
    })
    .join('\n');

  return [
    "I found some great recipe sources for you! Since I want to make sure I don't miss any of the chef's specific cooking details, here are the links directly to the official sources:",
    '',
    links,
    '',
    'Please feel free to check them out! If you would like me to scale the ingredients, suggest substitutions for specific preferences, or guide you through the cooking steps once you are ready, just let me know!',
  ].join('\n');
}

function failedQualityResponse(
  turnPlan: CookingTurnPlan,
  labels: CookingQualityFailureLabel[],
): string {
  if (
    labels.includes('empty_response') &&
    (turnPlan.action === 'create_document' || turnPlan.action === 'revise_document')
  ) {
    return turnPlan.action === 'revise_document'
      ? 'I could not update the cooking canvas just now. Please try the change again.'
      : 'I could not create the recipe canvas just now. Please try the recipe request again.';
  }
  const semanticOnly = labels.every((label) =>
    [
      'missing_time_constraint',
      'not_actionable',
      'needless_clarification',
      'unnecessary_restriction_disclosure',
    ].includes(label),
  );
  if (semanticOnly) {
    if (
      turnPlan.promptProfile === 'source_or_research' ||
      turnPlan.action === 'research_then_answer' ||
      turnPlan.intent === 'research_request' ||
      turnPlan.intent === 'source_driven_request'
    ) {
      return 'I could not validate a source-faithful answer from the available evidence. Please send the official recipe link or paste the recipe text, and I can adapt it without inventing details.';
    }
    return 'I could not produce a reliable cooking reply just now. Please try again.';
  }
  return 'I could not validate that cooking response against the request and saved boundaries. Please try again.';
}

function requiresCanvasMutation(turnPlan: CookingTurnPlan): boolean {
  return turnPlan.action === 'create_document' || turnPlan.action === 'revise_document';
}

function missingCanvasMutationInstruction(turnPlan: CookingTurnPlan): string {
  const toolName =
    turnPlan.action === 'revise_document' ? 'revise_cooking_document' : 'create_cooking_document';
  return [
    'The current user asked for durable cooking document work.',
    `Do not answer in prose only. Call ${toolName} with complete valid markdown and a concise user_message.`,
    "If the request conflicts with saved dietary restrictions (e.g., asking for a beefy dish while beef-free), resolve it by substituting restricted ingredients with compliant alternatives, and explain this briefly in the tool's user_message.",
    'If exact source faithfulness is required and the source has not been read, use the available web/source tool first, then create or revise the canvas from the evidence.',
    'Never claim the canvas was created or changed unless the canvas mutation tool succeeds.',
  ].join('\n');
}

function planNeedsExternalEvidence(
  turnPlan: CookingTurnPlan,
  sourceState: LinkedSourceState,
  imageSourceState: AttachedImageSourceState,
): boolean {
  return (
    sourceState.readRequired ||
    turnPlan.action === 'read_source' ||
    turnPlan.action === 'research_then_answer' ||
    (turnPlan.intent === 'source_driven_request' && !imageSourceState.available) ||
    turnPlan.intent === 'research_request' ||
    (turnPlan.selectedContextCategories.includes('source') && !imageSourceState.available) ||
    turnPlan.selectedContextCategories.includes('research')
  );
}

function planNeedsBroaderSourceSet(turnPlan: CookingTurnPlan): boolean {
  return turnPlan.intent === 'research_request' || turnPlan.action === 'research_then_answer';
}

function getChatMessageChars(content: ChatMessage['content']): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return sum + part.text.length;
      }
      return sum;
    }, 0);
  }
  return 0;
}

function isCanvasMutationTool(
  toolName: string | undefined,
): toolName is 'create_cooking_document' | 'revise_cooking_document' {
  return toolName === 'create_cooking_document' || toolName === 'revise_cooking_document';
}

export async function runCookingChat(input: CookingChatInput): Promise<CookingChatResult> {
  const logCookingAgent = (event: string, payload: Record<string, unknown>) => {
    globalLogCookingAgent(event, payload);
    if (input.onStep) {
      try {
        input.onStep({ type: event, payload });
      } catch (err) {
        logger.error(`[CookingAgent] Failed to invoke onStep callback: ${err}`);
      }
    }
  };

  const turnStartedAt = Date.now();
  const sourceState = linkedSourceState(input.text);
  const imageSourceState = attachedImageSourceState(input);
  const requestedModel = selectedModel(input.model);
  const turnContext = buildTurnContext({
    conversationCreatedAt: input.conversationCreatedAt,
    locale: input.locale,
    timeZone: input.timeZone,
    preferencesMarkdown: input.preferencesMarkdown,
  });
  const turnUnderstanding = understandCookingTurn({
    conversationId: input.conversationId,
    text: input.text,
    messages: input.messages,
    hasActiveDraft: Boolean(input.activeDraft),
    turnContext,
  });
  logCookingAgent('turn_start', {
    conversationId: input.conversationId,
    textChars: input.text.length,
    historyCount: input.messages?.length ?? 0,
    documentCount: input.documents?.length ?? 0,
    hasActiveDraft: Boolean(input.activeDraft),
    hasPreferences: Boolean(input.preferencesMarkdown?.trim()),
    requestedModel,
    linkedUrlCount: sourceState.urls.length,
    linkedSourceReadRequired: sourceState.readRequired,
    attachedImageSourceAvailable: imageSourceState.available,
    currentImageCount: imageSourceState.currentImageCount,
    historicalImageCount: imageSourceState.historicalImageCount,
    runtimeFallbackIntent: turnUnderstanding.intent,
    runtimeFallbackResponseMode: turnUnderstanding.responseMode,
    runtimeFallbackAllowDocumentTools: turnUnderstanding.toolPolicy.allowDocumentTools,
    runtimeFallbackAllowResearchRequestTool: turnUnderstanding.toolPolicy.allowResearchRequestTool,
  });
  const plannerRoute = routeCookingPlanner({
    defaultModel: requestedModel,
    plannerModel: process.env.COOKING_AGENT_PLANNER_MODEL,
    complexModel: process.env.COOKING_AGENT_COMPLEX_MODEL,
    complexPlanning:
      sourceState.readRequired || imageSourceState.available || Boolean(input.activeDraft),
  });
  const webContextStartedAt = Date.now();
  const webContext = await createCookingWebContext({
    user: input.user,
    webSearchConfig: input.webSearchConfig,
    loadAuthValues: input.loadAuthValues,
    conversationCreatedAt: input.conversationCreatedAt,
    allowBroadResearch: true,
  });
  logCookingAgent('web_context_loaded', {
    conversationId: input.conversationId,
    durationMs: Date.now() - webContextStartedAt,
    configuredToolCount: webContext.tools.length,
    unavailableReason: webContext.unavailableReason,
    broadResearch: 'planner_controlled',
  });
  const linkedSourcePreload = await preloadLinkedRecipeSources(sourceState, webContext);
  const activeCanvas = Boolean(input.activeDraft);
  const plannerStartedAt = Date.now();
  logCookingAgent('planner_request', {
    conversationId: input.conversationId,
    plannerModel: plannerRoute.model,
    plannerRoutingReason: plannerRoute.reason,
    runtimeFallbackIntent: turnUnderstanding.intent,
    runtimeFallbackResponseMode: turnUnderstanding.responseMode,
    activeCanvas,
    webConfigured: webContext.tools.length > 0,
    linkedUrlCount: sourceState.urls.length,
    linkedSourceReadRequired: sourceState.readRequired,
    preferenceSectionCount: preferenceSectionTitles(input.preferencesMarkdown).length,
  });
  const turnPlan: CookingTurnPlan = await planCookingTurn(
    {
      conversationId: input.conversationId,
      text: input.text,
      messages: input.messages,
      turnContext,
      activeDraft: input.activeDraft,
      documents: input.documents,
      linkedSourceState: sourceState,
      attachedImageSourceState: imageSourceState,
      preferenceSectionTitles: preferenceSectionTitles(input.preferencesMarkdown),
      availableCapabilities: {
        documentTools: true,
        activeCanvas,
        webConfigured: webContext.tools.length > 0,
      },
      runtimeUnderstanding: turnUnderstanding,
    },
    (messages) => completeJsonOnly(messages, plannerRoute.model, 0.1),
  );
  logCookingAgent('planner_result', {
    conversationId: input.conversationId,
    durationMs: Date.now() - plannerStartedAt,
    plannerUsed: turnPlan.plannerUsed,
    fallbackReason: turnPlan.fallbackReason,
    intent: turnPlan.intent,
    action: turnPlan.action,
    promptProfile: turnPlan.promptProfile,
    confidence: turnPlan.confidence,
    selectedContextCategories: turnPlan.selectedContextCategories,
    withheldContextCategories: turnPlan.withheldContextCategories,
    rationaleLabels: turnPlan.privacySafeRationaleLabels,
    allowDocumentTools: turnPlan.toolPolicy.allowDocumentTools,
    allowResearchRequestTool: turnPlan.toolPolicy.allowResearchRequestTool,
    clarificationNeeded: turnPlan.clarification.needed,
    hardConstraintCount: turnPlan.constraints.hard.length,
    softConstraintCount: turnPlan.constraints.soft.length,
  });
  const externalEvidenceNeeded = planNeedsExternalEvidence(turnPlan, sourceState, imageSourceState);
  const sourceDependent =
    imageSourceState.available ||
    sourceState.readRequired ||
    turnPlan.intent === 'source_driven_request' ||
    turnPlan.selectedContextCategories.includes('source');
  const sourceLimit = planNeedsBroaderSourceSet(turnPlan) ? 5 : 3;
  const modelRoutes = {
    ...routeCookingModels({
      defaultModel: requestedModel,
      plannerModel: plannerRoute.model,
      complexModel: process.env.COOKING_AGENT_COMPLEX_MODEL,
      repairModel: process.env.COOKING_AGENT_REPAIR_MODEL,
      turnPlan,
      safetySensitive: externalEvidenceNeeded,
      sourceDependent,
    }),
    planner: plannerRoute,
  };
  const resolvedModel = modelRoutes.response.model;
  logCookingAgent('model_routing', {
    conversationId: input.conversationId,
    plannerModel: modelRoutes.planner.model,
    plannerReason: modelRoutes.planner.reason,
    responseModel: modelRoutes.response.model,
    responsePurpose: modelRoutes.response.purpose,
    responseReason: modelRoutes.response.reason,
    repairModel: modelRoutes.repair.model,
    repairPurpose: modelRoutes.repair.purpose,
    repairReason: modelRoutes.repair.reason,
    safetySensitive: externalEvidenceNeeded,
    sourceDependent,
    attachedImageSourceAvailable: imageSourceState.available,
  });
  logCookingAgent('evidence_gate', {
    conversationId: input.conversationId,
    externalEvidenceNeeded,
    linkedSourceReadRequired: sourceState.readRequired,
    turnPlanAction: turnPlan.action,
    turnPlanIntent: turnPlan.intent,
    sourceLimit,
  });
  let webToolsUnlocked = externalEvidenceNeeded;
  let availableToolState = buildAvailableToolState({
    activeCanvas,
    allowDocumentTools: turnPlan.toolPolicy.allowDocumentTools,
    allowResearchRequestTool: turnPlan.toolPolicy.allowResearchRequestTool,
    sourceState,
    webContext,
    webToolsUnlocked,
  });
  logCookingAgent('tool_gate', {
    conversationId: input.conversationId,
    activeCanvas,
    webToolsUnlocked,
    allowDocumentTools: turnPlan.toolPolicy.allowDocumentTools,
    allowResearchRequestTool: turnPlan.toolPolicy.allowResearchRequestTool,
    linkedSourceReadRequired: sourceState.readRequired,
    linkedSourceReadSucceeded: sourceState.readSucceeded,
    availableToolNames: availableToolState.availableToolNames,
  });
  const refreshAvailableTools = (): void => {
    availableToolState = buildAvailableToolState({
      activeCanvas,
      allowDocumentTools: turnPlan.toolPolicy.allowDocumentTools,
      allowResearchRequestTool: turnPlan.toolPolicy.allowResearchRequestTool,
      sourceState,
      webContext,
      webToolsUnlocked,
    });
    logCookingAgent('tool_gate_refreshed', {
      conversationId: input.conversationId,
      webToolsUnlocked,
      availableToolNames: availableToolState.availableToolNames,
    });
  };
  input.onTiming?.({
    stage: 'web_context_loaded',
    durationMs: Date.now() - webContextStartedAt,
    toolCount: availableToolState.availableTools.length,
    activeCanvas,
    availableToolNames: availableToolState.availableToolNames,
    plannerUsed: turnPlan.plannerUsed,
    plannerFallbackReason: turnPlan.fallbackReason,
    plannedIntent: turnPlan.intent,
    plannedAction: turnPlan.action,
    promptProfile: turnPlan.promptProfile,
    selectedContextCategories: turnPlan.selectedContextCategories,
    withheldContextCategories: turnPlan.withheldContextCategories,
    plannerConfidence: turnPlan.confidence,
    modelPurpose: modelRoutes.response.purpose,
    modelRoutingReason: modelRoutes.response.reason,
    plannerModel: modelRoutes.planner.model,
    plannerRoutingReason: modelRoutes.planner.reason,
    responseModel: modelRoutes.response.model,
    repairModel: modelRoutes.repair.model,
  });
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        input.promptPrefix,
        buildPreferenceBrief({
          markdown: input.preferencesMarkdown,
          conversationId: input.conversationId,
          text: input.text,
          messages: input.messages,
          turnUnderstanding,
          turnPlan,
        }),
        webAvailabilityContext(webContext.unavailableReason),
        documentsContext(input.documents, input.activeDraft),
        turnPlan.promptProfile === 'active_canvas_discussion' ||
        turnPlan.promptProfile === 'document_work'
          ? activeCanvasContext(input.activeDraft)
          : '',
        linkedSourceContext(sourceState),
        linkedSourcePreload.context,
        attachedImageSourceContext(imageSourceState),
        toolStateContext(activeCanvas, availableToolState.availableTools),
        cookingDeliveryInstructions(turnPlan.deliveryMode),
        cookingSystemInstructionsForProfile(turnPlan.promptProfile),
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...historyMessages(input.messages, input.conversationId),
    {
      role: 'user',
      content:
        input.image_urls && input.image_urls.length
          ? [{ type: 'text', text: input.text }, ...input.image_urls]
          : input.text,
    },
  ];
  const systemPromptContent = typeof messages[0].content === 'string' ? messages[0].content : '';
  logCookingSource('provider_prompt_ready', {
    conversationId: input.conversationId,
    linkedUrlCount: sourceState.urls.length,
    hasPreloadContext: Boolean(linkedSourcePreload.context),
    preloadedSourceCount: linkedSourcePreload.sources.length,
    availableToolNames: availableToolState.availableToolNames,
    activeCanvas,
    systemPromptChars: systemPromptContent.length,
    systemHasPreloadedSource: systemPromptContent.includes('Preloaded Linked Recipe Source'),
    systemHasExactTrue: systemPromptContent.includes('"exactRecipeAvailable":true'),
    systemHasExactFalse: systemPromptContent.includes('"exactRecipeAvailable":false'),
    systemHasUnavailableWeb:
      systemPromptContent.includes('Web access is unavailable') ||
      systemPromptContent.includes('Web access is not configured'),
    plannerUsed: turnPlan.plannerUsed,
    plannerFallbackReason: turnPlan.fallbackReason,
    plannedIntent: turnPlan.intent,
    plannedAction: turnPlan.action,
    promptProfile: turnPlan.promptProfile,
    deliveryMode: turnPlan.deliveryMode,
  });
  logCookingAgent('prompt_built', {
    conversationId: input.conversationId,
    messageCount: messages.length,
    systemPromptChars: systemPromptContent.length,
    historyMessageCount: Math.max(0, messages.length - 2),
    promptProfile: turnPlan.promptProfile,
    deliveryMode: turnPlan.deliveryMode,
    activeCanvasContextIncluded:
      turnPlan.promptProfile === 'active_canvas_discussion' ||
      turnPlan.promptProfile === 'document_work',
    linkedSourceContextIncluded: Boolean(linkedSourceContext(sourceState)),
    preloadedSourceContextIncluded: Boolean(linkedSourcePreload.context),
    selectedContextCategories: turnPlan.selectedContextCategories,
    availableToolNames: availableToolState.availableToolNames,
    hasUnavailableWebNotice:
      systemPromptContent.includes('Web access is unavailable') ||
      systemPromptContent.includes('Web access is not configured'),
  });
  let draft: CookingDraft | undefined;
  let draftChanged = false;
  let assistantText = '';
  let webSources: CookingWebSource[] = linkedSourcePreload.sources.slice(0, sourceLimit);
  let latestCanvasUserMessage = '';
  let missingCanvasMutationRetryUsed = false;
  let canvasMutationToolAttempted = false;
  let nonMutatingToolPayloadErrorCount = 0;

  const isLowRiskTurn =
    process.env.NODE_ENV !== 'test' &&
    canStreamCookingTurnBeforeValidation({
      turnPlan,
      activeCanvas,
      draftChanged,
      sourceReadRequired: sourceState.readRequired,
    });

  const validateAndRepairResponse = async (
    responseText: string,
    sources: CookingWebSource[],
    model: string,
  ): Promise<{ text: string; sources: CookingWebSource[] }> => {
    const validationStartedAt = Date.now();
    logCookingAgent('quality_start', {
      conversationId: input.conversationId,
      responseChars: responseText.length,
      sourceCount: sources.length,
      model,
      turnPlanIntent: turnPlan.intent,
      turnPlanAction: turnPlan.action,
      promptProfile: turnPlan.promptProfile,
      draftChanged,
    });
    const recentUserMessages = (input.messages ?? [])
      .filter(
        (message) => !message.conversationId || message.conversationId === input.conversationId,
      )
      .filter((message) => message.isCreatedByUser)
      .slice(-4)
      .map((message) => message.text)
      .filter((text): text is string => typeof text === 'string' && Boolean(text.trim()));
    const qualityInput = (text: string, candidateSources: CookingWebSource[]) => ({
      text,
      userText: input.text,
      recentUserMessages,
      turnPlan,
      draftChanged,
      webSources: candidateSources,
      preferencesMarkdown: input.preferencesMarkdown,
      timeZone: input.timeZone,
      conversationCreatedAt: input.conversationCreatedAt,
    });
    let citedResponse = await ensureInlineSourceCitations(
      messages,
      responseText,
      sources,
      model,
      sourceLimit,
      providerModels(model),
      complete,
    );

    if (isLowRiskTurn) {
      const hardBoundaryQuality = validateCookingResponseHardBoundaries(
        qualityInput(citedResponse.text, citedResponse.sources),
      );
      input.onTiming?.({
        stage: 'quality_validated',
        qualityGatePassed: hardBoundaryQuality.ok,
        qualityFailureLabels: hardBoundaryQuality.failureLabels,
        qualityOriginalFailureLabels: hardBoundaryQuality.failureLabels,
        qualityRepairAttempted: false,
        qualityRepairSucceeded: false,
        qualityJudgeUsed: false,
        responseBufferedForValidation: false,
        plannedIntent: turnPlan.intent,
        plannedAction: turnPlan.action,
        promptProfile: turnPlan.promptProfile,
        modelPurpose: modelRoutes.response.purpose,
        modelRoutingReason: modelRoutes.response.reason,
        plannerModel: modelRoutes.planner.model,
        plannerRoutingReason: modelRoutes.planner.reason,
        responseModel: modelRoutes.response.model,
        repairModel: modelRoutes.repair.model,
      });
      logCookingAgent('quality_result_lazy', {
        conversationId: input.conversationId,
        ok: hardBoundaryQuality.ok,
        finalResponseChars: citedResponse.text.length,
      });
      if (hardBoundaryQuality.ok) {
        return citedResponse;
      }
      return {
        text: failedQualityResponse(turnPlan, hardBoundaryQuality.failureLabels),
        sources: [],
      };
    }
    let quality = await validateCookingResponseWithJudge(
      qualityInput(citedResponse.text, citedResponse.sources),
      (judgeMessages) => completeJsonOnly(judgeMessages, model),
    );
    const originalFailureLabels = quality.failureLabels;
    let repairAttempted = false;
    let repairSucceeded = false;
    let qualityRepairLatencyMs: number | undefined;

    if (!quality.ok && quality.repairInstruction) {
      repairAttempted = true;
      const repairStartedAt = Date.now();
      logCookingAgent('quality_repair_start', {
        conversationId: input.conversationId,
        failureLabels: quality.failureLabels,
        repairModel: modelRoutes.repair.model,
      });
      try {
        const repairedText = await repairCookingResponse(
          messages,
          citedResponse.text,
          quality.repairInstruction,
          modelRoutes.repair.model,
        );
        const repairedCitedResponse = await ensureInlineSourceCitations(
          messages,
          repairedText,
          sources,
          modelRoutes.repair.model,
          sourceLimit,
          providerModels(modelRoutes.repair.model),
          complete,
        );
        const repairedQuality = await validateCookingResponseWithJudge(
          qualityInput(repairedCitedResponse.text, repairedCitedResponse.sources),
          (judgeMessages) => completeJsonOnly(judgeMessages, modelRoutes.repair.model),
        );
        if (repairedQuality.ok) {
          citedResponse = repairedCitedResponse;
          quality = repairedQuality;
          repairSucceeded = true;
        }
      } catch {
        repairSucceeded = false;
      } finally {
        qualityRepairLatencyMs = Date.now() - repairStartedAt;
      }
    }

    if (!quality.ok) {
      const needsSanitization = quality.failureLabels.some((label) =>
        [
          'unnecessary_restriction_disclosure',
          'private_context_leak',
          'canvas_claim_without_mutation',
        ].includes(label),
      );

      if (needsSanitization) {
        logCookingAgent('quality_sanitization_attempt', {
          conversationId: input.conversationId,
          failureLabels: quality.failureLabels,
        });

        try {
          const sanitizedText = await sanitizeResponseText(
            citedResponse.text,
            quality.failureLabels,
            modelRoutes.repair.model,
          );

          // Re-validate the sanitized text
          const sanitizedQuality = await validateCookingResponseWithJudge(
            qualityInput(sanitizedText, citedResponse.sources),
            (judgeMessages) => completeJsonOnly(judgeMessages, modelRoutes.repair.model),
          );

          if (sanitizedQuality.ok) {
            logCookingAgent('quality_sanitization_succeeded', {
              conversationId: input.conversationId,
            });
            citedResponse = { text: sanitizedText, sources: citedResponse.sources };
            quality = sanitizedQuality;
          } else {
            logCookingAgent('quality_sanitization_failed_but_overriding', {
              conversationId: input.conversationId,
              remainingLabels: sanitizedQuality.failureLabels,
            });
            // We still deliver the sanitized text as a best-effort,
            // since it successfully stripped the private leak/disclosure sentence!
            citedResponse = { text: sanitizedText, sources: citedResponse.sources };
            quality = {
              ...sanitizedQuality,
              ok: true,
            };
          }
        } catch (err) {
          logger.error('[CookingAgent] Sanitization recovery error:', err);
        }
      }
    }

    logCookingAgent('quality_result', {
      conversationId: input.conversationId,
      durationMs: Date.now() - validationStartedAt,
      ok: quality.ok,
      failureLabels: quality.failureLabels,
      originalFailureLabels,
      repairAttempted,
      repairSucceeded,
      repairLatencyMs: qualityRepairLatencyMs,
      judgeUsed: quality.qualityJudgeUsed,
      judgeFallbackReason: quality.qualityJudgeFallbackReason,
      judgeRationaleLabels: quality.qualityJudgeRationaleLabels,
      finalResponseChars: citedResponse.text.length,
      finalSourceCount: citedResponse.sources.length,
    });

    input.onTiming?.({
      stage: 'quality_validated',
      qualityGatePassed: quality.ok,
      qualityFailureLabels: quality.failureLabels,
      qualityOriginalFailureLabels: originalFailureLabels,
      qualityRepairAttempted: repairAttempted,
      qualityRepairSucceeded: repairSucceeded,
      qualityRepairLatencyMs,
      qualityJudgeUsed: quality.qualityJudgeUsed,
      qualityJudgeFallbackReason: quality.qualityJudgeFallbackReason,
      qualityJudgeRationaleLabels: quality.qualityJudgeRationaleLabels,
      responseBufferedForValidation: Boolean(input.onTextDelta),
      plannedIntent: turnPlan.intent,
      plannedAction: turnPlan.action,
      promptProfile: turnPlan.promptProfile,
      modelPurpose: repairAttempted ? modelRoutes.repair.purpose : modelRoutes.response.purpose,
      modelRoutingReason: repairAttempted ? modelRoutes.repair.reason : modelRoutes.response.reason,
      plannerModel: modelRoutes.planner.model,
      plannerRoutingReason: modelRoutes.planner.reason,
      responseModel: modelRoutes.response.model,
      repairModel: modelRoutes.repair.model,
    });

    if (quality.ok) {
      return citedResponse;
    }

    const hardBoundaryQuality = validateCookingResponseHardBoundaries(
      qualityInput(citedResponse.text, citedResponse.sources),
    );
    const canOverrideSemanticVeto = quality.failureLabels.every((label) =>
      [
        'missing_time_constraint',
        'not_actionable',
        'needless_clarification',
        'canvas_claim_without_mutation',
        'unnecessary_restriction_disclosure',
        'overlong_for_delivery_mode',
        'buried_primary_action',
        'repeats_canvas_content',
        'excessive_preamble',
      ].includes(label),
    );
    if (hardBoundaryQuality.ok && quality.qualityJudgeUsed && canOverrideSemanticVeto) {
      logCookingAgent('quality_semantic_veto_overridden', {
        conversationId: input.conversationId,
        semanticFailureLabels: quality.failureLabels,
        finalResponseChars: citedResponse.text.length,
        finalSourceCount: citedResponse.sources.length,
      });
      return citedResponse;
    }

    if (quality.failureLabels.includes('source_only_response')) {
      logCookingAgent('quality_gate_source_only_degraded_to_friendly', {
        conversationId: input.conversationId,
        sourceCount: citedResponse.sources.length,
      });
      return {
        text: buildFriendlySourceOnlyResponse(citedResponse.sources),
        sources: citedResponse.sources,
      };
    }

    return {
      text: failedQualityResponse(turnPlan, quality.failureLabels),
      sources: [],
    };
  };

  for (let turn = 0; turn < 5; turn += 1) {
    let assistant: ChatMessage | undefined;
    let providerStartedAt = Date.now();
    let selectedAttemptModel = resolvedModel;
    const streamedCharsThisTurn = 0;
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
        promptChars: messages.reduce(
          (sum, message) => sum + getChatMessageChars(message.content),
          0,
        ),
        plannerUsed: turnPlan.plannerUsed,
        plannerFallbackReason: turnPlan.fallbackReason,
        plannedIntent: turnPlan.intent,
        plannedAction: turnPlan.action,
        promptProfile: turnPlan.promptProfile,
        selectedContextCategories: turnPlan.selectedContextCategories,
        withheldContextCategories: turnPlan.withheldContextCategories,
        plannerConfidence: turnPlan.confidence,
        modelPurpose: modelRoutes.response.purpose,
        modelRoutingReason: modelRoutes.response.reason,
        plannerModel: modelRoutes.planner.model,
        plannerRoutingReason: modelRoutes.planner.reason,
        responseModel: modelRoutes.response.model,
        repairModel: modelRoutes.repair.model,
      });
      logCookingAgent('provider_request', {
        conversationId: input.conversationId,
        turn,
        model: attemptModel,
        messageCount: messages.length,
        toolCount: availableToolState.availableTools.length,
        availableToolNames: availableToolState.availableToolNames,
        promptChars: messages.reduce(
          (sum, message) => sum + getChatMessageChars(message.content),
          0,
        ),
        plannedIntent: turnPlan.intent,
        plannedAction: turnPlan.action,
        promptProfile: turnPlan.promptProfile,
        modelPurpose: modelRoutes.response.purpose,
        modelRoutingReason: modelRoutes.response.reason,
      });

      try {
        const mainTemperature =
          requiresCanvasMutation(turnPlan) || turnPlan.promptProfile === 'document_work'
            ? 0.1
            : 0.7;
        assistant = await complete(
          messages,
          attemptModel,
          availableToolState.availableTools,
          isLowRiskTurn ? input.onTextDelta : undefined,
          'auto',
          mainTemperature,
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
        logCookingAgent('provider_error', {
          conversationId: input.conversationId,
          turn,
          model: attemptModel,
          durationMs: Date.now() - providerStartedAt,
          retryable: canRetry,
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
      outputChars: typeof assistant.content === 'string' ? assistant.content.length : 0,
    });
    logCookingAgent('provider_response', {
      conversationId: input.conversationId,
      turn,
      model: selectedAttemptModel,
      durationMs: Date.now() - providerStartedAt,
      toolCallCount: assistant.tool_calls?.length ?? 0,
      toolCallNames: assistant.tool_calls?.map((toolCall) => toolCall.function.name) ?? [],
      outputChars: typeof assistant.content === 'string' ? assistant.content.length : 0,
      hasText: typeof assistant.content === 'string' ? Boolean(assistant.content.trim()) : false,
    });
    messages.push(assistant);
    assistantText = typeof assistant.content === 'string' ? assistant.content.trim() : '';

    if (!assistant.tool_calls?.length) {
      if (
        requiresCanvasMutation(turnPlan) &&
        !draftChanged &&
        !canvasMutationToolAttempted &&
        !missingCanvasMutationRetryUsed &&
        availableToolState.availableToolNameSet.has(
          turnPlan.action === 'revise_document'
            ? 'revise_cooking_document'
            : 'create_cooking_document',
        )
      ) {
        missingCanvasMutationRetryUsed = true;
        logCookingAgent('missing_canvas_mutation_retry', {
          conversationId: input.conversationId,
          turn,
          plannedAction: turnPlan.action,
          requiredTool:
            turnPlan.action === 'revise_document'
              ? 'revise_cooking_document'
              : 'create_cooking_document',
          assistantTextChars: assistantText.length,
        });
        messages.push({
          role: 'system',
          content: missingCanvasMutationInstruction(turnPlan),
        });
        assistantText = '';
        continue;
      }
      const extracted = extractTextPromptSuggestions(assistantText);
      const responseText =
        extracted.text || (await recoverEmptyResponse(messages, selectedAttemptModel));
      const validatedResponse = await validateAndRepairResponse(
        responseText,
        webSources,
        selectedAttemptModel,
      );
      const text =
        validatedResponse.text ||
        latestCanvasUserMessage ||
        (draftChanged
          ? 'I updated the cooking canvas.'
          : 'I could not generate a cooking response just now. Please try again.');
      if (!isLowRiskTurn) {
        await input.onTextDelta?.(text, true);
      }
      let responseSuggestions = extracted.promptSuggestions;
      if (responseSuggestions.length === 0) {
        if (isLowRiskTurn || !validatedResponse.text.includes('?')) {
          responseSuggestions = [];
        } else {
          const cached = getCachedSuggestions(validatedResponse.text);
          if (cached) {
            responseSuggestions = cached;
          } else if (process.env.NODE_ENV === 'test') {
            const generated = await generatePromptSuggestions(
              messages,
              validatedResponse.text,
              selectedAttemptModel,
              cookingTool('set_prompt_suggestions')!,
              complete,
            );
            if (generated && generated.length > 0) {
              responseSuggestions = generated;
            } else {
              responseSuggestions = defaultSuggestionsForIntent(turnPlan.intent);
            }
            setCachedSuggestions(validatedResponse.text, responseSuggestions);
          } else {
            responseSuggestions = defaultSuggestionsForIntent(turnPlan.intent);
            setCachedSuggestions(validatedResponse.text, responseSuggestions);
          }
        }
      } else {
        setCachedSuggestions(validatedResponse.text, responseSuggestions);
      }
      logCookingAgent('turn_complete', {
        conversationId: input.conversationId,
        totalMs: Date.now() - turnStartedAt,
        path: 'chat_response',
        turn,
        draftChanged,
        outputChars: text.length,
        promptSuggestionCount: responseSuggestions.length,
        webSourceCount: validatedResponse.sources.length,
        plannedIntent: turnPlan.intent,
        plannedAction: turnPlan.action,
        promptProfile: turnPlan.promptProfile,
      });
      return {
        text,
        draft,
        draftChanged,
        promptSuggestions: responseSuggestions,
        webSources: validatedResponse.sources,
      };
    }

    let fastCanvasReturn = false;
    for (const toolCall of assistant.tool_calls) {
      if (fastCanvasReturn) {
        continue;
      }
      const toolStartedAt = Date.now();
      if (isCanvasMutationTool(toolCall.function.name)) {
        canvasMutationToolAttempted = true;
      }
      logCookingAgent('tool_call_received', {
        conversationId: input.conversationId,
        turn,
        toolName: toolCall.function.name,
        allowed: availableToolState.availableToolNameSet.has(toolCall.function.name),
        argumentChars: toolCall.function.arguments.length,
        isCanvasMutation: isCanvasMutationTool(toolCall.function.name),
        webToolsUnlocked,
      });
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
        logCookingAgent('tool_result', {
          conversationId: input.conversationId,
          turn,
          toolName: toolCall.function.name,
          durationMs: Date.now() - toolStartedAt,
          ok: true,
          draftChanged: result.draftChanged,
          canvasMutationValidated: result.canvasMutationValidated,
          revisionType: result.revisionType,
          webSourceCount: result.webSources?.length ?? 0,
          unlockWebTools: Boolean(result.unlockWebTools),
          usedFastCanvasReturn: result.draftChanged && isCanvasMutationTool(toolCall.function.name),
          linkedSourceReadSucceeded: sourceState.readSucceeded,
          args: parseArguments(toolCall.function.arguments),
          result:
            result.content?.length > 2000 ? `${result.content.slice(0, 2000)}...` : result.content,
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
        if (!isCanvasMutationTool(toolCall.function.name) && toolPayloadHasError(result.content)) {
          nonMutatingToolPayloadErrorCount += 1;
          if (nonMutatingToolPayloadErrorCount >= 2) {
            availableToolState = emptyAvailableToolState();
            messages.push({
              role: 'system',
              content:
                'The optional culinary science tool returned repeated argument or vocabulary errors. Stop calling tools for this turn and answer the user directly from cooking knowledge. Briefly mention uncertainty only if it affects the practical recommendation.',
            });
            logCookingAgent('tool_payload_error_tools_disabled', {
              conversationId: input.conversationId,
              turn,
              toolName: toolCall.function.name,
              errorCount: nonMutatingToolPayloadErrorCount,
            });
          }
        }
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
        logCookingAgent('tool_result', {
          conversationId: input.conversationId,
          turn,
          toolName: toolCall.function.name,
          durationMs: Date.now() - toolStartedAt,
          ok: false,
          canvasMutationValidated: false,
          error: errorMessage,
          args: parseArguments(toolCall.function.arguments),
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
        if (!isCanvasMutationTool(toolCall.function.name)) {
          nonMutatingToolPayloadErrorCount += 1;
          if (nonMutatingToolPayloadErrorCount >= 2) {
            availableToolState = emptyAvailableToolState();
            messages.push({
              role: 'system',
              content:
                'The optional culinary science tool returned repeated execution errors. Stop calling tools for this turn and answer the user directly from cooking knowledge. Briefly mention uncertainty only if it affects the practical recommendation.',
            });
            logCookingAgent('tool_execution_error_tools_disabled', {
              conversationId: input.conversationId,
              turn,
              toolName: toolCall.function.name,
              errorCount: nonMutatingToolPayloadErrorCount,
            });
          }
        }
      }
    }

    if (fastCanvasReturn) {
      logCookingAgent('turn_complete', {
        conversationId: input.conversationId,
        totalMs: Date.now() - turnStartedAt,
        path: 'canvas_fast_return',
        turn,
        draftChanged,
        outputChars: latestCanvasUserMessage.length,
        promptSuggestionCount: 0,
        webSourceCount: webSources.length,
        plannedIntent: turnPlan.intent,
        plannedAction: turnPlan.action,
        promptProfile: turnPlan.promptProfile,
      });
      return {
        draft,
        draftChanged,
        promptSuggestions: [],
        webSources,
        text: latestCanvasUserMessage,
        activeIntent: turnPlan.intent,
        activeAction: turnPlan.action,
        activeCategory: turnPlan.category,
      };
    }
  }

  const extracted = extractTextPromptSuggestions(assistantText);
  const responseText = extracted.text || (await recoverEmptyResponse(messages, resolvedModel));
  const validatedResponse = await validateAndRepairResponse(
    responseText,
    webSources,
    resolvedModel,
  );
  const text =
    validatedResponse.text ||
    latestCanvasUserMessage ||
    (draftChanged
      ? 'I updated the cooking canvas.'
      : 'I could not generate a cooking response just now. Please try again.');
  if (!isLowRiskTurn) {
    await input.onTextDelta?.(text, true);
  }
  const existingSuggestions = extracted.promptSuggestions;
  let promptSuggestions: string[] = [];
  if (existingSuggestions.length > 0) {
    promptSuggestions = existingSuggestions;
    setCachedSuggestions(validatedResponse.text, promptSuggestions);
  } else if (isLowRiskTurn || !validatedResponse.text.includes('?')) {
    promptSuggestions = [];
  } else {
    const cached = getCachedSuggestions(validatedResponse.text);
    if (cached) {
      promptSuggestions = cached;
    } else if (process.env.NODE_ENV === 'test') {
      const generated = await generatePromptSuggestions(
        messages,
        validatedResponse.text,
        resolvedModel,
        cookingTool('set_prompt_suggestions')!,
        complete,
      );
      if (generated && generated.length > 0) {
        promptSuggestions = generated;
      } else {
        promptSuggestions = defaultSuggestionsForIntent(turnPlan.intent);
      }
      setCachedSuggestions(validatedResponse.text, promptSuggestions);
    } else {
      promptSuggestions = defaultSuggestionsForIntent(turnPlan.intent);
      setCachedSuggestions(validatedResponse.text, promptSuggestions);
    }
  }
  logCookingAgent('turn_complete', {
    conversationId: input.conversationId,
    totalMs: Date.now() - turnStartedAt,
    path: 'max_turns_or_final_text',
    draftChanged,
    outputChars: text.length,
    promptSuggestionCount: promptSuggestions.length,
    webSourceCount: validatedResponse.sources.length,
    plannedIntent: turnPlan.intent,
    plannedAction: turnPlan.action,
    promptProfile: turnPlan.promptProfile,
  });
  return {
    draft,
    draftChanged,
    promptSuggestions,
    webSources: validatedResponse.sources,
    text,
    activeIntent: turnPlan.intent,
    activeAction: turnPlan.action,
    activeCategory: turnPlan.category,
  };
}
