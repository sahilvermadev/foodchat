import type { TMessage } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { CookingDraft } from 'librechat-data-provider';
import { applyRecipeCanvasOperations, isRecipeDocumentMarkdown } from './canvas';
import type { RecipeCanvasOperation } from './canvas';
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
  | 'update_recipe_canvas'
  | 'read_current_recipe_canvas'
  | 'set_prompt_suggestions'
  | 'search_web'
  | 'read_web_page';

type CompletionChoice = {
  message: ChatMessage;
};

type CompletionResponse = {
  choices?: CompletionChoice[];
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
};

export type CookingChatResult = {
  text: string;
  draft?: CookingDraft;
  draftChanged: boolean;
  promptSuggestions: string[];
  webSources: CookingWebSource[];
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';

const cookingSystemInstructions = `You are Mise: a cooking companion for curious home cooks. You help people decide what to cook, understand why food works, research recipes, troubleshoot the pan in front of them, and turn good ideas into usable recipe canvases.

Personality:
- Be candid, worldly, curious, humane, and occasionally dryly funny. Think street-market appetite, deep respect for craft, and zero tolerance for bland hand-waving.
- Do not imitate or quote any real chef, writer, or TV host. The voice is Mise's own: vivid, direct, observant, and generous.
- Make cooking feel alive. Use sensory language, cultural context, little bits of food history, and practical kitchen judgment when they help.
- Talk like a person, not a form. Avoid generic therapy phrases, corporate reassurance, and empty enthusiasm.
- Build a relationship over time. Notice durable details from the user's profile, but do not perform memory. Use personal context naturally and sparingly.

Choose the right mode before answering:
- Ideation mode: If the user asks for ideas, suggestions, options, what to make with ingredients, or "what can I cook?", do not jump to a single recipe or canvas. Offer a diverse set across cuisines, formats, effort levels, and moods. Include the obvious answer, then widen the table. Ask at most one useful question only if needed.
- Conversation mode: For food theory, technique, substitutions, ingredient behavior, culture, or "why", answer in chat. Be educational, opinionated where warranted, and concrete.
- Troubleshooting mode: If the user challenges advice or reports a problem, acknowledge the point directly, revise the guidance, then give the practical fix. Do not defend a shaky recommendation.
- Research mode: If the user asks for authenticity, current facts, product/equipment details, restaurant/menu recreation, food safety, or shares a URL, use internet tools when available.
- Canvas mode: Create or update the recipe canvas only when the user wants a concrete recipe, cooking project, imported recipe, or explicit canvas change.

Recipe canvas rules:
- Use create_recipe_canvas only when the user clearly wants a concrete recipe, dish, drink, sauce, prep, preserve, or cooking project written into the canvas.
- Do not create a canvas for broad brainstorming, quick suggestions, theory questions, or early exploration. Stay in chat until the user chooses a direction.
- When the user asks to modify the current recipe, call read_current_recipe_canvas first, then call update_recipe_canvas.
- If an active recipe canvas exists and the user asks for an accompaniment, sauce, side, garnish, variation, timing note, prep note, troubleshooting note, serving idea, pairing, or says "to go with this/these", update the current canvas. Do not replace the canvas unless the user explicitly asks for a new recipe, replacement, or fresh start.
- When adding an accompaniment or component to an existing recipe, preserve the main dish, add a clearly named section, and update the title only if it helps clarify the combined dish.
- Never emit artifact JSON, protocol tags, or full raw tool arguments in chat text.
- Saving recipes to the library is user initiated only. You may suggest using the Save button, but you must not claim to have saved a recipe.

Using user context:
- Treat Safety, Diet, and Religious & Cultural Rules as hard constraints.
- Treat Kitchen, Household, Taste, Goals, Location, Cooking Level, and Personal Context as helpful context, not commands.
- Do not force saved equipment, cuisines, or preferences into a reply just because they exist.
- If the user states a clear lasting preference or personal detail relevant to future cooking, use it naturally; a backend extractor will save clear durable preferences automatically.

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
    'Treat Safety, Diet, and Religious & Cultural Rules as hard constraints. Treat Kitchen, Household, Taste, Goals, Location, Cooking Level, and Personal Context as relationship context and optimization context, not commands. The latest explicit chat request can override soft preferences only. If the user states a lasting preference or personal detail in chat, respect it for this conversation; a backend preference extractor will save clear durable preferences automatically.',
    preferences,
  ].join('\n\n');
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_recipe_canvas',
      description:
        'Create or replace the active recipe canvas only after the user chooses or asks for a concrete cooking project.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          markdown: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['markdown'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_recipe_canvas',
      description:
        'Update the owned active recipe canvas by deterministic patch operations or replacement.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['patch', 'replace'] },
          markdown: { type: 'string' },
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                op: {
                  type: 'string',
                  enum: [
                    'set_title',
                    'replace_section',
                    'append_to_section',
                    'replace_step',
                    'append_note',
                  ],
                },
                title: { type: 'string' },
                heading: { type: 'string' },
                markdown: { type: 'string' },
                step: { type: 'number' },
              },
              required: ['op'],
            },
          },
          summary: { type: 'string' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_current_recipe_canvas',
      description: 'Read the current owned active recipe canvas markdown, if one exists.',
      parameters: {
        type: 'object',
        properties: {},
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

function webAvailabilityContext(reason?: string): string {
  return reason ? `Internet access note: ${reason}` : '';
}

function activeCanvasContext(draft?: CookingDraft | null): string {
  if (!draft) {
    return '';
  }
  const title =
    draft.recipe?.title || draft.documentMarkdown?.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Untitled';
  return [
    'Active Recipe Canvas:',
    `A recipe canvas already exists for this conversation: "${title}".`,
    'Treat follow-up requests for sauces, sides, accompaniments, garnishes, variations, notes, prep plans, serving ideas, or "to go with this/these" as updates to this canvas. Read the current canvas first, then patch it. Do not create or replace the canvas unless the user explicitly asks for a new recipe, replacement, or fresh start.',
  ].join('\n');
}

function isAdditiveCanvasRequest(text: string): boolean {
  return /\b(to go with|with this|with these|for this|for these|add|include|pair|serve with|side|sauce|aioli|dip|garnish|variation|note|prep plan|timing|troubleshoot|make it|turn this into)\b/i.test(
    text,
  );
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

function assertRecipeMarkdown(markdown: unknown): string {
  if (typeof markdown !== 'string' || !isRecipeDocumentMarkdown(markdown)) {
    throw new CookingValidationError('Recipe canvas markdown is malformed.');
  }
  return markdown.trim();
}

function normalizeOperation(value: unknown): RecipeCanvasOperation | null {
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

function normalizeOperations(value: unknown): RecipeCanvasOperation[] {
  return Array.isArray(value)
    ? value
        .map(normalizeOperation)
        .filter((operation): operation is RecipeCanvasOperation => Boolean(operation))
    : [];
}

async function executeTool(
  input: CookingChatInput,
  toolCall: ToolCall,
  webContext?: Awaited<ReturnType<typeof createCookingWebContext>>,
): Promise<{
  content: string;
  draft?: CookingDraft;
  draftChanged: boolean;
  promptSuggestions?: string[];
  webSources?: CookingWebSource[];
}> {
  const args = parseArguments(toolCall.function.arguments);

  if (toolCall.function.name === 'search_web' || toolCall.function.name === 'read_web_page') {
    if (!webContext) {
      throw new CookingValidationError('Web access is not available for this chat.');
    }
    const result = await webContext.execute({
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    });
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

  if (toolCall.function.name === 'read_current_recipe_canvas') {
    const draft = await getCookingDraftByConversation(input.user, input.conversationId);
    return {
      draft: draft ?? undefined,
      draftChanged: false,
      content: JSON.stringify({
        exists: Boolean(draft?.documentMarkdown?.trim()),
        markdown: draft?.documentMarkdown ?? '',
      }),
    };
  }

  if (toolCall.function.name === 'create_recipe_canvas') {
    if (input.activeDraft && isAdditiveCanvasRequest(input.text)) {
      throw new CookingValidationError(
        'An active recipe canvas already exists and this request looks additive. Read the current recipe canvas, then update it instead of creating or replacing it.',
      );
    }
    const markdown = assertRecipeMarkdown(args.markdown);
    const draft = await generateCookingDraft(
      input.user,
      cleanOptionalText(args.title) ?? input.text,
      input.conversationId,
      markdown,
    );
    return {
      draft,
      draftChanged: true,
      content: JSON.stringify({
        ok: true,
        draftId: draft._id,
        summary: cleanOptionalText(args.summary),
      }),
    };
  }

  const draft = await getCookingDraftByConversation(input.user, input.conversationId);
  if (!draft) {
    throw new CookingValidationError('No active recipe canvas exists for this conversation.');
  }

  if (args.mode === 'replace') {
    const markdown = assertRecipeMarkdown(args.markdown);
    const updated = await updateCookingDraft(input.user, draft._id, undefined, markdown);
    if (!updated) {
      throw new CookingValidationError('No active recipe canvas exists for this conversation.');
    }
    return {
      draft: updated,
      draftChanged: true,
      content: JSON.stringify({
        ok: true,
        draftId: updated._id,
        summary: cleanOptionalText(args.summary),
      }),
    };
  }

  if (args.mode !== 'patch') {
    throw new CookingValidationError('Recipe canvas update mode is malformed.');
  }

  const operations = normalizeOperations(args.operations);
  if (operations.length === 0) {
    throw new CookingValidationError('Recipe canvas patch operations are required.');
  }

  const result = applyRecipeCanvasOperations(draft.documentMarkdown ?? '', operations);
  if (!isRecipeDocumentMarkdown(result.markdown)) {
    throw new CookingValidationError('Recipe canvas patch produced malformed markdown.');
  }
  const updated = result.changed
    ? await updateCookingDraft(input.user, draft._id, undefined, result.markdown)
    : draft;
  if (!updated) {
    throw new CookingValidationError('No active recipe canvas exists for this conversation.');
  }

  return {
    draft: updated,
    draftChanged: result.changed,
    content: JSON.stringify({
      ok: true,
      draftId: updated._id,
      changed: result.changed,
      warnings: result.warnings,
      summary: cleanOptionalText(args.summary),
    }),
  };
}

async function complete(
  messages: ChatMessage[],
  model: string,
  availableTools: Array<(typeof tools)[number] | Awaited<ReturnType<typeof createCookingWebContext>>['tools'][number]>,
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
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Cooking chat provider timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cooking chat completion failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as CompletionResponse;
  const message = body.choices?.[0]?.message;
  if (!message) {
    throw new Error('Cooking chat completion returned no message.');
  }
  return message;
}

export async function runCookingChat(input: CookingChatInput): Promise<CookingChatResult> {
  const webContext = await createCookingWebContext({
    user: input.user,
    webSearchConfig: input.webSearchConfig,
    loadAuthValues: input.loadAuthValues,
    conversationCreatedAt: input.conversationCreatedAt,
  });
  const availableTools = [...tools, ...webContext.tools];
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        input.promptPrefix,
        preferencesContext(input.preferencesMarkdown),
        webAvailabilityContext(webContext.unavailableReason),
        activeCanvasContext(input.activeDraft),
        cookingSystemInstructions,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...historyMessages(input.messages, input.conversationId),
    { role: 'user', content: input.text },
  ];
  let draft: CookingDraft | undefined;
  let draftChanged = false;
  let assistantText = '';
  let promptSuggestions: string[] = [];
  let webSources: CookingWebSource[] = [];

  for (let turn = 0; turn < 5; turn += 1) {
    const assistant = await complete(messages, selectedModel(input.model), availableTools);
    messages.push(assistant);
    assistantText = assistant.content?.trim() ?? '';

    if (!assistant.tool_calls?.length) {
      return { text: assistantText, draft, draftChanged, promptSuggestions, webSources };
    }

    for (const toolCall of assistant.tool_calls) {
      try {
        const result = await executeTool(input, toolCall, webContext);
        draft = result.draft ?? draft;
        draftChanged = draftChanged || result.draftChanged;
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
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Tool execution failed.',
          }),
        });
      }
    }
  }

  return {
    draft,
    draftChanged,
    promptSuggestions,
    webSources,
    text: assistantText || 'I updated the cooking canvas.',
  };
}
