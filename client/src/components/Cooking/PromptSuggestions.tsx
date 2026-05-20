import React, { memo, useCallback } from 'react';
import type { TMessage } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import { useCookingChat } from './CookingChatContext';

type PromptSuggestionsProps = {
  ask: TAskFunction;
  message: TMessage;
  isLatestMessage: boolean;
  isSubmitting: boolean;
};

export function getCookingPromptSuggestions(message: TMessage): string[] {
  const value = message.metadata?.cookingPromptSuggestions;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((suggestion): suggestion is string => typeof suggestion === 'string');
}

function PromptSuggestions({
  ask,
  message,
  isLatestMessage,
  isSubmitting,
}: PromptSuggestionsProps) {
  const { isCookingChat } = useCookingChat();
  const suggestions = getCookingPromptSuggestions(message);

  const handleClick = useCallback(
    (suggestion: string) => {
      ask({ text: suggestion });
    },
    [ask],
  );

  if (
    !isCookingChat ||
    !isLatestMessage ||
    isSubmitting ||
    message.isCreatedByUser ||
    suggestions.length === 0
  ) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="max-w-full rounded-full border border-border-light bg-surface-secondary px-3 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          onClick={() => handleClick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

export default memo(PromptSuggestions);
