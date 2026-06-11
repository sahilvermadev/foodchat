import type { CookingWebSource } from './web';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | any[] | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type CookingToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type AvailableCookingTool = CookingToolDefinition;

export type ToolChoice =
  | 'auto'
  | {
      type: 'function';
      function: { name: string };
    };

export type CompleteCallback = (
  messages: ChatMessage[],
  model: string,
  availableTools: AvailableCookingTool[],
  onTextDelta?: (delta: string) => void | Promise<void>,
  toolChoice?: ToolChoice,
  temperature?: number,
) => Promise<ChatMessage>;

export function normalizedSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

export function citedWebSources(
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

export function sourceLabel(source: CookingWebSource): string {
  if (source.title?.trim()) {
    return source.title.trim();
  }
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
}

export function normalizedSourceText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[[\]()`*_#>]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function sourceAttributionVariants(sources: CookingWebSource[]): string[] {
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

export function isSourceAttributionLine(line: string, sourceVariants: string[]): boolean {
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

export function isAttributionOnlyResponse(text: string, sources: CookingWebSource[] = []): boolean {
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

export function citedFallbackResponse(text: string, source: CookingWebSource): string {
  return `${text}\n\nReference: [${sourceLabel(source)}](${source.url})`;
}

export function linkCitationsLocally(
  text: string,
  sources: CookingWebSource[],
  limit: number,
): { text: string; success: boolean; citations: CookingWebSource[] } {
  let updatedText = text;
  const linkedSources: CookingWebSource[] = [];
  const limitSources = sources.slice(0, limit);

  // 1. Check if the text already contains a valid markdown link to any of the sources
  const existingCitations = citedWebSources(text, limitSources, limit);
  if (existingCitations.length > 0) {
    return { text, success: true, citations: existingCitations };
  }

  // 2. Scan and replace number markers like [1], (1), [Source 1], (Source 1)
  const sourceNumberPattern = /(?:\[|(?:\b(?:source|reference)\s+)?\()(\d+)(?:\]|\))/gi;
  updatedText = updatedText.replace(sourceNumberPattern, (match, numStr: string) => {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < limitSources.length) {
      const source = limitSources[idx];
      if (!linkedSources.includes(source)) {
        linkedSources.push(source);
      }
      return `[${sourceLabel(source)}](${source.url})`;
    }
    return match;
  });

  // 3. Scan and replace conceptual name markers in parentheses or brackets, e.g. (Gordon Ramsay's Fish And Chips Recipe)
  for (const source of limitSources) {
    const label = sourceLabel(source);
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const labelPattern = new RegExp(`(?:\\(|\\b)\\[?${escapedLabel}\\]?(?:\\)|\\b)`, 'gi');
    if (labelPattern.test(updatedText)) {
      if (!linkedSources.includes(source)) {
        linkedSources.push(source);
      }
      updatedText = updatedText.replace(labelPattern, `[${label}](${source.url})`);
    } else {
      try {
        const hostname = new URL(source.url).hostname.replace(/^www\./, '');
        if (hostname.length > 4) {
          const escapedHost = hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const hostPattern = new RegExp(`(?:\\(|\\b)\\[?${escapedHost}\\]?(?:\\)|\\b)`, 'gi');
          if (hostPattern.test(updatedText)) {
            if (!linkedSources.includes(source)) {
              linkedSources.push(source);
            }
            updatedText = updatedText.replace(hostPattern, `[${label}](${source.url})`);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  // 4. If we successfully linked at least one source, return success!
  if (linkedSources.length > 0) {
    return { text: updatedText, success: true, citations: linkedSources };
  }

  // 5. Fallback: append reference footer
  const primarySource = limitSources[0];
  const fallbackText = citedFallbackResponse(text, primarySource);
  return { text: fallbackText, success: true, citations: [primarySource] };
}

export async function ensureInlineSourceCitations(
  messages: ChatMessage[],
  text: string,
  sources: CookingWebSource[],
  model: string,
  sourceLimit: number,
  correctionModels: string[],
  complete: CompleteCallback,
): Promise<{ text: string; sources: CookingWebSource[] }> {
  if (!text || sources.length === 0) {
    return { text, sources: [] };
  }
  const attributionOnly = isAttributionOnlyResponse(text, sources);
  const existingCitations = citedWebSources(text, sources, sourceLimit);
  if (!attributionOnly && existingCitations.length > 0) {
    return { text, sources: existingCitations };
  }

  // Optimize latency in production: Try formatting and linking the citations locally first!
  if (!attributionOnly && process.env.NODE_ENV !== 'test') {
    const localResult = linkCitationsLocally(text, sources, sourceLimit);
    if (localResult.success && localResult.citations.length > 0) {
      return { text: localResult.text, sources: localResult.citations };
    }
  }

  // Fallback: If local linking failed, we can still fall back to the completions rewrite (preserved for agentic safety)
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
  for (const correctionModel of correctionModels) {
    try {
      const revised = await complete(
        correctionMessages,
        correctionModel,
        [],
        undefined,
        'auto',
        0.1,
      );
      const contentStr = typeof revised.content === 'string' ? revised.content : '';
      const revisedText = contentStr.trim();
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
