import { logger } from '@librechat/data-schemas';
import { RerankerTypes, ScraperProviders, SearchProviders } from 'librechat-data-provider';

import type { TCustomConfig, SearchResultData, TWebSearchConfig } from 'librechat-data-provider';

import { loadWebSearchAuth } from '../web';
import { isSSRFTarget, resolveHostnameSSRF } from '../auth';

type LoadAuthValues = (params: {
  userId: string;
  authFields: string[];
  optional?: Set<string>;
  throwError?: boolean;
}) => Promise<Record<string, string>>;

type CookingWebToolName = 'search_web' | 'read_web_page' | 'read_recipe_source';

type CookingWebToolCall = {
  function: {
    name: CookingWebToolName;
    arguments: string;
  };
};

export type CookingWebSourceType = 'search' | 'page' | 'recipe' | 'video' | 'product' | 'safety';

export type CookingWebSource = {
  title?: string;
  url: string;
  sourceType: CookingWebSourceType;
  accessedAt: string;
};

export type CookingWebContext = {
  tools: Array<{
    type: 'function';
    function: {
      name: CookingWebToolName;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  unavailableReason?: string;
  execute: (toolCall: CookingWebToolCall) => Promise<{
    content: string;
    sources: CookingWebSource[];
  }>;
};

export type CookingWebInput = {
  user: string;
  webSearchConfig?: TCustomConfig['webSearch'];
  loadAuthValues?: LoadAuthValues;
  conversationCreatedAt?: string | number | Date;
};

const maxSourcesPerTurn = 8;
const maxExtractedText = 18_000;
const requestTimeout = 10_000;
const defaultTavilySearchUrl = 'https://api.tavily.com/search';
const defaultTavilyExtractUrl = 'https://api.tavily.com/extract';
const unresolvedEnvPattern = /^\$\{[^}]+}$/;

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
  published_date?: string;
};

type TavilySearchResponse = {
  query?: string;
  answer?: string;
  results?: TavilySearchResult[];
  response_time?: number;
};

type TavilyExtractResult = {
  url?: string;
  title?: string;
  raw_content?: string;
  content?: string;
};

type TavilyExtractResponse = {
  results?: TavilyExtractResult[];
  failed_results?: Array<{ url?: string; error?: string }>;
  response_time?: number;
};

function logCookingSource(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  logger.info(`[CookingSource] ${event}`, payload);
}

export const cookingWebTools = [
  {
    type: 'function' as const,
    function: {
      name: 'search_web' as const,
      description:
        'Search the public web with Tavily for current, source-backed cooking information, food safety guidance, substitutions, products, equipment, restaurants, menus, or recipe inspiration.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          sourceType: {
            type: 'string',
            enum: ['search', 'video', 'product', 'safety'],
            description: 'Use safety for food safety or preservation questions.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_web_page' as const,
      description:
        'Read a public http(s) URL with Tavily Extract when the user needs content from an article, menu, product page, or non-recipe source.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          sourceType: {
            type: 'string',
            enum: ['page', 'video', 'product', 'safety'],
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_recipe_source' as const,
      description:
        'Read a public recipe URL with Tavily Extract before using, replacing, comparing, or claiming exactness for a linked recipe. Returns extracted source text, recipe-oriented fields, confidence, and warnings. If exact ingredients or instructions are missing, ask the user to paste the recipe text instead of inventing a lookalike.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
        required: ['url'],
      },
    },
  },
];

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function cleanText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactRecipeText(text: string): string {
  const markers = [
    '#### Ingredients:',
    '#### Ingredients',
    '### Ingredients',
    '## Ingredients',
    'Prep:',
    'Print Recipe',
  ];
  const start = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (start == null) {
    return text.slice(0, maxExtractedText);
  }
  const title = text.split('\n').find((line) => /^#\s+\S/.test(line.trim()));
  const focused = text.slice(Math.max(0, start - 800), start + maxExtractedText);
  return [title, focused].filter(Boolean).join('\n\n').slice(0, maxExtractedText);
}

function sourceType(value: unknown, fallback: CookingWebSourceType): CookingWebSourceType {
  return value === 'video' ||
    value === 'product' ||
    value === 'safety' ||
    value === 'page' ||
    value === 'recipe'
    ? value
    : fallback;
}

async function assertSafeUrl(value: unknown): Promise<URL> {
  if (typeof value !== 'string') {
    throw new Error('A URL is required.');
  }
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be read.');
  }
  if (url.username || url.password) {
    throw new Error('Credentialed URLs cannot be read.');
  }
  if (isSSRFTarget(url.hostname) || (await resolveHostnameSSRF(url.hostname))) {
    throw new Error('Private, local, or metadata URLs cannot be read.');
  }
  return url;
}

function metadataFromSearch(data: SearchResultData, sourceType: CookingWebSourceType): CookingWebSource[] {
  const accessedAt = new Date().toISOString();
  const seen = new Set<string>();
  const sources = [...(data.organic ?? []), ...(data.topStories ?? [])].reduce<CookingWebSource[]>(
    (acc, item) => {
      if (!item.link || seen.has(item.link) || acc.length >= maxSourcesPerTurn) {
        return acc;
      }
      seen.add(item.link);
      acc.push({ title: item.title, url: item.link, sourceType, accessedAt });
      return acc;
    },
    [],
  );
  return sources;
}

function compactSearchData(data: SearchResultData): SearchResultData {
  return {
    organic: data.organic?.slice(0, 5).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      content: item.content?.slice(0, 1800),
      attribution: item.attribution,
    })),
    topStories: data.topStories?.slice(0, 3).map((item) => ({
      title: item.title,
      link: item.link,
      content: item.content?.slice(0, 1800),
      attribution: item.attribution,
      date: item.date,
    })),
    answerBox: data.answerBox,
    error: data.error,
  };
}

function tavilyConfig(config?: TCustomConfig['webSearch']): TCustomConfig['webSearch'] {
  return {
    ...config,
    searchProvider: SearchProviders.TAVILY,
    scraperProvider: ScraperProviders.TAVILY,
    rerankerType: RerankerTypes.NONE,
    tavilyApiKey: config?.tavilyApiKey ?? '${TAVILY_API_KEY}',
  };
}

function configuredUrl(value: string | undefined, fallback: string): string {
  if (!value || unresolvedEnvPattern.test(value)) {
    return fallback;
  }
  return value;
}

function tavilyTimeout(config: Partial<TWebSearchConfig>): number {
  return (
    config.tavilySearchOptions?.timeout ??
    config.tavilyScraperOptions?.timeout ??
    config.scraperTimeout ??
    requestTimeout
  );
}

async function postTavily<T>({
  url,
  apiKey,
  body,
  timeoutMs,
}: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily request failed with HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tavily request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function searchDataFromTavily(data: TavilySearchResponse): SearchResultData {
  return {
    organic: data.results
      ?.filter((item): item is TavilySearchResult & { url: string } => Boolean(item.url))
      .slice(0, 5)
      .map((item, index) => ({
        position: index + 1,
        title: item.title,
        link: item.url,
        snippet: item.content,
        content: item.raw_content?.slice(0, 1800) ?? item.content?.slice(0, 1800),
        attribution: item.url,
      })),
    answerBox: data.answer ? { snippet: data.answer } : undefined,
  };
}

async function executeSearch(
  authResult: Partial<TWebSearchConfig>,
  args: Record<string, unknown>,
): Promise<{ content: string; sources: CookingWebSource[] }> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    throw new Error('A search query is required.');
  }
  if (!authResult.tavilyApiKey) {
    throw new Error('Tavily API key is required for cooking web search.');
  }
  const kind = sourceType(args.sourceType, 'search');
  const response = await postTavily<TavilySearchResponse>({
    url: configuredUrl(authResult.tavilySearchUrl, defaultTavilySearchUrl),
    apiKey: authResult.tavilyApiKey,
    timeoutMs: tavilyTimeout(authResult),
    body: {
      query,
      search_depth: authResult.tavilySearchOptions?.searchDepth ?? 'advanced',
      max_results: authResult.tavilySearchOptions?.maxResults ?? 5,
      include_answer: authResult.tavilySearchOptions?.includeAnswer ?? false,
      include_raw_content: authResult.tavilySearchOptions?.includeRawContent ?? 'markdown',
      topic: authResult.tavilySearchOptions?.topic ?? 'general',
      include_domains: authResult.tavilySearchOptions?.includeDomains,
      exclude_domains: authResult.tavilySearchOptions?.excludeDomains,
    },
  });
  const data = searchDataFromTavily(response);
  return {
    sources: metadataFromSearch(data, kind),
    content: JSON.stringify({
      ok: true,
      query,
      result: compactSearchData(data),
      summary: response.answer ?? '',
    }),
  };
}

function linesAfterHeading(text: string, headingPattern: RegExp): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) {
    return [];
  }
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^#{1,6}\s+\S/.test(line) && collected.length) {
      break;
    }
    if (line) {
      collected.push(
        line
          .replace(/^[-*]\s+/, '')
          .replace(/^\[[ x]\]\s+/i, '')
          .replace(/^▢\s+/, '')
          .replace(/^\d+\.\s+/, ''),
      );
    }
  }
  return collected.slice(0, 80);
}

function recipeFacts(text: string): {
  ingredients: string[];
  instructions: string[];
  yield?: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
} {
  const ingredients = linesAfterHeading(text, /^#{1,6}\s*(ingredients?|what you'll need)\b/i);
  const instructions = linesAfterHeading(
    text,
    /^#{1,6}\s*(instructions?|directions?|method|preparation)\b/i,
  );
  const yieldMatch = text.match(/\b(?:yield|serves|makes|servings)\s*:?\s*([^\n.]+)/i);
  const warnings: string[] = [];
  if (ingredients.length === 0) {
    warnings.push('No clear ingredient list was extracted.');
  }
  if (instructions.length === 0) {
    warnings.push('No clear instruction list was extracted.');
  }
  const confidence = ingredients.length >= 3 && instructions.length >= 2
    ? 'high'
    : ingredients.length > 0 || instructions.length > 0
      ? 'medium'
      : 'low';
  return {
    ingredients,
    instructions,
    yield: yieldMatch?.[1]?.trim().slice(0, 120),
    confidence,
    warnings,
  };
}

async function extractUrl(
  authResult: Partial<TWebSearchConfig>,
  url: URL,
): Promise<{ finalUrl: string; title?: string; text: string }> {
  if (!authResult.tavilyApiKey) {
    throw new Error('Tavily API key is required for page extraction.');
  }
  const response = await postTavily<TavilyExtractResponse>({
    url: configuredUrl(authResult.tavilyExtractUrl, defaultTavilyExtractUrl),
    apiKey: authResult.tavilyApiKey,
    timeoutMs: tavilyTimeout(authResult),
    body: {
      urls: [url.toString()],
      extract_depth: authResult.tavilyScraperOptions?.extractDepth ?? 'advanced',
      format: authResult.tavilyScraperOptions?.format ?? 'markdown',
      include_images: authResult.tavilyScraperOptions?.includeImages ?? false,
      include_favicon: authResult.tavilyScraperOptions?.includeFavicon ?? false,
    },
  });
  const result = response.results?.[0];
  const rawText = cleanText(result?.raw_content ?? result?.content ?? '');
  const text = compactRecipeText(rawText);
  logCookingSource('tavily_extract', {
    url: url.toString(),
    resultCount: response.results?.length ?? 0,
    failedCount: response.failed_results?.length ?? 0,
    title: result?.title,
    rawChars: rawText.length,
    compactChars: text.length,
    compactHasIngredients: /#{1,6}\s*ingredients?/i.test(text),
    compactHasInstructions: /#{1,6}\s*instructions?/i.test(text),
  });
  if (!result || !text) {
    const error = response.failed_results?.[0]?.error;
    throw new Error(error ? `Page extraction failed: ${error}` : 'Page extraction returned no text.');
  }
  return {
    finalUrl: result.url || url.toString(),
    title: result.title,
    text,
  };
}

async function executeRead(authResult: Partial<TWebSearchConfig>, args: Record<string, unknown>): Promise<{
  content: string;
  sources: CookingWebSource[];
}> {
  const safeUrl = await assertSafeUrl(args.url);
  const page = await extractUrl(authResult, safeUrl);
  const kind = sourceType(args.sourceType, 'page');
  const source = {
    title: page.title,
    url: page.finalUrl,
    sourceType: kind,
    accessedAt: new Date().toISOString(),
  };
  return {
    sources: [source],
    content: JSON.stringify({ ok: true, ...page }),
  };
}

async function executeRecipeSource(
  authResult: Partial<TWebSearchConfig>,
  args: Record<string, unknown>,
): Promise<{ content: string; sources: CookingWebSource[] }> {
  const safeUrl = await assertSafeUrl(args.url);
  const page = await extractUrl(authResult, safeUrl);
  const facts = recipeFacts(page.text);
  logCookingSource('recipe_source_result', {
    url: page.finalUrl,
    title: page.title,
    confidence: facts.confidence,
    ingredientCount: facts.ingredients.length,
    instructionCount: facts.instructions.length,
    exactRecipeAvailable: facts.confidence !== 'low',
    warningCount: facts.warnings.length,
  });
  const source = {
    title: page.title,
    url: page.finalUrl,
    sourceType: 'recipe' as const,
    accessedAt: new Date().toISOString(),
  };
  return {
    sources: [source],
    content: JSON.stringify({
      ok: facts.confidence !== 'low',
      exactRecipeAvailable: facts.confidence !== 'low',
      source: page,
      recipe: facts,
      warnings: facts.warnings,
    }),
  };
}

export async function createCookingWebContext(input: CookingWebInput): Promise<CookingWebContext> {
  if (!input.webSearchConfig || !input.loadAuthValues) {
    return {
      tools: [],
      unavailableReason: 'Web access is not configured for this chat.',
      execute: async () => {
        throw new Error('Web access is not configured for this chat.');
      },
    };
  }

  const auth = await loadWebSearchAuth({
    userId: input.user,
    webSearchConfig: tavilyConfig(input.webSearchConfig),
    loadAuthValues: input.loadAuthValues,
    throwError: false,
  });
  if (!auth.authenticated) {
    return {
      tools: [],
      unavailableReason: 'Web access is unavailable because web search credentials are missing.',
      execute: async () => {
        throw new Error('Web access is unavailable because web search credentials are missing.');
      },
    };
  }

  return {
    tools: cookingWebTools,
    execute: async (toolCall) => {
      const args = parseArguments(toolCall.function.arguments);
      if (toolCall.function.name === 'search_web') {
        return executeSearch(auth.authResult, args);
      }
      if (toolCall.function.name === 'read_recipe_source') {
        return executeRecipeSource(auth.authResult, args);
      }
      return executeRead(auth.authResult, args);
    },
  };
}
