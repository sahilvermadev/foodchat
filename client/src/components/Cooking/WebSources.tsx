import React, { memo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useCookingChat } from './CookingChatContext';
import { useLocalize } from '~/hooks';

type CookingWebSource = {
  title?: string;
  url: string;
  sourceType: 'search' | 'page' | 'video' | 'product' | 'safety';
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
    <div className="mt-3 flex flex-wrap gap-2" aria-label={localize('com_cooking_sources')}>
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-full rounded-full border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          title={source.url}
        >
          <span className="truncate">
            {source.title?.trim() || domain(source.url)}
          </span>
        </a>
      ))}
    </div>
  );
}

export default memo(WebSources);
