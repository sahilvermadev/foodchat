import type { PreferencesDocument } from 'librechat-data-provider';
import {
  applyPreferencePatch,
  normalizePreferenceOperations,
  renderPreferencesMarkdown,
} from './artifact';
import { getExistingPreferences, updatePreferences } from './service';

type ChatMessage = {
  role: 'system' | 'user';
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

type ExtractionInput = {
  user: string;
  userMessage: string;
  assistantMessage: string;
  model?: string;
  currentMarkdown?: string;
};

export type PreferenceExtractionResult = {
  changed: boolean;
  preferences?: PreferencesDocument;
  question?: string;
  warnings: string[];
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';

const extractionInstructions = `You update a cooking preference document from one chat turn.

Return only compact JSON:
{"operations":[...],"question":""}

Allowed operations:
	- {"op":"append_to_section","heading":"Safety|Diet|Religious & Cultural Rules|Cooking Level|Household|Kitchen|Taste|Goals|Location|Personal Context","markdown":"- ..."}
- {"op":"set_section","heading":"...","markdown":"- ..."}
- {"op":"remove_line","heading":"...","line":"- ..."}
- {"op":"replace","markdown":"## Safety\\n- ..."}

Rules:
- Save durable cooking preferences automatically when the user states them clearly.
- Safety includes allergies, intolerances, medical restrictions, and ingredients to avoid for health safety.
- Diet includes vegan, vegetarian, gluten-free, macro rules, and persistent eating patterns.
- Religious & Cultural Rules includes halal, kosher, Jain, fasting rules, pork/beef/alcohol restrictions, cross-contamination rules, and culturally important boundaries.
- Kitchen includes appliances, tools, oven/stove limits, pantry access, and shopping constraints.
- Taste includes persistent flavor preferences and disliked ingredients.
- Household includes serving size, family, kids, meal prep, and people being cooked for.
- Goals includes budget, speed, calories, protein, learning, health, and meal-planning aims.
- Cooking Level includes skill, confidence, preferred complexity, and technique comfort.
- Location includes markets, country, city, climate, and regional ingredient availability.
- Personal Context includes durable human context that helps Mise build a relationship: routines, work/school schedule, family roles, cooking memories, learning style, confidence, celebrations, traditions, and emotional context around food.
- Do not save one-off recipe requests as preferences.
- Do not save assistant guesses, suggestions, or recipe content unless the user confirms it as their preference.
- Do not save sensitive personal data unless the user clearly volunteered it and it is useful for cooking support.
- Do not duplicate existing preference lines; merge or skip instead.
- Never remove or weaken Safety preferences unless the user explicitly says the restriction is no longer true. In ambiguous cases, ask a question instead.
- Ask at most one smart question when a preference is likely useful but ambiguous. Leave question empty when no question is needed.
- Keep each saved line short, concrete, and reusable.`;

function apiKey(): string {
  return (
    process.env.PREFERENCES_AGENT_API_KEY ||
    process.env.COOKING_AGENT_API_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  );
}

function baseUrl(): string {
  return (
    process.env.PREFERENCES_AGENT_BASE_URL ||
    process.env.COOKING_AGENT_BASE_URL ||
    defaultBaseUrl
  ).replace(/\/+$/, '');
}

function selectedModel(model?: string): string {
  return (
    model?.trim() ||
    process.env.PREFERENCES_AGENT_MODEL ||
    process.env.COOKING_AGENT_MODEL ||
    defaultModel
  );
}

function requestTimeoutMs(): number {
  const value = Number(
    process.env.PREFERENCES_AGENT_TIMEOUT_MS || process.env.COOKING_AGENT_TIMEOUT_MS,
  );
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractJson(text: string): Record<string, unknown> | null {
  const source =
    text.match(/```json\s*([\s\S]*?)```/)?.[1] ?? text.match(/({[\s\S]*})/)?.[1] ?? text;
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function preferenceMessages(input: ExtractionInput, currentMarkdown: string): ChatMessage[] {
  return [
    { role: 'system', content: extractionInstructions },
    {
      role: 'user',
      content: [
        'Current preference markdown:',
        currentMarkdown.trim() || '(empty)',
        '',
        'User message:',
        input.userMessage,
        '',
        'Assistant response:',
        input.assistantMessage,
      ].join('\n'),
    },
  ];
}

async function complete(messages: ChatMessage[], model: string): Promise<string> {
  const key = apiKey();
  if (!key) {
    return '';
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
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return '';
  }

  const body = (await response.json()) as CompletionResponse;
  return body.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function extractAndSavePreferences(
  input: ExtractionInput,
): Promise<PreferenceExtractionResult> {
  const existing = input.currentMarkdown == null ? await getExistingPreferences(input.user) : null;
  const currentMarkdown = renderPreferencesMarkdown(
    input.currentMarkdown ?? existing?.markdown ?? '',
  );
  const content = await complete(
    preferenceMessages(input, currentMarkdown),
    selectedModel(input.model),
  );
  const parsed = content ? extractJson(content) : null;
  const operations = normalizePreferenceOperations(parsed?.operations);
  const question = typeof parsed?.question === 'string' ? parsed.question.trim() : '';

  const result = operations.reduce(
    (state, operation) => {
      const next = applyPreferencePatch(state.markdown, operation);
      return {
        markdown: next.markdown,
        changed: state.changed || next.changed,
        warnings: [...state.warnings, ...next.warnings],
      };
    },
    { markdown: currentMarkdown, changed: false, warnings: [] as string[] },
  );

  if (!result.changed) {
    return { changed: false, question: question || undefined, warnings: result.warnings };
  }

  const preferences = await updatePreferences(input.user, result.markdown);
  return {
    changed: true,
    preferences,
    question: question || undefined,
    warnings: result.warnings,
  };
}
