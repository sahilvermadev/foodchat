import { defineCatalog, defineSchema, validateSpec } from '@json-render/core';
import { z } from 'zod4';
import type { ComponentSchema } from '@json-render/core';
import type {
  GenerativePromptElement,
  GenerativePromptEnvironmentalContext,
  GenerativePromptSpec,
} from 'librechat-data-provider';
import { preferenceSections } from './artifact';
import type { PreferenceHeading } from './artifact';
import { getPreferences } from './service';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CompletionChoice = {
  message?: {
    content?: string | null;
  };
};

type CompletionResponse = {
  choices?: CompletionChoice[];
};

type CompletionStreamResponse = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
};

export type GenerativePromptsInput = {
  user: string;
  environmentalContext: GenerativePromptEnvironmentalContext;
  signal?: AbortSignal;
};

export type SpecStreamWriter = {
  write: (line: string) => void | Promise<void>;
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';
const maxPromptTextLength = 220;
const maxSuggestionTitleLength = 36;
const maxInjectionLength = 800;
const suggestionKeys = ['suggestion-1', 'suggestion-2', 'suggestion-3'] as const;

const slotSchema = z.enum(['efficient', 'seasonal', 'experimental']);
const suggestionTitleSchema = z
  .string()
  .trim()
  .min(4)
  .max(maxSuggestionTitleLength)
  .refine((value) => value.split(/\s+/).length >= 2 && value.split(/\s+/).length <= 3, {
    message: 'Mobile suggestion titles must contain 2-3 words.',
  });

const actionSchema = z.object({
  action: z.literal('SET_INPUT'),
  params: z.object({
    prompt_injection: z.string().trim().min(8).max(maxInjectionLength),
  }),
  preventDefault: z.boolean().optional(),
});

const listElementSchema = z.object({
  type: z.literal('SuggestionList'),
  props: z.object({ label: z.string().trim().min(1).max(80).optional() }),
  children: z.tuple([
    z.literal('suggestion-1'),
    z.literal('suggestion-2'),
    z.literal('suggestion-3'),
  ]),
  on: z.record(z.string(), z.never()).optional(),
});

const linkElementSchema = z.object({
  type: z.literal('SuggestionLink'),
  props: z.object({
    text: z.string().trim().min(8).max(maxPromptTextLength),
    title: suggestionTitleSchema,
    slot: slotSchema,
  }),
  children: z.array(z.string()).length(0),
  on: z.object({
    click: actionSchema,
  }),
});

const promptSpecSchema = z
  .object({
    root: z.literal('suggestions'),
    elements: z.object({
      suggestions: listElementSchema,
      'suggestion-1': linkElementSchema.extend({
        props: linkElementSchema.shape.props.extend({ slot: z.literal('efficient') }),
      }),
      'suggestion-2': linkElementSchema.extend({
        props: linkElementSchema.shape.props.extend({ slot: z.literal('seasonal') }),
      }),
      'suggestion-3': linkElementSchema.extend({
        props: linkElementSchema.shape.props.extend({ slot: z.literal('experimental') }),
      }),
    }),
  })
  .strict();

const compactSuggestionSchema = z.object({
  suggestions: z.tuple([
    z.object({
      text: z.string().trim().min(8).max(maxPromptTextLength),
      title: suggestionTitleSchema,
      prompt_injection: z.string().trim().min(8).max(maxInjectionLength),
      slot: slotSchema.optional(),
    }),
    z.object({
      text: z.string().trim().min(8).max(maxPromptTextLength),
      title: suggestionTitleSchema,
      prompt_injection: z.string().trim().min(8).max(maxInjectionLength),
      slot: slotSchema.optional(),
    }),
    z.object({
      text: z.string().trim().min(8).max(maxPromptTextLength),
      title: suggestionTitleSchema,
      prompt_injection: z.string().trim().min(8).max(maxInjectionLength),
      slot: slotSchema.optional(),
    }),
  ]),
});

const streamedSuggestionSchema = z.object({
  slot: slotSchema,
  text: z.string().trim().min(8).max(maxPromptTextLength),
  title: suggestionTitleSchema,
  prompt_injection: z.string().trim().min(8).max(maxInjectionLength),
});

function jsonRenderProps<T extends z.ZodRawShape>(schema: z.ZodObject<T>): ComponentSchema {
  return schema;
}

export const generativePromptSchema = defineSchema(
  (schema) => ({
    spec: schema.object({
      root: schema.string(),
      elements: schema.record(
        schema.object({
          type: schema.ref('catalog.components'),
          props: schema.propsOf('catalog.components'),
          children: schema.array(schema.string()),
          on: schema.any(),
        }),
      ),
    }),
    catalog: schema.object({
      components: schema.map({
        props: schema.zod(),
        description: schema.string(),
      }),
      actions: schema.map({
        params: schema.zod(),
        description: schema.string(),
      }),
    }),
  }),
  {
    defaultRules: [
      'Use only typography-first components.',
      'Never create boxes, cards, borders, panels, icons, badges, or decorative containers.',
      'Every generated suggestion must be directly clickable through the SET_INPUT action.',
    ],
  },
);

export const generativePromptCatalog = defineCatalog(generativePromptSchema, {
  components: {
    SuggestionList: {
      description: 'An airy, unboxed typographic list containing exactly three prompt links.',
      props: jsonRenderProps(z.object({ label: z.string().trim().min(1).max(80).optional() })),
    },
    SuggestionLink: {
      description:
        'A single muted text prompt suggestion. It brightens and underlines on hover in the host renderer.',
      props: jsonRenderProps(
        z.object({
          text: z.string().trim().min(8).max(maxPromptTextLength),
          title: suggestionTitleSchema,
          slot: slotSchema,
        }),
      ),
    },
  },
  actions: {
    SET_INPUT: {
      description:
        'Set the main Rekky chat input to the prompt_injection value and immediately submit it.',
      params: jsonRenderProps(actionSchema.shape.params),
    },
  },
});

function apiKey(): string {
  return (
    process.env.GENERATIVE_PROMPTS_API_KEY ||
    process.env.PREFERENCES_AGENT_API_KEY ||
    process.env.COOKING_AGENT_API_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  );
}

function baseUrl(): string {
  return (
    process.env.GENERATIVE_PROMPTS_BASE_URL ||
    process.env.PREFERENCES_AGENT_BASE_URL ||
    process.env.COOKING_AGENT_BASE_URL ||
    defaultBaseUrl
  ).replace(/\/+$/, '');
}

function selectedModel(): string {
  return (
    process.env.GENERATIVE_PROMPTS_MODEL ||
    process.env.PREFERENCES_AGENT_MODEL ||
    process.env.COOKING_AGENT_MODEL ||
    defaultModel
  );
}

function requestTimeoutMs(): number {
  const value = Number(
    process.env.GENERATIVE_PROMPTS_TIMEOUT_MS ||
      process.env.PREFERENCES_AGENT_TIMEOUT_MS ||
      process.env.COOKING_AGENT_TIMEOUT_MS,
  );
  return Number.isFinite(value) && value > 0 ? value : 22000;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean || clean.includes('\0')) {
    return undefined;
  }
  return clean.slice(0, maxLength);
}

function cleanEnvironment(
  context: GenerativePromptEnvironmentalContext,
): GenerativePromptEnvironmentalContext {
  const now = new Date();
  return {
    current_time: cleanText(context.current_time, 80) ?? now.toISOString(),
    day_of_week:
      cleanText(context.day_of_week, 20) ??
      now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    current_month:
      cleanText(context.current_month, 20) ??
      now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
    ...(cleanText(context.timezone, 80) ? { timezone: cleanText(context.timezone, 80) } : {}),
    ...(cleanText(context.locale, 40) ? { locale: cleanText(context.locale, 40) } : {}),
    ...(cleanText(context.season, 20) ? { season: cleanText(context.season, 20) } : {}),
  };
}

function sectionText(markdown: string, heading: PreferenceHeading): string[] {
  return (preferenceSections(markdown).get(heading) ?? [])
    .slice(0, 12)
    .map((line) => cleanText(line, 180))
    .filter((line): line is string => Boolean(line));
}

function structuredProfile(markdown: string) {
  return {
    diet_and_safety: [...sectionText(markdown, 'Safety'), ...sectionText(markdown, 'Diet')],
    religious_and_cultural_rules: sectionText(markdown, 'Religious & Cultural Rules'),
    kitchen_setup: sectionText(markdown, 'Kitchen'),
    household_size: sectionText(markdown, 'Household'),
    cooking_level_and_goals: [
      ...sectionText(markdown, 'Cooking Level'),
      ...sectionText(markdown, 'Goals'),
    ],
    specialty_ingredients_inventory: sectionText(markdown, 'Specialty Ingredients'),
    taste: sectionText(markdown, 'Taste'),
    location: sectionText(markdown, 'Location'),
  };
}

function systemPrompt(): string {
  return [
    'You are Rekky generating context-aware landing prompt suggestions.',
    'You are acting agentically: infer what would genuinely help the user cook today from their context and profile.',
    'Do not wait for the user to decide the category. Make three strong recommendations.',
    'Return only JSON. No markdown. No prose.',
    'Use this compact shape: {"suggestions":[{"slot":"efficient","title":"...","text":"...","prompt_injection":"..."},{"slot":"seasonal","title":"...","text":"...","prompt_injection":"..."},{"slot":"experimental","title":"...","text":"...","prompt_injection":"..."}]}',
    'Slot efficient: a practical high-efficiency meal, prep move, breakfast, or dinner aligned with time, household, skill, and equipment.',
    'Slot seasonal: a contextual seasonal or regional idea derived from location, month, weather/season, and likely local availability.',
    'Slot experimental: an inspiring but realistic challenge using 1-2 specialty ingredients and available equipment.',
    'Visible text must be a concrete recommendation, not a generic prompt. Name the dish or project.',
    'The visible text should read like Rekky has already done the thinking: specific, contextual, and immediately useful.',
    'title is mandatory and is the only recommendation copy shown on mobile.',
    'title must be exactly 2 or 3 words: a concrete dish or project name with no sentence punctuation.',
    'Prefer 2 words. Use 3 only when the third word is essential to identify the dish or project.',
    'Avoid filler adjectives such as quick, easy, cooling, refreshing, seasonal, or healthy unless they distinguish the actual dish.',
    'Good titles: "Mango Cardamom Compote", "Bircher Muesli", "Cucumber Mint Cooler".',
    'Bad titles: "Make a quick lunch", "Cool down with a refreshing drink", or any full sentence.',
    'text is the fuller desktop sentence. Keep it under 26 words. It may explain why the suggestion fits today.',
    'Example visible style: "Make bircher muesli tonight for a quick chilled breakfast tomorrow."',
    'Example visible style: "It is mango season: make cardamom mango compote for weekend dessert."',
    'Avoid visible text that asks the user to ask Rekky for help, such as "Find a dish" or "Cook something fast".',
    'prompt_injection must be the complete user message Rekky should submit when clicked.',
    'Never mention allergies, restrictions, unavailable tools, or cultural rules explicitly. Apply them silently.',
    'Never suggest ingredients or dishes that conflict with Safety, Diet, or Religious & Cultural Rules.',
    'Never suggest a dish requiring unavailable tools or appliances in Kitchen.',
  ].join('\n');
}

function userPrompt(markdown: string, environment: GenerativePromptEnvironmentalContext): string {
  return [
    'Generate exactly three Rekky landing prompt suggestions.',
    'For every suggestion, provide a mandatory 2-3 word title naming the concrete dish or project. Prefer 2 words and use 3 only when necessary. This is the only recommendation copy visible on mobile.',
    'The visible text should feel like Rekky is making a useful recommendation for the user, not asking the user to ask Rekky.',
    'Each suggestion should reduce decision fatigue by naming a dish, meal prep move, dessert, breakfast, snack, or culinary project.',
    'Use the profile and environment to infer practical life context: time of day, season, household, dietary needs, tools, skill, goals, specialty ingredients, and location.',
    '',
    'Environmental context:',
    JSON.stringify(environment),
    '',
    'Structured user cooking profile:',
    JSON.stringify(structuredProfile(markdown)),
  ].join('\n');
}

function repairPrompt(): string {
  return [
    'Your previous output was not valid compact Rekky suggestion JSON.',
    'Regenerate the complete JSON object now.',
    'Use exactly this shape: {"suggestions":[{"slot":"efficient","title":"...","text":"...","prompt_injection":"..."},{"slot":"seasonal","title":"...","text":"...","prompt_injection":"..."},{"slot":"experimental","title":"...","text":"...","prompt_injection":"..."}]}',
    'Every title is mandatory and must contain exactly 2 or 3 words. Prefer 2 words.',
    'Do not explain the correction.',
  ].join('\n');
}

function streamingPrompt(): string {
  return [
    systemPrompt(),
    'Streaming transport override:',
    'Output exactly three standalone minified JSON objects, one per line, with no array, markdown, or surrounding text.',
    'Use this order: efficient, seasonal, experimental.',
    'Each line must use this shape: {"slot":"efficient|seasonal|experimental","title":"...","text":"...","prompt_injection":"..."}',
  ].join('\n');
}

async function complete(
  messages: ChatMessage[],
  model: string,
  requestSignal?: AbortSignal,
): Promise<string> {
  const key = apiKey();
  if (!key) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] Missing API key; no LLM suggestions generated.');
    }
    return '';
  }

  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  requestSignal?.addEventListener('abort', abortRequest, { once: true });
  if (requestSignal?.aborted) {
    controller.abort();
  }
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[generative-prompts] LLM request failed.', response.status);
      }
      return '';
    }
    const body = (await response.json()) as CompletionResponse;
    return body.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] LLM request errored.', error);
    }
    return '';
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', abortRequest);
  }
}

async function streamCompletion(
  messages: ChatMessage[],
  model: string,
  onText: (text: string) => void,
  requestSignal?: AbortSignal,
): Promise<void> {
  const key = apiKey();
  if (!key) {
    return;
  }

  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  requestSignal?.addEventListener('abort', abortRequest, { once: true });
  if (requestSignal?.aborted) {
    controller.abort();
  }
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());

  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 500,
        stream: true,
      }),
    });
    if (!response.ok || !response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }
        try {
          const chunk = JSON.parse(data) as CompletionStreamResponse;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            onText(content);
          }
        } catch {
          continue;
        }
      }
      if (done) {
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', abortRequest);
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1];
  const source = fenced ?? trimmed.match(/({[\s\S]*})/)?.[1] ?? trimmed;
  return JSON.parse(source);
}

function candidateSpec(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if ('root' in value && 'elements' in value) {
    return value;
  }
  if ('spec' in value) {
    return candidateSpec((value as { spec?: unknown }).spec);
  }
  return value;
}

function suggestionElement(
  slot: 'efficient' | 'seasonal' | 'experimental',
  text: string,
  promptInjection: string,
  title: string,
): Extract<GenerativePromptElement, { type: 'SuggestionLink' }> {
  return {
    type: 'SuggestionLink',
    props: { text, title, slot },
    children: [],
    on: {
      click: {
        action: 'SET_INPUT',
        params: { prompt_injection: promptInjection },
        preventDefault: true,
      },
    },
  };
}

function compactSpec(value: unknown): GenerativePromptSpec | null {
  const result = compactSuggestionSchema.safeParse(value);
  if (!result.success) {
    return null;
  }
  const slots = ['efficient', 'seasonal', 'experimental'] as const;
  const [first, second, third] = result.data.suggestions;
  return {
    root: 'suggestions',
    elements: {
      suggestions: {
        type: 'SuggestionList',
        props: {},
        children: ['suggestion-1', 'suggestion-2', 'suggestion-3'],
        on: {},
      },
      'suggestion-1': suggestionElement(
        first.slot ?? slots[0],
        first.text,
        first.prompt_injection,
        first.title,
      ),
      'suggestion-2': suggestionElement(
        second.slot ?? slots[1],
        second.text,
        second.prompt_injection,
        second.title,
      ),
      'suggestion-3': suggestionElement(
        third.slot ?? slots[2],
        third.text,
        third.prompt_injection,
        third.title,
      ),
    },
  };
}

function validateGeneratedSpec(data: GenerativePromptSpec): GenerativePromptSpec | null {
  const catalogResult = generativePromptCatalog.validate(data);
  if (!catalogResult.success || !catalogResult.data) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] LLM response failed catalog validation.');
    }
    return null;
  }

  const structuralResult = validateSpec(data, { checkOrphans: true });
  if (!structuralResult.valid) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] LLM response failed json-render structural validation.');
    }
    return null;
  }

  return data;
}

function normalizeSpec(value: unknown): GenerativePromptSpec | null {
  let parsed: unknown;
  try {
    parsed = candidateSpec(typeof value === 'string' ? extractJsonObject(value) : value);
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] LLM response was not parseable JSON.');
    }
    return null;
  }

  const result = promptSpecSchema.safeParse(parsed);
  const compact = result.success ? null : compactSpec(parsed);
  if (compact) {
    return validateGeneratedSpec(compact);
  }
  if (!result.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] LLM response failed prompt schema validation.');
    }
    return null;
  }
  const data = {
    ...result.data,
    elements: {
      ...result.data.elements,
      suggestions: { ...result.data.elements.suggestions, on: {} },
    },
  };
  return validateGeneratedSpec(data);
}

async function generateSpec(
  messages: ChatMessage[],
  model: string,
  signal?: AbortSignal,
): Promise<GenerativePromptSpec | null> {
  const content = await complete(messages, model, signal);
  if (!content) {
    return null;
  }

  const spec = normalizeSpec(content);
  if (spec) {
    return spec;
  }

  const repaired = await complete(
    [
      ...messages,
      { role: 'assistant', content: content.slice(0, 4000) },
      { role: 'user', content: repairPrompt() },
    ],
    model,
    signal,
  );
  const repairedSpec = normalizeSpec(repaired);
  if (!repairedSpec && process.env.NODE_ENV !== 'production') {
    console.warn('[generative-prompts] LLM did not produce a valid json-render spec.');
  }
  return repairedSpec;
}

function patch(path: string, value: unknown, op: 'add' | 'replace' = 'add'): string {
  return `${JSON.stringify({ op, path, value })}\n`;
}

function streamedObjects(onObject: (value: unknown) => void): (text: string) => void {
  let candidate = '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  return (text) => {
    for (const character of text) {
      if (depth === 0) {
        if (character !== '{') {
          continue;
        }
        candidate = '{';
        depth = 1;
        continue;
      }

      candidate += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
      }
      if (depth !== 0) {
        continue;
      }

      try {
        onObject(JSON.parse(candidate));
      } catch {
        // The fallback completion handles malformed streamed output.
      }
      candidate = '';
      inString = false;
      escaped = false;
    }
  };
}

async function generateStreamedSpec(
  messages: ChatMessage[],
  model: string,
  writer: SpecStreamWriter,
  signal?: AbortSignal,
): Promise<GenerativePromptSpec | null> {
  const elements = new Map<string, Extract<GenerativePromptElement, { type: 'SuggestionLink' }>>();
  let pendingWrite = Promise.resolve();
  const slotKeys = {
    efficient: 'suggestion-1',
    seasonal: 'suggestion-2',
    experimental: 'suggestion-3',
  } as const;
  const acceptObject = streamedObjects((value) => {
    const result = streamedSuggestionSchema.safeParse(value);
    if (!result.success) {
      return;
    }
    const key = slotKeys[result.data.slot];
    if (elements.has(key)) {
      return;
    }
    const element = suggestionElement(
      result.data.slot,
      result.data.text,
      result.data.prompt_injection,
      result.data.title,
    );
    elements.set(key, element);
    pendingWrite = pendingWrite.then(() => writer.write(patch(`/elements/${key}`, element)));
  });

  try {
    await streamCompletion(
      [
        { role: 'system', content: streamingPrompt() },
        ...messages.filter(({ role }) => role !== 'system'),
      ],
      model,
      acceptObject,
      signal,
    );
  } catch (error) {
    if (!signal?.aborted && process.env.NODE_ENV !== 'production') {
      console.warn('[generative-prompts] Streaming request failed; using fallback.', error);
    }
    return null;
  }
  await pendingWrite;

  if (elements.size !== suggestionKeys.length) {
    return null;
  }
  const first = elements.get('suggestion-1');
  const second = elements.get('suggestion-2');
  const third = elements.get('suggestion-3');
  if (!first || !second || !third) {
    return null;
  }

  return validateGeneratedSpec({
    root: 'suggestions',
    elements: {
      suggestions: {
        type: 'SuggestionList',
        props: {},
        children: [...suggestionKeys],
        on: {},
      },
      'suggestion-1': first,
      'suggestion-2': second,
      'suggestion-3': third,
    },
  });
}

export async function streamGenerativePrompts(
  input: GenerativePromptsInput,
  writer: SpecStreamWriter,
): Promise<GenerativePromptSpec | null> {
  const preferences = await getPreferences(input.user);
  const environment = cleanEnvironment(input.environmentalContext);
  const messages = [
    { role: 'system' as const, content: systemPrompt() },
    { role: 'user' as const, content: userPrompt(preferences.markdown, environment) },
  ];
  const listElement: GenerativePromptElement = {
    type: 'SuggestionList',
    props: {},
    children: [...suggestionKeys],
    on: {},
  };
  await writer.write(patch('/root', 'suggestions'));
  await writer.write(patch('/elements/suggestions', listElement));

  const model = selectedModel();
  const streamedSpec = await generateStreamedSpec(messages, model, writer, input.signal);
  if (streamedSpec || input.signal?.aborted) {
    return streamedSpec;
  }

  const fallbackSpec = await generateSpec(messages, model, input.signal);
  if (!fallbackSpec) {
    return null;
  }
  for (const key of suggestionKeys) {
    await writer.write(patch(`/elements/${key}`, fallbackSpec.elements[key], 'replace'));
  }
  return fallbackSpec;
}
