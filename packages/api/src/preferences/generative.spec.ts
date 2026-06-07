import { getPreferences } from './service';
import { streamGenerativePrompts } from './generative';

jest.mock('./service', () => ({
  getPreferences: jest.fn(),
}));

const mockedGetPreferences = jest.mocked(getPreferences);

function streamingResponse(content: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      content.forEach((text) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
          ),
        );
      });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('streamGenerativePrompts', () => {
  const originalApiKey = process.env.GENERATIVE_PROMPTS_API_KEY;
  const originalModel = process.env.GENERATIVE_PROMPTS_MODEL;

  beforeEach(() => {
    process.env.GENERATIVE_PROMPTS_API_KEY = 'test-key';
    process.env.GENERATIVE_PROMPTS_MODEL = 'test/server-model';
    mockedGetPreferences.mockResolvedValue({
      _id: 'preferences-1',
      user: 'user-1',
      markdown: '## Safety\n- No peanuts',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.GENERATIVE_PROMPTS_API_KEY = originalApiKey;
    process.env.GENERATIVE_PROMPTS_MODEL = originalModel;
  });

  test('publishes each validated suggestion as its streamed object completes', async () => {
    const suggestions = [
      {
        slot: 'efficient',
        title: 'Fast Dal',
        text: 'Cook a fast dal with pantry lentils for lunch.',
        prompt_injection: 'Create a fast pantry dal recipe for lunch.',
      },
      {
        slot: 'seasonal',
        title: 'Mango Compote',
        text: 'Make mango compote while the fruit is at its best.',
        prompt_injection: 'Create a seasonal mango compote recipe.',
      },
      {
        slot: 'experimental',
        title: 'Miso Aubergine',
        text: 'Glaze aubergine with miso for a focused weekend project.',
        prompt_injection: 'Create a miso-glazed aubergine cooking project.',
      },
    ];
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(streamingResponse(suggestions.map((item) => `${JSON.stringify(item)}\n`)));
    const lines: string[] = [];

    const result = await streamGenerativePrompts(
      {
        user: 'user-1',
        environmentalContext: {
          current_time: '2026-06-07T10:00:00.000Z',
          day_of_week: 'Sunday',
          current_month: 'June',
        },
      },
      { write: (line) => lines.push(line) },
    );

    expect(result?.elements['suggestion-1']).toMatchObject({
      type: 'SuggestionLink',
      props: { title: 'Fast Dal' },
    });
    expect(lines.map((line) => JSON.parse(line).path)).toEqual([
      '/root',
      '/elements/suggestions',
      '/elements/suggestion-1',
      '/elements/suggestion-2',
      '/elements/suggestion-3',
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      model: 'test/server-model',
      stream: true,
    });
  });
});
