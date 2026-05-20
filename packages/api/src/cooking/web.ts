import { createSearchTool } from '@librechat/agents';
import { ToolMessage } from '@langchain/core/messages/tool';
import type { TCustomConfig, SearchResultData } from 'librechat-data-provider';
import type { ToolCall as LangChainToolCall } from '@langchain/core/messages/tool';
import { loadWebSearchAuth } from '../web';
import { isSSRFTarget, resolveHostnameSSRF } from '../auth';

type SearchToolConfig = NonNullable<Parameters<typeof createSearchTool>[0]>;

type LoadAuthValues = (params: {
  userId: string;
  authFields: string[];
  optional?: Set<string>;
  throwError?: boolean;
}) => Promise<Record<string, string>>;

type CookingWebToolName = 'search_web' | 'read_web_page';

type CookingWebToolCall = {
  function: {
    name: CookingWebToolName;
    arguments: string;
  };
};

export type CookingWebSourceType = 'search' | 'page' | 'video' | 'product' | 'safety';

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
const maxReadBytes = 1_000_000;
const maxExtractedText = 12_000;
const requestTimeout = 10_000;

export const cookingWebTools = [
  {
    type: 'function' as const,
    function: {
      name: 'search_web' as const,
      description:
        'Search the public web for current, source-backed cooking information, food safety guidance, substitutions, products, equipment, restaurants, menus, or recipe inspiration.',
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
        'Read a public http(s) URL shared by the user, including recipe pages, articles, menus, product pages, and accessible video pages.',
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
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxExtractedText);
}

function pageTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]).slice(0, 180) : undefined;
}

function sourceType(value: unknown, fallback: CookingWebSourceType): CookingWebSourceType {
  return value === 'video' || value === 'product' || value === 'safety' || value === 'page'
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

async function fetchPublicPage(url: URL): Promise<{ finalUrl: string; title?: string; text: string }> {
  let current = url;
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/html, text/plain;q=0.9, */*;q=0.5' },
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response did not include a destination.');
      }
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`Page read failed with HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxReadBytes) {
      throw new Error('Page is too large to read safely.');
    }

    const html = await response.text();
    if (html.length > maxReadBytes) {
      throw new Error('Page is too large to read safely.');
    }

    return { finalUrl: current.toString(), title: pageTitle(html), text: cleanText(html) };
  }
  throw new Error('Too many redirects while reading URL.');
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

function isSearchArtifact(value: unknown): value is { web_search?: SearchResultData } {
  return value != null && typeof value === 'object' && 'web_search' in value;
}

async function executeSearch(
  searchTool: ReturnType<typeof createSearchTool>,
  args: Record<string, unknown>,
): Promise<{ content: string; sources: CookingWebSource[] }> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    throw new Error('A search query is required.');
  }
  const toolCall: LangChainToolCall<'web_search', { query: string }> = {
    type: 'tool_call',
    id: 'cooking-web-search',
    name: 'web_search',
    args: { query },
  };
  const result = await searchTool.invoke(toolCall);
  const output = ToolMessage.isInstance(result) ? result.content : result;
  const artifact: unknown = ToolMessage.isInstance(result) ? result.artifact : undefined;
  const data = isSearchArtifact(artifact) ? artifact.web_search ?? {} : {};
  const kind = sourceType(args.sourceType, 'search');
  return {
    sources: metadataFromSearch(data, kind),
    content: JSON.stringify({
      ok: !data.error,
      query,
      result: compactSearchData(data),
      summary: typeof output === 'string' ? output.slice(0, maxExtractedText) : '',
    }),
  };
}

async function executeRead(args: Record<string, unknown>): Promise<{
  content: string;
  sources: CookingWebSource[];
}> {
  const safeUrl = await assertSafeUrl(args.url);
  const page = await fetchPublicPage(safeUrl);
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
    webSearchConfig: input.webSearchConfig,
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

  const searchTool = createSearchTool(auth.authResult as SearchToolConfig);
  return {
    tools: cookingWebTools,
    execute: async (toolCall) => {
      const args = parseArguments(toolCall.function.arguments);
      if (toolCall.function.name === 'search_web') {
        return executeSearch(searchTool, args);
      }
      return executeRead(args);
    },
  };
}
