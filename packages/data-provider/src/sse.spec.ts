import { createSSEParser } from './sse';

describe('createSSEParser', () => {
  it('emits JSON events split across network chunks and preserves the unfinished frame', () => {
    const parser = createSSEParser<{ text: string }>();

    expect(parser.push('event: message\ndata: {"text":"Hel')).toEqual([]);
    expect(
      parser.push('lo"}\n\nevent: message\ndata: {"text":"world"}\n\nevent: message\nda'),
    ).toEqual([{ text: 'Hello' }, { text: 'world' }]);
    expect(parser.push('ta: {"text":"done"}\n\n')).toEqual([{ text: 'done' }]);
  });
});
