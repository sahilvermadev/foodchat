import React, { memo } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import { useCookingChat } from './CookingChatContext';
import { useLocalize } from '~/hooks';

type CookingWebSource = {
  title?: string;
  url: string;
  sourceType: 'search' | 'page' | 'recipe' | 'video' | 'product' | 'safety';
  accessedAt: string;
};

type WebSourcesProps = {
  message: TMessage;
};

export function getCookingWebSources(message: TMessage): CookingWebSource[] {
  const value = message.metadata?.cookingWebSources;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((source): source is CookingWebSource => {
    return (
      source != null &&
      typeof source === 'object' &&
      typeof source.url === 'string' &&
      typeof source.accessedAt === 'string'
    );
  });
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function WebSources({ message }: WebSourcesProps) {
  const { isCookingChat } = useCookingChat();
  const localize = useLocalize();
  const sources = getCookingWebSources(message);

  if (!isCookingChat || message.isCreatedByUser || sources.length === 0) {
    return null;
  }

  return (
    <section
      className="mt-4 max-w-xl border-t border-border-light pt-3"
      aria-label={localize('com_cooking_sources')}
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        {localize('com_cooking_sources')}
      </h3>
      <ol className="space-y-1">
        {sources.map((source, index) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-border-xheavy"
              title={source.url}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs text-text-secondary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text-primary">
                  {source.title?.trim() || domain(source.url)}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {domain(source.url)}
                </span>
              </span>
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default memo(WebSources);
