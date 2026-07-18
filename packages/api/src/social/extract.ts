import { isSSRFTarget, resolveHostnameSSRF } from '../auth';

const maxHtmlBytes = 1_500_000;
const maxExtractedText = 10_000;
const requestTimeoutMs = 5_000;
const maxRedirects = 3;

type RecipeCandidate = {
  title?: string;
  recipeYield?: string;
  ingredients: string[];
  instructions: string[];
  thumbnailUrl?: string;
};

export type ExtractedWebRecipe = {
  title?: string;
  text: string;
  ingredientCount: number;
  instructionCount: number;
  thumbnailUrl?: string;
};

export type ExtractedYouTubeMetadata = {
  title?: string;
  description?: string;
  creatorName?: string;
  creatorUrl?: string;
  thumbnailUrl?: string;
};

export type ExtractedYouTubePlaylistItem = {
  videoId: string;
  title?: string;
  description?: string;
  creatorName?: string;
  thumbnailUrl?: string;
  position?: number;
};

export type ExtractedYouTubePlaylist = {
  playlistId: string;
  title?: string;
  items: ExtractedYouTubePlaylistItem[];
};

const ignoredDescriptionHosts = new Set([
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
  'amazon.com',
  'amzn.to',
  'bit.ly',
]);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? decodeHtmlEntities(value).replace(/\s+/g, ' ').trim() : '';
}

function cleanLines(values: unknown[]): string[] {
  return values.map(cleanText).filter(Boolean).slice(0, 120);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value == null ? [] : [value];
}

function hasRecipeType(value: unknown): boolean {
  return asArray(value).some((item) => typeof item === 'string' && item.toLowerCase() === 'recipe');
}

function instructionText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [cleanText(value)].filter(Boolean);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.itemListElement)) {
    return record.itemListElement.flatMap(instructionText);
  }
  return [record.text, record.name].map(cleanText).filter(Boolean).slice(0, 1);
}

function imageUrlFromJsonLd(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageUrlFromJsonLd(item);
      if (url) {
        return url;
      }
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const url = record.url ?? record.contentUrl;
    if (typeof url === 'string') {
      return url.trim();
    }
  }
  return undefined;
}

function recipeFromJsonLd(value: unknown): RecipeCandidate | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(recipeFromJsonLd).find(Boolean);
  }

  const record = value as Record<string, unknown>;
  const graphRecipe = Array.isArray(record['@graph'])
    ? record['@graph'].map(recipeFromJsonLd).find(Boolean)
    : undefined;
  if (graphRecipe) {
    return graphRecipe;
  }
  if (!hasRecipeType(record['@type'])) {
    return undefined;
  }

  const ingredients = cleanLines(asArray(record.recipeIngredient));
  const instructions = asArray(record.recipeInstructions).flatMap(instructionText).slice(0, 120);
  if (ingredients.length < 2 || instructions.length < 1) {
    return undefined;
  }

  return {
    title: cleanText(record.name),
    recipeYield: cleanLines(asArray(record.recipeYield))[0],
    ingredients,
    instructions,
    thumbnailUrl: imageUrlFromJsonLd(record.image),
  };
}

function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match = scriptPattern.exec(html);
  while (match) {
    if (/type\s*=\s*["'][^"']*application\/ld\+json[^"']*["']/i.test(match[1] ?? '')) {
      blocks.push(decodeHtmlEntities(match[2] ?? '').trim());
    }
    match = scriptPattern.exec(html);
  }
  return blocks;
}

function titleFromHtml(html: string): string | undefined {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanText(title).slice(0, 140) || undefined;
}

function textFromCandidate(candidate: RecipeCandidate): string {
  return [
    candidate.title ? `Title: ${candidate.title}` : '',
    candidate.recipeYield ? `Yield: ${candidate.recipeYield}` : '',
    'Ingredients:',
    ...candidate.ingredients.map((ingredient) => `- ${ingredient}`),
    '',
    'Instructions:',
    ...candidate.instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== '')
    .join('\n')
    .trim()
    .slice(0, maxExtractedText);
}

function ogImageFromHtml(html: string): string | undefined {
  const ogPattern =
    /<meta\b[^>]*(?:property|name)\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i;
  const contentPattern =
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']og:image["']/i;
  const twitterPattern =
    /<meta\b[^>]*(?:property|name)\s*=\s*["']twitter:image["'][^>]*content\s*=\s*["']([^"']+)["']/i;

  const ogMatch = html.match(ogPattern) || html.match(contentPattern) || html.match(twitterPattern);
  if (ogMatch && ogMatch[1]) {
    return decodeHtmlEntities(ogMatch[1]).trim();
  }
  return undefined;
}

function absoluteImageUrl(value: string | undefined, sourceUrl?: string): string | undefined {
  if (!value || !sourceUrl) {
    return value;
  }
  try {
    const url = new URL(value, sourceUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function extractRecipeFromHtml(
  html: string,
  sourceUrl?: string,
): ExtractedWebRecipe | undefined {
  for (const block of jsonLdBlocks(html)) {
    try {
      const candidate = recipeFromJsonLd(JSON.parse(block));
      if (candidate) {
        return {
          title: candidate.title || titleFromHtml(html),
          text: textFromCandidate(candidate),
          ingredientCount: candidate.ingredients.length,
          instructionCount: candidate.instructions.length,
          thumbnailUrl: absoluteImageUrl(
            candidate.thumbnailUrl || ogImageFromHtml(html),
            sourceUrl,
          ),
        };
      }
    } catch {
      // Ignore malformed third-party JSON-LD blocks and keep looking.
    }
  }
  return undefined;
}

async function assertSafeWebUrl(value: string): Promise<URL> {
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

async function fetchHtml(url: URL, redirects = 0): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Rekky social recipe importer',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) {
        throw new Error('Too many redirects.');
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response did not include a location.');
      }
      return fetchHtml(await assertSafeWebUrl(new URL(location, url).toString()), redirects + 1);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error('URL did not return an HTML page.');
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxHtmlBytes) {
      throw new Error('HTML page is too large to import.');
    }
    return (await response.text()).slice(0, maxHtmlBytes);
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractWebRecipe(url: string): Promise<ExtractedWebRecipe | undefined> {
  const safeUrl = await assertSafeWebUrl(url);
  return extractRecipeFromHtml(await fetchHtml(safeUrl), safeUrl.toString());
}

function urlsFromText(text: string): string[] {
  const urls = new Set<string>();
  const matches = text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi);
  for (const match of matches) {
    const value = match[0]?.replace(/[.,;:!?]+$/, '');
    if (value) {
      urls.add(value);
    }
  }
  return [...urls].slice(0, 10);
}

function candidateScore(url: URL): number {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const text = `${host}${url.pathname}`.toLowerCase();
  let score = 0;
  if (ignoredDescriptionHosts.has(host)) {
    score -= 100;
  }
  if (/recipe|recipes|cook|cooking|kitchen|food|meal|dish|quesadilla/i.test(text)) {
    score += 25;
  }
  if (
    /subscribe|newsletter|shop|store|amazon|instagram|tiktok|facebook|youtube|sponsor/i.test(text)
  ) {
    score -= 20;
  }
  if (url.searchParams.size > 0) {
    score -= 2;
  }
  return score;
}

export function recipeLinksFromText(text: string): string[] {
  return urlsFromText(text)
    .map((value) => {
      try {
        const url = new URL(value);
        url.hash = '';
        return url;
      } catch {
        return undefined;
      }
    })
    .filter((url): url is URL => Boolean(url))
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .filter((url) => candidateScore(url) > -50)
    .map((url) => url.toString())
    .slice(0, 3);
}

export async function extractFirstLinkedRecipe(
  text: string,
): Promise<(ExtractedWebRecipe & { sourceUrl: string }) | undefined> {
  for (const sourceUrl of recipeLinksFromText(text)) {
    try {
      const recipe = await extractWebRecipe(sourceUrl);
      if (recipe) {
        return { ...recipe, sourceUrl };
      }
    } catch {
      // Try the next public URL from the description.
    }
  }
  return undefined;
}

function bestThumbnail(thumbnails: Record<string, unknown> | undefined): string | undefined {
  if (!thumbnails) {
    return undefined;
  }
  const preferred = ['maxres', 'standard', 'high', 'medium', 'default'];
  for (const key of preferred) {
    const value = thumbnails[key];
    if (value && typeof value === 'object') {
      const url = (value as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim()) {
        return url.trim();
      }
    }
  }
  return undefined;
}

function cleanMetadataText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value.replace(/\r\n?/g, '\n').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

export async function fetchYouTubeMetadata(
  videoId: string,
  apiKey = process.env.YOUTUBE_API_KEY,
): Promise<ExtractedYouTubeMetadata | undefined> {
  if (!apiKey?.trim() || !videoId.trim()) {
    return undefined;
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', apiKey);
  url.searchParams.set(
    'fields',
    'items(id,snippet(title,description,channelTitle,channelId,thumbnails))',
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Rekky social recipe importer',
      },
    });
    if (!response.ok) {
      throw new Error(`YouTube metadata request failed with HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      items?: Array<{ snippet?: Record<string, unknown> }>;
    };
    const snippet = data.items?.[0]?.snippet;
    if (!snippet) {
      return undefined;
    }
    const channelId = cleanMetadataText(snippet.channelId, 200);
    return {
      title: cleanMetadataText(snippet.title, 140),
      description: cleanMetadataText(snippet.description, maxExtractedText),
      creatorName: cleanMetadataText(snippet.channelTitle, 120),
      creatorUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : undefined,
      thumbnailUrl: bestThumbnail(snippet.thumbnails as Record<string, unknown> | undefined),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function positiveLimit(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), 1), max);
}

function snippetThumbnail(snippet: Record<string, unknown> | undefined): string | undefined {
  return bestThumbnail(snippet?.thumbnails as Record<string, unknown> | undefined);
}

async function fetchYouTubeJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Rekky social recipe importer',
      },
    });
    if (!response.ok) {
      throw new Error(`YouTube playlist request failed with HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYouTubePlaylistTitle(
  playlistId: string,
  apiKey: string,
): Promise<string | undefined> {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', playlistId);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('fields', 'items(snippet(title))');
  const data = (await fetchYouTubeJson(url)) as {
    items?: Array<{ snippet?: Record<string, unknown> }>;
  };
  return cleanMetadataText(data.items?.[0]?.snippet?.title, 140);
}

export async function fetchYouTubePlaylist(
  playlistId: string,
  maxItems: number,
  apiKey = process.env.YOUTUBE_API_KEY,
): Promise<ExtractedYouTubePlaylist> {
  if (!apiKey?.trim()) {
    throw new Error('YOUTUBE_API_KEY is required for playlist sync.');
  }
  const limit = positiveLimit(maxItems, 200, 500);
  const items: ExtractedYouTubePlaylistItem[] = [];
  let pageToken = '';

  while (items.length < limit) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', String(Math.min(50, limit - items.length)));
    url.searchParams.set('key', apiKey);
    url.searchParams.set(
      'fields',
      'nextPageToken,items(snippet(title,description,channelTitle,position,thumbnails),contentDetails(videoId))',
    );
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const data = (await fetchYouTubeJson(url)) as {
      nextPageToken?: string;
      items?: Array<{
        snippet?: Record<string, unknown>;
        contentDetails?: { videoId?: string };
      }>;
    };
    (data.items ?? []).forEach((item) => {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) {
        return;
      }
      items.push({
        videoId,
        title: cleanMetadataText(item.snippet?.title, 140),
        description: cleanMetadataText(item.snippet?.description, 500),
        creatorName: cleanMetadataText(item.snippet?.channelTitle, 120),
        thumbnailUrl: snippetThumbnail(item.snippet),
        position: typeof item.snippet?.position === 'number' ? item.snippet.position : undefined,
      });
    });
    if (!data.nextPageToken || !data.items?.length) {
      break;
    }
    pageToken = data.nextPageToken;
  }

  return {
    playlistId,
    title: await fetchYouTubePlaylistTitle(playlistId, apiKey),
    items,
  };
}
