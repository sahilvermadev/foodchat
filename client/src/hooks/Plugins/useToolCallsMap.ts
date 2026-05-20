import type { ToolCallResult } from 'librechat-data-provider';

type ToolCallsMap = {
  [x: string]: ToolCallResult[] | undefined;
};

export default function useToolCallsMap({
  conversationId: _conversationId,
}: {
  conversationId: string;
}): ToolCallsMap | undefined {
  return undefined;
}
