export type SSEParser<T> = {
  push(chunk: string): T[];
};

export function createSSEParser<T>(): SSEParser<T> {
  let buffer = '';

  return {
    push(chunk) {
      buffer += chunk;
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      const events: T[] = [];

      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        events.push(JSON.parse(data) as T);
      }

      return events;
    },
  };
}
