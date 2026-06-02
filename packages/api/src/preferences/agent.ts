import type { DeviceLocationContext, PreferencesDocument } from 'librechat-data-provider';
import {
  applyPreferencePatch,
  normalizeChangedHeadings,
  normalizePreferenceOperations,
  preferenceSections,
  preferenceProfileStatus,
  renderPreferencesMarkdown,
} from './artifact';
import type { PreferenceHeading } from './artifact';
import { getPreferences, updatePreferences } from './service';

type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type PreferencesChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

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
    name: PreferencesToolName;
    arguments: string;
  };
};

type PreferencesToolName = 'read_preferences' | 'update_preferences';

type CompletionChoice = {
  message: ChatMessage;
};

type CompletionResponse = {
  choices?: CompletionChoice[];
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

export type PreferencesChatInput = {
  user: string;
  message?: string;
  model?: string;
  history?: PreferencesChatHistoryMessage[];
  deviceContext?: DeviceLocationContext;
};

export type PreferencesChatResult = {
  text: string;
  preferences: PreferencesDocument;
  preferencesChanged: boolean;
  changedHeadings: PreferenceHeading[];
  suggestions?: Array<{ text: string; display: string }>;
  complete?: boolean;
};

const defaultBaseUrl = 'https://openrouter.ai/api/v1';
const defaultModel = 'google/gemini-3.1-flash-lite';
const defaultReverseGeocodeUrl = 'https://nominatim.openstreetmap.org/reverse';

const preferencesSystemInstructions = `You are Rekky's preferences agent.

Your job is to build a durable cooking profile with the user. Ask intelligent, specific questions and save clear answers automatically through tools.

Use these canonical preference sections:
- Safety: allergies, intolerances, medical restrictions, and ingredients the user must avoid for health safety.
- Diet: vegan, vegetarian, gluten-free, macro rules, and persistent eating patterns.
- Religious & Cultural Rules: halal, kosher, Jain, fasting rules, pork/beef/alcohol restrictions, cross-contamination rules, and culturally important food boundaries.
- Cooking Level: skill, confidence, preferred complexity, knife skills, technique comfort.
- Household: people cooked for, serving sizes, kids, meal-prep rhythm, entertaining.
- Kitchen: appliances, cookware, oven/stove access, pantry limits, shopping constraints.
- Taste: favorite flavors, heat level, disliked ingredients, texture preferences.
- Goals: budget, speed, nutrition, protein, learning, hosting, batch cooking.
- Location: city/country, nearby markets, climate, regional ingredient availability.
- Personal Context: routines, work/school schedule, family roles, cooking memories, learning style, confidence, celebrations, traditions, and emotional context around food.

Conversation rules:
- First read the current preferences when you need context.
- If the user gives clear durable information, call update_preferences before responding.
- Ask one question at a time. Prefer high-impact questions over exhaustive forms.
- Start with Safety/Diet/religious or cultural rules if they are unknown, then household, kitchen constraints, taste, goals, cooking level, and location.
- If the profile status says complete, stop interviewing. Briefly say the profile is ready and invite the user back to cooking. Do not ask what cuisine, region, or dish they want next.
- Do not save one-off recipe requests as preferences.
- Do not save active/current/possible cooking projects, shopping considerations, or curiosity from the current chat as durable preferences.
- When the user likes learning through projects, save the stable pattern, e.g. "Enjoys occasional long kitchen projects for technique mastery"; do not save each project such as sourdough, khameeri roti, souffle, crepes, chhach, or a tool they are considering.
- Do not save "interested in learning...", "currently working on...", "attempting to master...", or "considering buying..." facts unless the user explicitly asks Rekky to remember that exact long-term goal.
- Do not save guesses. If the user is ambiguous, ask a clarifying question.
- Do not save sensitive personal data unless the user clearly volunteered it and it is useful for cooking support.
- Never remove or weaken Safety preferences unless the user explicitly confirms that the restriction is no longer true.
- If the user says there are no allergies or precautions, save that as Safety rather than leaving Safety empty.
- If the user says there are no dietary rules, save that as Diet rather than leaving Diet empty.
- If the user says there are no religious or cultural food rules, save that as Religious & Cultural Rules rather than leaving it empty.
- Device context may include inferred locale, timezone, measurement system, and optional browser geolocation. Use it to fill Location when useful, but keep it coarse and correct uncertainty. Do not pretend coordinates are a confirmed city.
- Store granular bullets in the correct sections. Never put equipment, location, household, taste, or goals inside Safety.
- Keep saved bullets short. Split multi-topic answers into multiple section-specific bullets.
- Do not expose raw markdown, JSON, or tool arguments unless the user explicitly asks for the markdown.
- Keep responses short: one sentence about what changed, then at most one useful question if profile status is incomplete.
- When the user asks "anything else?" or similar and the profile is complete, answer that you have enough.

At the very end of your response, you MUST always append a JSON block containing a "complete" boolean flag (which MUST be true if the user's profile is complete and no more questions are needed, otherwise false) and 3-5 dynamic, highly context-aware quick-reply suggestions for the user's next response. These suggestions must be tailored to the active question or topic being discussed. Ensure they use natural, first-person phrasing (e.g. "I have no allergies", "I am a vegetarian", "I own an air fryer").
Format the block exactly like this:
\`\`\`json-suggestions
{
  "complete": false,
  "suggestions": [
    { "display": "Short Label", "text": "Full natural sentence reply" }
  ]
}
\`\`\`
`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'read_preferences',
      description: 'Read the current saved cooking preferences.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_preferences',
      description: 'Update saved cooking preferences with deterministic operations.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                op: {
                  type: 'string',
                  enum: ['set_section', 'append_to_section', 'remove_line', 'replace'],
                },
                heading: {
                  type: 'string',
                  enum: [
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
                  ],
                },
                markdown: { type: 'string' },
                line: { type: 'string' },
                confirmed: { type: 'boolean' },
              },
              required: ['op'],
            },
          },
        },
        required: ['operations'],
      },
    },
  },
];

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
  return Number.isFinite(value) && value > 0 ? value : 30000;
}

function locationTimeoutMs(): number {
  const value = Number(process.env.PREFERENCES_LOCATION_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 2500;
}

function reverseGeocodeUrl(): string {
  return (process.env.PREFERENCES_REVERSE_GEOCODE_URL || defaultReverseGeocodeUrl).replace(
    /\/+$/,
    '',
  );
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function historyMessages(history: PreferencesChatHistoryMessage[] | undefined): ChatMessage[] {
  return (history ?? []).reduce<ChatMessage[]>((acc, message) => {
    if (
      !message ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      return acc;
    }
    const content = message.content.trim();
    if (!content) {
      return acc;
    }
    acc.push({ role: message.role, content });
    return acc;
  }, []);
}

function cleanString(value: unknown, maxLength = 80): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value.trim();
  if (!clean || clean.length > maxLength || clean.includes('\0')) {
    return undefined;
  }
  return clean;
}

function safeDeviceContext(
  value: DeviceLocationContext | undefined,
): DeviceLocationContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const locale = cleanString(value.locale, 40);
  const timeZone = cleanString(value.timeZone, 80);
  const languages = Array.isArray(value.languages)
    ? value.languages
        .flatMap((language) => {
          const clean = cleanString(language, 40);
          return clean ? [clean] : [];
        })
        .slice(0, 5)
    : undefined;
  const measurementSystem =
    value.measurementSystem === 'metric' || value.measurementSystem === 'imperial'
      ? value.measurementSystem
      : undefined;

  let location: DeviceLocationContext['location'];
  if (value.location && typeof value.location === 'object') {
    const latitude = Number(value.location.latitude);
    const longitude = Number(value.location.longitude);
    const accuracy = Number(value.location.accuracy);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      location = {
        latitude: Math.round(latitude * 100000) / 100000,
        longitude: Math.round(longitude * 100000) / 100000,
        source: 'browser_geolocation',
        ...(Number.isFinite(accuracy) && accuracy > 0 ? { accuracy: Math.round(accuracy) } : {}),
        ...(value.location.permission === 'granted' ||
        value.location.permission === 'prompt' ||
        value.location.permission === 'denied' ||
        value.location.permission === 'unavailable'
          ? { permission: value.location.permission }
          : {}),
      };
    }
  }

  const context = {
    ...(locale ? { locale } : {}),
    ...(languages?.length ? { languages } : {}),
    ...(timeZone ? { timeZone } : {}),
    ...(measurementSystem ? { measurementSystem } : {}),
    ...(location ? { location } : {}),
  };
  return Object.keys(context).length ? context : undefined;
}

function deviceContextMessage(
  deviceContext: DeviceLocationContext | undefined,
): ChatMessage | null {
  const safe = safeDeviceContext(deviceContext);
  if (!safe) {
    return null;
  }
  return {
    role: 'system',
    content: [
      'Device-derived context for preferences:',
      JSON.stringify(safe),
      'Use this mainly for Location, measurement defaults, and ingredient-access assumptions. Treat geolocation as approximate and user-editable.',
    ].join('\n'),
  };
}

function compactPlace(address?: Record<string, string | undefined>, displayName?: string): string {
  if (!address) {
    return cleanString(displayName, 220) ?? '';
  }

  const locality =
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.city_district ||
    address.borough ||
    address.town ||
    address.village;
  const city = address.city || address.town || address.municipality || address.county;
  const state = address.state || address.region;
  const country = address.country;
  const parts = [locality, city, state, country].filter(
    (part, index, values): part is string =>
      Boolean(part?.trim()) &&
      values.findIndex((candidate) => candidate?.toLowerCase() === part?.toLowerCase()) === index,
  );

  return parts.join(', ') || cleanString(displayName, 220) || '';
}

async function reverseGeocodeLocation(
  location: NonNullable<DeviceLocationContext['location']>,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), locationTimeoutMs());
  try {
    const url = new URL(reverseGeocodeUrl());
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(location.latitude));
    url.searchParams.set('lon', String(location.longitude));
    url.searchParams.set('zoom', '16');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Rekky/0.8 preferences location resolver',
      },
    });
    if (!response.ok) {
      return '';
    }
    const body = (await response.json()) as ReverseGeocodeResponse;
    return compactPlace(body.address, body.display_name);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function deviceLocationPreferenceLines(
  deviceContext: DeviceLocationContext | undefined,
): Promise<string[]> {
  const safe = safeDeviceContext(deviceContext);
  if (!safe) {
    return [];
  }

  const lines: string[] = [];

  if (safe.location) {
    const place = await reverseGeocodeLocation(safe.location);
    if (place) {
      lines.push(`Current location: ${place}.`);
    }
  }

  return lines;
}

function deviceLocationPatchOperations(currentMarkdown: string, locationLines: string[]) {
  const existingLocationLines = preferenceSections(currentMarkdown).get('Location') ?? [];
  const generatedPrefixes = [
    '- Device-inferred context:',
    '- Approximate browser location:',
    '- Local defaults:',
    '- Usually cooks near ',
    '- Current location:',
    '- Device coordinates:',
  ];
  return [
    ...existingLocationLines
      .filter((line) => generatedPrefixes.some((prefix) => line.startsWith(prefix)))
      .map((line) => ({
        op: 'remove_line' as const,
        heading: 'Location' as const,
        line,
      })),
    {
      op: 'append_to_section' as const,
      heading: 'Location' as const,
      markdown: locationLines.join('\n'),
    },
  ];
}

async function executeTool(
  user: string,
  toolCall: ToolCall,
  current: PreferencesDocument,
): Promise<{
  content: string;
  preferences: PreferencesDocument;
  changed: boolean;
  changedHeadings: PreferenceHeading[];
}> {
  if (toolCall.function.name === 'read_preferences') {
    return {
      preferences: current,
      changed: false,
      changedHeadings: [],
      content: JSON.stringify({
        markdown: renderPreferencesMarkdown(current.markdown || ''),
        empty: !current.markdown?.trim(),
        profileStatus: preferenceProfileStatus(current.markdown || ''),
      }),
    };
  }

  const args = parseArguments(toolCall.function.arguments);
  const operations = normalizePreferenceOperations(args.operations);
  if (operations.length === 0) {
    return {
      preferences: current,
      changed: false,
      changedHeadings: [],
      content: JSON.stringify({ ok: false, error: 'Preference operations are required.' }),
    };
  }

  const result = operations.reduce(
    (state, operation) => {
      const next = applyPreferencePatch(state.markdown, operation);
      return {
        markdown: next.markdown,
        changed: state.changed || next.changed,
        warnings: [...state.warnings, ...next.warnings],
        changedHeadings: [...state.changedHeadings, ...next.changedHeadings],
      };
    },
    {
      markdown: current.markdown ?? '',
      changed: false,
      warnings: [] as string[],
      changedHeadings: [] as PreferenceHeading[],
    },
  );

  const preferences = result.changed ? await updatePreferences(user, result.markdown) : current;
  const changedHeadings = normalizeChangedHeadings(result.changedHeadings);
  return {
    preferences,
    changed: result.changed,
    changedHeadings,
    content: JSON.stringify({
      ok: true,
      changed: result.changed,
      warnings: result.warnings,
      changedHeadings,
      profileStatus: preferenceProfileStatus(preferences.markdown),
      markdown: renderPreferencesMarkdown(preferences.markdown),
    }),
  };
}

async function complete(messages: ChatMessage[], model: string): Promise<ChatMessage> {
  const key = apiKey();
  if (!key) {
    return {
      role: 'assistant',
      content:
        'Preferences chat is not configured yet. Add an OpenRouter key, then I can help build your cooking profile.',
    };
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
        tools,
        tool_choice: 'auto',
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        role: 'assistant',
        content: 'The preferences agent timed out. Try one preference at a time.',
      };
    }
    return {
      role: 'assistant',
      content: 'I could not reach the preferences agent. Your saved preferences were not changed.',
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      role: 'assistant',
      content: 'The preferences agent could not respond. Your saved preferences were not changed.',
    };
  }

  const body = (await response.json()) as CompletionResponse;
  const message = body.choices?.[0]?.message;
  if (!message) {
    return {
      role: 'assistant',
      content: 'The preferences agent returned an empty response.',
    };
  }
  return message;
}

function parseAssistantResponse(content: string | null): {
  text: string;
  suggestions?: Array<{ text: string; display: string }>;
  complete?: boolean;
} {
  const raw = content?.trim() || '';
  if (!raw) {
    return { text: 'What should I know about how you cook?' };
  }

  const match = raw.match(/```json-suggestions\s*([\s\S]+?)\s*```/);
  let parsedSuggestions: Array<{ text: string; display: string }> | undefined;
  let parsedComplete: boolean | undefined;
  let text = raw;

  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      text = raw.replace(match[0], '').trim();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : undefined;
        parsedComplete = typeof parsed.complete === 'boolean' ? parsed.complete : undefined;
      } else if (Array.isArray(parsed)) {
        parsedSuggestions = parsed;
      }
    } catch {
      // ignore
    }
  }

  // Semantic fallback scan: if the LLM message converses about profile completion/ready state, mark complete
  if (parsedComplete === undefined) {
    const lowerText = text.toLowerCase();
    if (
      lowerText.includes('profile is complete') ||
      lowerText.includes('profile is ready') ||
      lowerText.includes('preferences are saved') ||
      lowerText.includes('ready to cook') ||
      lowerText.includes('good to go') ||
      lowerText.includes('finished refining') ||
      lowerText.includes('all set to cook') ||
      lowerText.includes('ready to help you with your next cooking')
    ) {
      parsedComplete = true;
    }
  }

  return { text, suggestions: parsedSuggestions, complete: parsedComplete };
}

function getDefaultSuggestions(complete: boolean): Array<{ text: string; display: string }> {
  return complete
    ? [
        { text: 'Can you summarize my current cooking profile?', display: 'Summarize my profile' },
        {
          text: 'How do these preferences personalize my recipes?',
          display: 'How personalization works',
        },
        {
          text: "I am all done refining my preferences. Let's go back to cooking!",
          display: "Done, let's cook!",
        },
      ]
    : [
        { text: 'I have no food allergies or safety restrictions.', display: 'No allergies' },
        { text: 'I follow a vegetarian diet.', display: 'Vegetarian' },
      ];
}

export async function runPreferencesChat(
  input: PreferencesChatInput,
): Promise<PreferencesChatResult> {
  let preferences = await getPreferences(input.user);
  let preferencesChanged = false;
  let changedHeadings: PreferenceHeading[] = [];
  const deviceLocationLines = await deviceLocationPreferenceLines(input.deviceContext);
  if (deviceLocationLines.length > 0) {
    const deviceLocationPatch = deviceLocationPatchOperations(
      preferences.markdown ?? '',
      deviceLocationLines,
    ).reduce(
      (state, operation) => {
        const next = applyPreferencePatch(state.markdown, operation);
        return {
          markdown: next.markdown,
          changed: state.changed || next.changed,
          changedHeadings: [...state.changedHeadings, ...next.changedHeadings],
        };
      },
      {
        markdown: preferences.markdown ?? '',
        changed: false,
        changedHeadings: [] as PreferenceHeading[],
      },
    );
    if (deviceLocationPatch.changed) {
      preferences = await updatePreferences(input.user, deviceLocationPatch.markdown);
      preferencesChanged = true;
      changedHeadings = normalizeChangedHeadings([
        ...changedHeadings,
        ...deviceLocationPatch.changedHeadings,
      ]);
    }
  }
  const firstTurn = !input.message?.trim();
  const status = preferenceProfileStatus(preferences.markdown);
  const deviceMessage = deviceContextMessage(input.deviceContext);
  const messages: ChatMessage[] = [
    { role: 'system', content: preferencesSystemInstructions },
    {
      role: 'system',
      content: `Current profile status: ${JSON.stringify(status)}\nCurrent preference markdown:\n${renderPreferencesMarkdown(preferences.markdown) || '(empty)'}`,
    },
    ...(deviceMessage ? [deviceMessage] : []),
    ...historyMessages(input.history),
    {
      role: 'user',
      content: firstTurn
        ? status.complete
          ? 'Start the preferences screen. My profile is complete, so do not interview me further.'
          : `Start the preferences interview. Ask this next unless the user already answered it: ${status.nextQuestion}`
        : (input.message?.trim() ?? ''),
    },
  ];

  for (let turn = 0; turn < 5; turn += 1) {
    const assistant = await complete(messages, selectedModel(input.model));
    messages.push(assistant);

    if (!assistant.tool_calls?.length) {
      const parsed = parseAssistantResponse(assistant.content);
      const isCompleteStructurally = preferenceProfileStatus(preferences.markdown).complete;
      const profileComplete = parsed.complete ?? isCompleteStructurally;
      return {
        preferences,
        preferencesChanged,
        changedHeadings: normalizeChangedHeadings(changedHeadings),
        text: parsed.text,
        suggestions: parsed.suggestions || getDefaultSuggestions(profileComplete),
        complete: profileComplete,
      };
    }

    for (const toolCall of assistant.tool_calls) {
      const result = await executeTool(input.user, toolCall, preferences);
      preferences = result.preferences;
      preferencesChanged = preferencesChanged || result.changed;
      changedHeadings = normalizeChangedHeadings([...changedHeadings, ...result.changedHeadings]);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content,
      });
    }
  }

  const isCompleteStructurally = preferenceProfileStatus(preferences.markdown).complete;
  const defaultText = isCompleteStructurally
    ? 'Your cooking profile is complete enough to personalize recipes now.'
    : 'I updated what I could. What else should I know about how you cook?';
  const parsed = parseAssistantResponse(defaultText);
  const profileComplete = parsed.complete ?? isCompleteStructurally;
  return {
    preferences,
    preferencesChanged,
    changedHeadings: normalizeChangedHeadings(changedHeadings),
    text: parsed.text,
    suggestions: parsed.suggestions || getDefaultSuggestions(profileComplete),
    complete: profileComplete,
  };
}
