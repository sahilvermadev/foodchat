import type { Root, Text } from 'mdast';
import type { Node, Parent } from 'unist';

const TIMER_TOKEN_PATTERN = /\[timer:(\d+)(?:\|([^\]]+))?\]/gi;

type TextPart =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'timer';
      seconds: number;
      label?: string;
    };

type TimerNode = Node & {
  type: 'rekkyTimer';
  data: {
    hName: 'rekky-timer';
    hProperties: {
      seconds: number;
      label?: string;
    };
  };
  children: [];
};

function isParent(node: Node): node is Parent {
  return 'children' in node && Array.isArray(node.children);
}

function walkMarkdownTree(node: Node): void {
  if (!isParent(node)) {
    return;
  }

  const nextChildren: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      nextChildren.push(...timerTextToMarkdownNodes((child as Text).value));
      continue;
    }

    walkMarkdownTree(child);
    nextChildren.push(child);
  }

  node.children = nextChildren;
}

export function splitTimerText(value: string): TextPart[] {
  TIMER_TOKEN_PATTERN.lastIndex = 0;
  const parts: TextPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = TIMER_TOKEN_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, match.index) });
    }

    const seconds = Math.max(1, Number(match[1]));
    const label = match[2]?.trim();
    parts.push({
      type: 'timer',
      seconds,
      ...(label ? { label } : {}),
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value }];
}

export function timerTextToMarkdownNodes(value: string): Array<Text | TimerNode> {
  const parts = splitTimerText(value);
  return parts.map((part) => {
    if (part.type === 'text') {
      return {
        type: 'text',
        value: part.value,
      };
    }

    return {
      type: 'rekkyTimer',
      data: {
        hName: 'rekky-timer',
        hProperties: {
          seconds: part.seconds,
          ...(part.label ? { label: part.label } : {}),
        },
      },
      children: [],
    };
  });
}

export function remarkCookingTimers() {
  return (tree: Root) => {
    walkMarkdownTree(tree);
  };
}
