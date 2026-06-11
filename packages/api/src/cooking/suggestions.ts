import type { CookingTurnIntent } from './understanding';

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

export const textPromptSuggestionCallPattern =
  /(?:```(?:\w+)?\s*)?set_prompt_suggestions\s*\(\s*suggestions\s*=\s*(\[[\s\S]*?\])\s*\)\s*;?\s*(?:```)?/gi;

export const suggestionsCache = new Map<string, string[]>();

export function getCachedSuggestions(text: string): string[] | undefined {
  const key = text.trim();
  return suggestionsCache.get(key);
}

export function setCachedSuggestions(text: string, suggestions: string[]): void {
  const key = text.trim();
  if (key && suggestions.length > 0) {
    suggestionsCache.set(key, suggestions);
  }
}

export function defaultSuggestionsForIntent(intent: CookingTurnIntent): string[] {
  switch (intent) {
    case 'quick_recommendation':
      return [
        'Can you give me another recommendation?',
        'How long will this take to prep?',
        'What ingredients do I need for this?',
      ];
    case 'recipe_request':
      return [
        'Can you show me the full ingredients list?',
        'Can I swap any of these ingredients?',
        'How many servings does this make?',
      ];
    case 'document_question':
      return [
        'What kitchen tools will I need?',
        'How do I store the leftovers?',
        'Can you explain the instructions again?',
      ];
    case 'document_edit':
      return [
        'Can we scale this to more servings?',
        'Can you make it gluten-free?',
        'Can we make it a bit spicier?',
      ];
    case 'source_driven_request':
      return [
        'Are there any regional variations?',
        'What is the traditional way to serve this?',
        'Is there a quick version of this recipe?',
      ];
    case 'research_request':
      return [
        'Can you summarize the search results?',
        'What are the key cooking tips here?',
        'Which sources did you consult?',
      ];
    case 'general_cooking_question':
    default:
      return [
        'What can I cook with what is in my fridge?',
        'Can you suggest a quick and easy recipe?',
        'What are some basic cooking techniques?',
      ];
  }
}

export function sanitizePromptSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const suggestion = item.trim().replace(/\s+/g, ' ');
    if (!suggestion || suggestion.length > 90) {
      continue;
    }
    const key = suggestion.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length === 3) {
      break;
    }
  }

  return suggestions;
}

export function extractTextPromptSuggestions(text: string): {
  text: string;
  promptSuggestions: string[];
} {
  const suggestions: string[] = [];
  const visibleText = text.replace(textPromptSuggestionCallPattern, (_call, serialized: string) => {
    try {
      const parsed: unknown = JSON.parse(serialized);
      suggestions.push(...sanitizePromptSuggestions(parsed));
    } catch {
      return '';
    }
    return '';
  });

  return {
    text: visibleText.replace(/\n{3,}/g, '\n\n').trim(),
    promptSuggestions: sanitizePromptSuggestions(suggestions),
  };
}

export async function generatePromptSuggestions(
  messages: ChatMessage[],
  responseText: string,
  model: string,
  promptSuggestionTool: AvailableCookingTool,
  complete: CompleteCallback,
): Promise<string[]> {
  if (!promptSuggestionTool || !responseText.includes('?')) {
    return [];
  }

  try {
    const assistant = await complete(
      [
        ...messages,
        {
          role: 'system',
          content: [
            'You add optional prompt suggestion chips after a completed cooking reply.',
            'Do not answer the user again. Call set_prompt_suggestions with zero to three exact prompts the user could send next.',
            'Use suggestions only when the completed reply offers meaningful next steps or asks the user to make a decision. For a rhetorical or informational question, submit an empty suggestions array.',
            'Suggestions should be concise, specific to the reply and conversation, and never generic filler.',
            '',
            'Completed user-facing reply:',
            responseText,
          ].join('\n'),
        },
      ],
      model,
      [promptSuggestionTool],
      undefined,
      { type: 'function', function: { name: 'set_prompt_suggestions' } },
      0.1,
    );
    const toolCall = assistant.tool_calls?.find(
      (candidate) => candidate.function.name === 'set_prompt_suggestions',
    );
    if (toolCall) {
      const parsedArgs: unknown = JSON.parse(toolCall.function.arguments);
      if (parsedArgs && typeof parsedArgs === 'object' && 'suggestions' in parsedArgs) {
        return sanitizePromptSuggestions((parsedArgs as { suggestions: unknown }).suggestions);
      }
    }
    return [];
  } catch {
    return [];
  }
}
