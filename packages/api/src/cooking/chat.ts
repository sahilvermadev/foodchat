export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type CookingImageBlock = {
  type: 'image_url';
  image_url: string | { url: string; detail?: 'auto' | 'low' | 'high' };
};

export type CookingTextBlock = {
  type: 'text';
  text: string;
};

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
  content: string | Array<CookingTextBlock | CookingImageBlock> | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};
