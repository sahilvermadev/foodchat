import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { ChatHistorySearchMatch, ChatHistorySearchResult } from 'librechat-data-provider';
import { useChatHistorySearchQuery } from '~/data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { cn } from '~/utils';

const sourceKeys = {
  title: 'com_ui_history_search_title_match',
  user: 'com_ui_history_search_you',
  assistant: 'com_ui_history_search_assistant',
  canvas: 'com_ui_history_search_canvas',
} as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const tokens = Array.from(new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
    if (tokens.length === 0) {
      return [text];
    }
    return text.split(new RegExp(`(${tokens.map(escapeRegex).join('|')})`, 'gi'));
  }, [query, text]);

  const queryTokens = useMemo(
    () => new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []),
    [query],
  );

  return (
    <>
      {parts.map((part, index) =>
        queryTokens.has(part.toLocaleLowerCase()) ? (
          <mark
            key={`${part}-${index}`}
            className="bg-[#c1121f]/15 text-inherit dark:bg-[#c1121f]/25"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function getPrimaryMatch(result: ChatHistorySearchResult): ChatHistorySearchMatch | undefined {
  return result.matches.find((match) => match.messageId) ?? result.matches[0];
}

export default function HistorySearch({
  query,
  setQuery,
  toggleNav,
}: {
  query: string;
  setQuery: (query: string) => void;
  toggleNav: () => void;
}) {
  const localize = useLocalize();
  const { conversationId: currentConvoId } = useParams();
  const { navigateToConvo } = useNavigateToConvo();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const { data, isFetching, isError } = useChatHistorySearchQuery(debouncedQuery);
  const results = data?.results ?? [];
  const isSearchActive = query.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  const openResult = (result: ChatHistorySearchResult) => {
    const match = getPrimaryMatch(result);
    toggleNav();
    navigateToConvo(result, {
      currentConvoId,
      resetLatestMessage: true,
      targetMessageId: match?.messageId,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('');
      return;
    }
    if (results.length === 0 || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      if (event.key === 'Enter' && results[activeIndex]) {
        event.preventDefault();
        openResult(results[activeIndex]);
      }
      return;
    }

    event.preventDefault();
    const nextIndex = event.key === 'ArrowDown' ? activeIndex : results.length - 1;
    setActiveIndex(nextIndex);
    resultRefs.current[nextIndex]?.focus();
  };

  const handleResultKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    resultIndex: number,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      inputRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (resultIndex + direction + results.length) % results.length;
    setActiveIndex(nextIndex);
    resultRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={cn('flex min-h-0 flex-col', isSearchActive && 'flex-1')}>
      <div className="relative px-3 pb-3 pt-4">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-5 top-[1.65rem] h-4 w-4 text-text-tertiary"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={localize('com_ui_history_search_placeholder')}
          aria-label={localize('com_ui_history_search_placeholder')}
          role="combobox"
          aria-controls="chat-history-search-results"
          aria-expanded={isSearchActive}
          className="rekky-history-search-input dark:hover:border-white/12 h-10 w-full rounded-xl border border-black/10 bg-white/45 pl-9 pr-9 text-sm text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] outline-none transition-colors placeholder:text-text-secondary hover:bg-white/60 focus:border-black/10 focus:bg-white/60 dark:border-white/10 dark:bg-white/[0.055] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] dark:hover:bg-white/[0.075] dark:focus:border-white/10 dark:focus:bg-white/[0.075]"
        />
        {isSearchActive && (
          <button
            type="button"
            title={localize('com_ui_clear_search')}
            aria-label={localize('com_ui_clear_search')}
            onClick={() => setQuery('')}
            className="absolute right-5 top-[1.45rem] flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-black/[0.045] hover:text-text-primary dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isSearchActive && (
        <div
          id="chat-history-search-results"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        >
          {(query.trim().length < 2 || debouncedQuery.length < 2) && (
            <p className="px-3 py-4 text-sm text-text-secondary">
              {localize('com_ui_history_search_hint')}
            </p>
          )}
          {debouncedQuery.length >= 2 && isFetching && results.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-text-secondary">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {localize('com_ui_history_search_searching')}
            </div>
          )}
          {debouncedQuery.length >= 2 && isError && (
            <p className="px-3 py-4 text-sm text-red-600 dark:text-red-400">
              {localize('com_ui_history_search_error')}
            </p>
          )}
          {debouncedQuery.length >= 2 && !isFetching && !isError && results.length === 0 && (
            <p className="px-3 py-4 text-sm text-text-secondary">
              {localize('com_ui_history_search_no_results')}
            </p>
          )}
          {results.map((result, index) => {
            const match = getPrimaryMatch(result);
            if (!match) {
              return null;
            }
            const date = match.createdAt ?? result.updatedAt;
            return (
              <button
                key={result.conversationId}
                ref={(element) => {
                  resultRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleResultKeyDown(event, index)}
                onClick={() => openResult(result)}
                className={cn(
                  'w-full border-b border-border-light px-3 py-3 text-left outline-none last:border-b-0 hover:bg-surface-hover focus:bg-surface-hover',
                  activeIndex === index && 'bg-surface-hover',
                )}
              >
                <span className="block truncate text-sm font-medium text-text-primary">
                  <HighlightedText
                    text={result.title || localize('com_ui_untitled')}
                    query={debouncedQuery}
                  />
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-text-secondary">
                  <HighlightedText text={match.excerpt} query={debouncedQuery} />
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                  <span>{localize(sourceKeys[match.source])}</span>
                  {date && <span aria-hidden="true">|</span>}
                  {date && <span>{new Date(date).toLocaleDateString()}</span>}
                  {result.totalMatches > 1 && <span aria-hidden="true">|</span>}
                  {result.totalMatches > 1 && (
                    <span>
                      {localize('com_ui_history_search_matches', {
                        count: result.totalMatches,
                      })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
