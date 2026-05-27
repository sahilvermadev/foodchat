import { RerankerTypes, ScraperProviders, SearchProviders } from 'librechat-data-provider';

import type { CookingDraft, TCustomConfig, TMessage } from 'librechat-data-provider';

import { extractTextPromptSuggestions, runCookingChat, sanitizePromptSuggestions } from './agent';
import { createCookingWebContext } from './web';
import { generateCookingDraft, getCookingDraftByConversation, updateCookingDraft } from './service';

jest.mock('./service', () => ({
  generateCookingDraft: jest.fn(),
  getCookingDraftByConversation: jest.fn(),
  updateCookingDraft: jest.fn(),
}));

describe('cooking agent prompt suggestions', () => {
  const originalKey = process.env.COOKING_AGENT_API_KEY;
  const originalFallbackModel = process.env.COOKING_AGENT_FALLBACK_MODEL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.COOKING_AGENT_API_KEY = 'test-key';
    jest.mocked(generateCookingDraft).mockResolvedValue(activeDraft());
    jest.mocked(getCookingDraftByConversation).mockResolvedValue(activeDraft());
    jest.mocked(updateCookingDraft).mockResolvedValue(activeDraft());
  });

  afterEach(() => {
    process.env.COOKING_AGENT_API_KEY = originalKey;
    process.env.COOKING_AGENT_FALLBACK_MODEL = originalFallbackModel;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  function activeDraft(): CookingDraft {
    return {
      _id: 'draft-1',
      user: 'user-1',
      conversationId: 'conversation-1',
      prompt: 'Authentic Village-Style Masala Chhach',
      status: 'active',
      documentType: 'recipe',
      selected: true,
      recipe: {
        title: 'Authentic Village-Style Masala Chhach',
        description: '',
        servings: 4,
        timing: { prepMinutes: 10, cookMinutes: 0, totalMinutes: 10 },
        ingredients: [
          {
            id: 'ingredient-1',
            originalText: 'dahi',
            item: 'dahi',
            quantityType: 'estimated',
          },
        ],
        steps: [
          {
            id: 'step-1',
            order: 1,
            text: 'Churn the dahi with water.',
            ingredientIds: ['ingredient-1'],
            timers: [],
            warnings: [],
            tips: [],
          },
        ],
        notes: [],
        tags: [],
      },
      documentMarkdown: [
        '# Authentic Village-Style Masala Chhach',
        '',
        'A cool, savory buttermilk drink built around churned dahi, roasted cumin, black salt, and fresh herbs.',
        '',
        '## Ingredients',
        '',
        '| Ingredient | Metric | Imperial | State/Form | Notes |',
        '| --- | --- | --- | --- | --- |',
        '| Dahi | 480 ml | 2 cups | chilled | preferably homemade |',
        '| Water | 360 ml | 1 1/2 cups | cold | adjust for texture |',
        '',
        '## Instructions',
        '',
        '1. Mix the dahi with cold water until loose and smooth.',
        '2. Stir in roasted cumin, black salt, and herbs, then serve cold.',
      ].join('\n'),
      expiresAt: '2026-05-19T00:00:00.000Z',
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
    };
  }

  function setFetch(fetchMock: jest.Mock): void {
    global.fetch = fetchMock as unknown as typeof fetch;
  }

  function webSearchConfig(): NonNullable<TCustomConfig['webSearch']> {
    return {
      searchProvider: SearchProviders.TAVILY,
      scraperProvider: ScraperProviders.TAVILY,
      rerankerType: RerankerTypes.NONE,
      tavilyApiKey: '${TAVILY_API_KEY}',
    };
  }

  test('sanitizes empty, too-long, malformed, and duplicate suggestions', () => {
    expect(
      sanitizePromptSuggestions([
        '  How do I tell when the sauce is reduced enough?  ',
        '',
        42,
        'How do I tell when the sauce is reduced enough?',
        'x'.repeat(91),
        'Can you give me a prep plan for making this after work?',
        'What variation would be closest to the regional original?',
        'This fourth valid prompt should be ignored.',
      ]),
    ).toEqual([
      'How do I tell when the sauce is reduced enough?',
      'Can you give me a prep plan for making this after work?',
      'What variation would be closest to the regional original?',
    ]);
  });

  test('extracts a text-emitted suggestion call without exposing protocol text', () => {
    expect(
      extractTextPromptSuggestions(`The poolish gives the baguette its depth.

set_prompt_suggestions(suggestions=[
"Let's draft the Poolish Baguette recipe.",
"How does Delhi weather affect fermentation?"
])`),
    ).toEqual({
      text: 'The poolish gives the baguette its depth.',
      promptSuggestions: [
        "Let's draft the Poolish Baguette recipe.",
        'How does Delhi weather affect fermentation?',
      ],
    });
  });

  test('turns a text-emitted suggestion call into response metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: `Use a poolish and a covered bake for stronger flavor and steam.

set_prompt_suggestions(suggestions=["Draft the baguette recipe.", "How should I shape it?"])`,
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Help me bake baguettes.',
    });

    expect(result.text).toBe('Use a poolish and a covered bake for stronger flavor and steam.');
    expect(result.promptSuggestions).toEqual([
      'Draft the baguette recipe.',
      'How should I shape it?',
    ]);
  });

  test('enriches an exploratory response with prompt suggestions after the answer is complete', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'An inverted pan is the lowest-hassle steam method. Would you like me to draft the poolish baguette recipe now?',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'suggestions-backfill',
                    type: 'function',
                    function: {
                      name: 'set_prompt_suggestions',
                      arguments: JSON.stringify({
                        suggestions: [
                          'Draft the poolish baguette recipe.',
                          'Show me the simplest shaping method.',
                          'Explain the overnight schedule first.',
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'I want a low-hassle steaming method.',
    });
    const backfillBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(backfillBody.tools).toHaveLength(1);
    expect(backfillBody.tools[0].function.name).toBe('set_prompt_suggestions');
    expect(backfillBody.tool_choice).toEqual({
      type: 'function',
      function: { name: 'set_prompt_suggestions' },
    });
    expect(result.promptSuggestions).toEqual([
      'Draft the poolish baguette recipe.',
      'Show me the simplest shaping method.',
      'Explain the overnight schedule first.',
    ]);
  });

  test('does not request suggestions for an informational answer without a next-step choice', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Steam delays crust setting so the loaf can expand before it crisps.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Why does steam matter?',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.promptSuggestions).toEqual([]);
  });

  test('recovers an empty provider completion instead of exposing generic filler text', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: null } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Start by building or obtaining an active starter before mixing a loaf.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'I want to make sourdough bread.',
    });
    const recoveryBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(result.text).toBe(
      'Start by building or obtaining an active starter before mixing a loaf.',
    );
    expect(result.text).not.toBe('I can help with that.');
    expect(recoveryBody.tools).toEqual([]);
  });

  test('does not execute presentation suggestion tools during response generation', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'suggestions-1',
                    type: 'function',
                    function: {
                      name: 'set_prompt_suggestions',
                      arguments: JSON.stringify({
                        suggestions: ['Skip the answer and show this chip.'],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'A sourdough loaf begins with an active starter; first decide whether you need to build one.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'I want to make sourdough bread.',
    });
    const responseBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(
      responseBody.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).not.toContain('set_prompt_suggestions');
    expect(result.text).toContain('A sourdough loaf begins with an active starter');
    expect(result.promptSuggestions).toEqual([]);
  });

  test('streams provider text deltas while returning the full assistant text', async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"role":"assistant"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"Use a wide "}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"pan."}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: stream,
    });
    const deltas: string[] = [];

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'How do I brown onions?',
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.stream).toBe(true);
    expect(deltas.join('')).toBe('Use a wide pan.');
    expect(result.text).toBe('Use a wide pan.');
  });

  test('does not stream a text-emitted suggestion call into the chat transcript', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"Start with a poolish.\\n\\nset_prompt_"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"suggestions(suggestions=[\\"Draft the recipe.\\"]) "}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: stream,
    });
    const deltas: string[] = [];

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Help me bake baguettes.',
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    expect(deltas.join('')).toBe('Start with a poolish.\n\n');
    expect(result.text).toBe('Start with a poolish.');
    expect(result.promptSuggestions).toEqual(['Draft the recipe.']);
  });

  test('retries once with the fallback model when the primary provider request fails before streaming', async () => {
    process.env.COOKING_AGENT_FALLBACK_MODEL = 'deepseek/deepseek-v4-pro';
    const timings: Array<{ stage: string; model?: string; error?: string }> = [];
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Use orange bitters if you have them; otherwise lean on citrus peel.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: "I don't have aromatic bitters for an old fashioned.",
      model: 'google/gemini-3.1-flash-lite',
      onTiming: (event) => timings.push(event),
    });

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstBody.model).toBe('google/gemini-3.1-flash-lite');
    expect(secondBody.model).toBe('deepseek/deepseek-v4-pro');
    expect(timings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'provider_response',
          model: 'google/gemini-3.1-flash-lite',
          error: 'fetch failed',
        }),
        expect.objectContaining({
          stage: 'provider_response',
          model: 'deepseek/deepseek-v4-pro',
        }),
      ]),
    );
    expect(result.text).toBe('Use orange bitters if you have them; otherwise lean on citrus peel.');
  });

  test('accumulates streamed tool call argument deltas before executing tools', async () => {
    const encoder = new TextEncoder();
    const toolStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"read-1","type":"function","function":{"name":"read_cooking_document","arguments":"{"}}]}}]}',
              '',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const textStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"Watch the onions, not the clock."}}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: toolStream,
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: textStream,
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'What is on the current recipe canvas?',
      activeDraft: activeDraft(),
    });

    expect(getCookingDraftByConversation).toHaveBeenCalledWith('user-1', 'conversation-1');
    expect(result.promptSuggestions).toEqual([]);
    expect(result.text).toBe('Watch the onions, not the clock.');
  });

  test('frames broad ingredient requests as ideation before recipe canvas work', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'Spinach and paneer can go several ways: palak paneer, quesadillas, pasta, toasties, or a warm bowl.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'I have spinach and paneer in my fridge. Suggest me some recipes.',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.messages[0].content).toContain('Decide by user need before choosing tools');
    expect(body.messages[0].content).toContain('If the user is still exploring');
    expect(body.messages[0].content).toContain('Do not imitate or quote any real chef');
    expect(body.messages[0].content).toContain(
      'Do not browse for routine cooking conversation, ordinary recipe requests, broad dish ideas, or technique guidance',
    );
  });

  test('does not expose web tools for an ordinary dish-name request', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'Blueberry cheesecake can go baked and dense or no-bake and lighter. If you want reliable today, I would start with a no-bake version and a quick blueberry compote.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'blueberry cheese cake',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).not.toContain('search_web');
    expect(toolNames).not.toContain('read_web_page');
    expect(toolNames).not.toContain('read_recipe_source');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.webSources).toEqual([]);
    expect(result.text).toContain('Blueberry cheesecake can go baked');
  });

  test('lets the model unlock web tools when it can justify external research', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'research-1',
                    type: 'function',
                    function: {
                      name: 'request_external_research',
                      arguments: JSON.stringify({
                        reason:
                          'The user asked for reliability across external recipe sources, which needs source comparison rather than memory.',
                        research_type: 'authenticity_or_source_comparison',
                        likely_query: 'reliable blueberry cheesecake recipe comparison',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'For reliability, I would compare baked versions for ratios, pan size, and chill time before recommending one.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Find me the most reliable blueberry cheesecake recipe.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const firstToolNames = firstBody.tools.map(
      (tool: { function: { name: string } }) => tool.function.name,
    );
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const secondToolNames = secondBody.tools.map(
      (tool: { function: { name: string } }) => tool.function.name,
    );

    expect(firstToolNames).toContain('request_external_research');
    expect(firstToolNames).not.toContain('search_web');
    expect(secondToolNames).toContain('search_web');
    expect(secondToolNames).toContain('read_web_page');
    expect(result.text).toContain('For reliability');
  });

  test('rejects malformed external research unlock requests without exposing web tools', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'research-1',
                    type: 'function',
                    function: {
                      name: 'request_external_research',
                      arguments: JSON.stringify({
                        reason:
                          'The model wants recipe inspiration, but the user did not ask for external evidence.',
                        research_type: 'recipe_inspiration',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'I can answer from cooking knowledge here: choose baked for dense texture or no-bake for speed.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'blueberry cheese cake',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const secondToolNames = secondBody.tools.map(
      (tool: { function: { name: string } }) => tool.function.name,
    );
    const toolError = secondBody.messages.find(
      (message: { role: string; content: string }) =>
        message.role === 'tool' && message.content.includes('External research type is malformed'),
    );

    expect(secondToolNames).toContain('request_external_research');
    expect(secondToolNames).not.toContain('search_web');
    expect(toolError).toBeTruthy();
    expect(result.text).toContain('I can answer from cooking knowledge');
  });

  test('drops stale history messages from other conversations', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Use the bacon with the Buldak noodles.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'current-buldak-conversation',
      text: 'lets go with recipe 1',
      messages: [
        {
          messageId: 'old-1',
          conversationId: 'old-paneer-conversation',
          isCreatedByUser: true,
          text: 'I have spinach and paneer.',
        },
        {
          messageId: 'current-1',
          conversationId: 'current-buldak-conversation',
          isCreatedByUser: true,
          text: 'I have carbonara Buldak noodles and bacon strips.',
        },
      ] as TMessage[],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const visibleText = body.messages
      .map((message: { content: string | null }) => message.content ?? '')
      .join('\n');

    expect(visibleText).not.toContain('spinach and paneer');
    expect(visibleText).toContain('carbonara Buldak noodles');
    expect(visibleText).toContain('lets go with recipe 1');
  });

  test('active canvas exposes read and revise tools without phrase matching', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Chhach is thinner and more digestive; lassi is richer and heavier.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'What is the difference between chhach and lassi?',
      activeDraft: activeDraft(),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toEqual([
      'create_cooking_document',
      'read_cooking_document',
      'revise_cooking_document',
    ]);
    expect(body.messages[0].content).toContain('Selected cooking document: yes');
    expect(body.messages[0].content).toContain('Selected document markdown:');
    expect(body.messages[0].content).toContain('| Dahi | 480 ml | 2 cups | chilled |');
    expect(body.messages[0].content).toContain('Chat is the right response for questions');
    expect(body.messages[0].content).toContain(
      'Prior discussion is not consent to edit the canvas',
    );
    const reviseTool = body.tools.find(
      (tool: { function: { name: string } }) => tool.function.name === 'revise_cooking_document',
    );
    expect(reviseTool.function.description).toContain('Replace only the selected cooking document');
  });

  test('no active canvas exposes create and not revise', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I can write that recipe.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Write a recipe for authentic masala chhach.',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toEqual(['create_cooking_document']);
    expect(toolNames).not.toContain('revise_cooking_document');
  });

  test('creates a separate guide while a recipe document is selected', async () => {
    const selected = activeDraft();
    const guideMarkdown = (selected.documentMarkdown ?? '').replace(
      '# Authentic Village-Style Masala Chhach',
      '# Sourdough Starter Guide',
    );
    jest.mocked(generateCookingDraft).mockResolvedValue({
      ...selected,
      _id: 'guide-1',
      documentType: 'guide',
      documentMarkdown: guideMarkdown,
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'create-guide',
                  type: 'function',
                  function: {
                    name: 'create_cooking_document',
                    arguments: JSON.stringify({
                      title: 'Sourdough Starter Guide',
                      document_type: 'guide',
                      markdown: guideMarkdown,
                      change_summary: 'created a starter guide',
                      user_message: 'I created a separate starter guide.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Create a separate sourdough starter guide.',
      activeDraft: selected,
      documents: [selected],
    });

    expect(generateCookingDraft).toHaveBeenCalledWith(
      'user-1',
      'Sourdough Starter Guide',
      'conversation-1',
      guideMarkdown,
      'guide',
    );
    expect(result.draft?._id).toBe('guide-1');
    expect(result.text).toBe('I created a separate starter guide.');
  });

  test('arrange the recipe better updates via revise_cooking_document', async () => {
    const draft = activeDraft();
    const currentMarkdown = draft.documentMarkdown ?? '';
    const revisedMarkdown = `${currentMarkdown}\n\n## Notes\n\n- The recipe is now grouped so equipment, ingredients, and steps are easier to scan.`;
    jest.mocked(updateCookingDraft).mockResolvedValue({
      ...draft,
      documentMarkdown: revisedMarkdown,
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'revise-1',
                  type: 'function',
                  function: {
                    name: 'revise_cooking_document',
                    arguments: JSON.stringify({
                      revision_type: 'structure',
                      markdown: revisedMarkdown,
                      change_summary: 'reorganized the recipe for easier scanning',
                      user_message: 'I reorganized the canvas so the recipe is easier to follow.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Arrange the recipe better.',
      activeDraft: draft,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toEqual([
      'create_cooking_document',
      'read_cooking_document',
      'revise_cooking_document',
    ]);
    expect(result).toMatchObject({
      draftChanged: true,
      text: 'I reorganized the canvas so the recipe is easier to follow.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("I don't have an immersion blender updates via revise_cooking_document", async () => {
    const draft = activeDraft();
    const revisedMarkdown = (draft.documentMarkdown ?? '').replace(
      '1. Mix the dahi with cold water until loose and smooth.',
      '1. Whisk the dahi with cold water in a deep bowl until loose and smooth; a mathani, balloon whisk, or jar shake all work if you do not have an immersion blender.',
    );
    jest.mocked(updateCookingDraft).mockResolvedValue({
      ...draft,
      documentMarkdown: revisedMarkdown,
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'revise-1',
                  type: 'function',
                  function: {
                    name: 'revise_cooking_document',
                    arguments: JSON.stringify({
                      revision_type: 'equipment_alternative',
                      markdown: revisedMarkdown,
                      change_summary: 'added non-blender alternatives',
                      user_message:
                        'I added whisk, mathani, and jar-shake alternatives to the canvas.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: "Looks good, but I don't have an immersion blender. Give me an alternative.",
      activeDraft: draft,
    });

    expect(result).toMatchObject({
      draftChanged: true,
      text: 'I added whisk, mathani, and jar-shake alternatives to the canvas.',
    });
  });

  test('what is a mathani answers in chat even though revise tool is available', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'A mathani is a traditional Indian wooden churner used to whisk curd or buttermilk.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'What is a mathani?',
      activeDraft: activeDraft(),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('create_cooking_document');
    expect(toolNames).toContain('revise_cooking_document');
    expect(body.messages[0].content).toContain('Chat is the right response for questions');
  });

  test('what is on the canvas uses read_cooking_document', async () => {
    const draft = activeDraft();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'read-1',
                    type: 'function',
                    function: {
                      name: 'read_cooking_document',
                      arguments: '{}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'The canvas is for Authentic Village-Style Masala Chhach.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'What is on the canvas?',
      activeDraft: draft,
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMessage = secondBody.messages.find(
      (message: { role: string; tool_call_id?: string }) =>
        message.role === 'tool' && message.tool_call_id === 'read-1',
    );
    expect(JSON.parse(toolMessage?.content ?? '{}').markdown).toBe(draft.documentMarkdown);
    expect(result.text).toBe('The canvas is for Authentic Village-Style Masala Chhach.');
  });

  test('canvas mutation returns user_message without a second provider call', async () => {
    const draft = activeDraft();
    jest.mocked(generateCookingDraft).mockResolvedValue({
      ...draft,
      recipe: { ...draft.recipe, title: 'Authentic Village-Style Masala Chhach' },
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'create-1',
                  type: 'function',
                  function: {
                    name: 'create_cooking_document',
                    arguments: JSON.stringify({
                      title: '{',
                      markdown: draft.documentMarkdown ?? '',
                      change_summary:
                        'created a village-style chhach with churned dahi and roasted cumin',
                      user_message:
                        'I created the masala chhach canvas with churned dahi, roasted cumin, and clear chilling cues.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Write a recipe for authentic masala chhach.',
    });

    expect(result.draftChanged).toBe(true);
    expect(result.text).toBe(
      'I created the masala chhach canvas with churned dahi, roasted cumin, and clear chilling cues.',
    );
    expect(generateCookingDraft).toHaveBeenCalledWith(
      'user-1',
      'Authentic Village-Style Masala Chhach',
      'conversation-1',
      draft.documentMarkdown,
      'recipe',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('overlong canvas user_message does not block creating the recipe canvas', async () => {
    const draft = activeDraft();
    const markdown = draft.documentMarkdown?.replace(
      '# Authentic Village-Style Masala Chhach',
      '# Cheese Souffle',
    );
    jest.mocked(generateCookingDraft).mockResolvedValue({
      ...draft,
      recipe: { ...draft.recipe, title: 'Cheese Souffle' },
      documentMarkdown: markdown,
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'create-1',
                  type: 'function',
                  function: {
                    name: 'create_cooking_document',
                    arguments: JSON.stringify({
                      title: 'Cheese Souffle',
                      markdown: markdown ?? '',
                      change_summary: 'created a cheese souffle recipe',
                      user_message:
                        'I created a complete cheese souffle canvas with equipment, ingredient groups, careful egg-white folding guidance, bake timing, doneness cues, recovery notes, serving notes, and practical timing advice for getting it to the table before it falls.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'give me a recipe for making a souffle',
    });

    expect(result).toMatchObject({
      draftChanged: true,
      text: 'I created Cheese Souffle in the cooking canvas.',
    });
    expect(generateCookingDraft).toHaveBeenCalled();
  });

  test('malformed markdown rejects and does not mark draftChanged', async () => {
    const draft = activeDraft();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'revise-1',
                    type: 'function',
                    function: {
                      name: 'revise_cooking_document',
                      arguments: JSON.stringify({
                        revision_type: 'other',
                        markdown: '# Broken\n\nNo usable recipe sections.',
                        change_summary: 'broke the canvas',
                        user_message: 'I updated the canvas.',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            { message: { role: 'assistant', content: 'Recipe canvas markdown is malformed.' } },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Make the recipe shorter.',
      activeDraft: draft,
    });

    expect(result.draftChanged).toBe(false);
    expect(result.text).toBe('Recipe canvas markdown is malformed.');
    expect(updateCookingDraft).not.toHaveBeenCalled();
  });

  test('empty no-op revision rejects and does not mark draftChanged', async () => {
    const draft = activeDraft();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'revise-1',
                    type: 'function',
                    function: {
                      name: 'revise_cooking_document',
                      arguments: JSON.stringify({
                        revision_type: 'other',
                        markdown: draft.documentMarkdown ?? '',
                        change_summary: 'left the recipe unchanged',
                        user_message: 'I updated the canvas.',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Recipe canvas revision did not change the current canvas.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Update it.',
      activeDraft: draft,
    });

    expect(result.draftChanged).toBe(false);
    expect(result.text).toBe('Recipe canvas revision did not change the current canvas.');
    expect(updateCookingDraft).not.toHaveBeenCalled();
  });

  test('canvas mutations do not depend on presentation suggestion tools', async () => {
    const draft = activeDraft();
    const currentMarkdown = draft.documentMarkdown ?? '';
    const revisedMarkdown = `${currentMarkdown}\n\n## Serving Notes\n\n- Serve alongside salty snacks.`;
    jest.mocked(updateCookingDraft).mockResolvedValue({
      ...draft,
      documentMarkdown: revisedMarkdown,
    });
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'revise-1',
                  type: 'function',
                  function: {
                    name: 'revise_cooking_document',
                    arguments: JSON.stringify({
                      revision_type: 'add_component',
                      markdown: revisedMarkdown,
                      change_summary: 'added serving notes',
                      user_message: 'I added serving notes to the canvas.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Add serving notes.',
      activeDraft: draft,
    });

    expect(result.promptSuggestions).toEqual([]);
    expect(result.text).toBe('I added serving notes to the canvas.');
  });

  test('linked recipe canvas creation is blocked when source preload fails', async () => {
    const draft = activeDraft();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          failed_results: [
            {
              url: 'https://www.seriouseats.com/savory-cheese-souffle',
              error: 'blocked',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'create-1',
                    type: 'function',
                    function: {
                      name: 'create_cooking_document',
                      arguments: JSON.stringify({
                        title: 'Savory Cheese Souffle',
                        markdown: draft.documentMarkdown ?? '',
                        change_summary: 'created a generic souffle',
                        user_message: 'I created the souffle canvas.',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I need the recipe text pasted here before I can use exact proportions.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Use this exact recipe: https://www.seriouseats.com/savory-cheese-souffle',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const thirdBody = JSON.parse(fetchMock.mock.calls[2][1].body);

    expect(secondBody.messages[0].content).toContain('Preloaded Linked Recipe Source');
    expect(thirdBody.messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'create-1',
        content: expect.stringContaining('read_recipe_source'),
      }),
    );
    expect(generateCookingDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      draftChanged: false,
      text: 'I need the recipe text pasted here before I can use exact proportions.',
    });
  });

  test('preloaded linked recipe source is visible before the provider creates a canvas', async () => {
    const draft = activeDraft();
    const sourceMarkdown = `${draft.documentMarkdown?.replace(
      '# Authentic Village-Style Masala Chhach',
      '# Savory Cheese Souffle',
    )}\n\n## Source Notes\n\n- Source proportions verified from Serious Eats.`;
    jest.mocked(generateCookingDraft).mockResolvedValue({
      ...draft,
      documentMarkdown: sourceMarkdown,
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://www.seriouseats.com/savory-cheese-souffle',
              title: 'Serious Eats Souffle',
              raw_content:
                '# Serious Eats Souffle\n\n## Ingredients\n\n- 3 tablespoons butter\n- 3 tablespoons flour\n- 1 cup milk\n- 4 eggs\n- 4 ounces Gruyere\n\n## Instructions\n\n1. Make the base.\n2. Fold in the egg whites.\n3. Bake until risen.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'create-after-read',
                    type: 'function',
                    function: {
                      name: 'create_cooking_document',
                      arguments: JSON.stringify({
                        title: 'Savory Cheese Souffle',
                        markdown: sourceMarkdown,
                        change_summary: 'created from the read Serious Eats source',
                        user_message: 'I created the Serious Eats-style souffle canvas.',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Use this exact recipe: https://www.seriouseats.com/savory-cheese-souffle',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const providerBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolNames = providerBody.tools.map(
      (tool: { function: { name: string } }) => tool.function.name,
    );

    expect(providerBody.messages[0].content).toContain('Preloaded Linked Recipe Source');
    expect(providerBody.messages[0].content).toContain('3 tablespoons butter');
    expect(providerBody.messages[0].content).toContain('server has already read');
    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
    expect(toolNames).not.toContain('read_recipe_source');
    expect(generateCookingDraft).toHaveBeenCalledTimes(1);
    expect(generateCookingDraft).toHaveBeenCalledWith(
      'user-1',
      'Savory Cheese Souffle',
      'conversation-1',
      sourceMarkdown,
      'recipe',
    );
    expect(result).toMatchObject({
      draftChanged: true,
      text: 'I created the Serious Eats-style souffle canvas.',
    });
  });

  test('omits internet tools when web auth is unavailable', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Web is not configured, so use general guidance.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Is this canning method safe?',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).not.toContain('search_web');
    expect(toolNames).not.toContain('read_web_page');
    expect(toolNames).not.toContain('read_recipe_source');
  });

  test('exposes internet tools when LibreChat web auth is available', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I would verify that with an extension source.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Is this canning method safe?',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
    expect(toolNames).toContain('read_recipe_source');
  });

  test('read_web_page rejects local and private URLs before fetching', async () => {
    const context = await createCookingWebContext({
      user: 'user-1',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    await expect(
      context.execute({
        function: {
          name: 'read_web_page',
          arguments: JSON.stringify({ url: 'http://localhost:3000/recipe' }),
        },
      }),
    ).rejects.toThrow('Private, local, or metadata URLs cannot be read.');
  });

  test('read_recipe_source returns recipe-oriented Tavily extraction details', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            url: 'https://example.com/brownies',
            title: 'Fudgy Brownies',
            raw_content: [
              '# Fudgy Brownies',
              '',
              'Yield: 16 brownies',
              '',
              '## Ingredients',
              '',
              '- 170 g butter',
              '- 200 g sugar',
              '- 2 eggs',
              '- 65 g cocoa powder',
              '',
              '## Instructions',
              '',
              '1. Melt the butter.',
              '2. Stir in sugar and eggs.',
              '3. Bake until just set.',
            ].join('\n'),
          },
        ],
      }),
    });
    setFetch(fetchMock);
    const context = await createCookingWebContext({
      user: 'user-1',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const result = await context.execute({
      function: {
        name: 'read_recipe_source',
        arguments: JSON.stringify({ url: 'https://example.com/brownies' }),
      },
    });
    const content = JSON.parse(result.content);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tavily.com/extract',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tavily-key' }),
      }),
    );
    expect(content.exactRecipeAvailable).toBe(true);
    expect(content.recipe).toMatchObject({
      yield: '16 brownies',
      confidence: 'high',
    });
    expect(content.recipe.ingredients).toContain('170 g butter');
    expect(result.sources).toEqual([
      expect.objectContaining({
        title: 'Fudgy Brownies',
        url: 'https://example.com/brownies',
        sourceType: 'recipe',
      }),
    ]);
  });

  test('caps ordinary search results but allows broader explicitly requested research', async () => {
    const results = Array.from({ length: 5 }, (_, index) => ({
      url: `https://example.com/source-${index + 1}`,
      title: `Source ${index + 1}`,
      content: `Finding ${index + 1}`,
    }));
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results }),
      });
    setFetch(fetchMock);
    const focused = await createCookingWebContext({
      user: 'user-1',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });
    const broad = await createCookingWebContext({
      user: 'user-1',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
      allowBroadResearch: true,
    });

    const focusedResult = await focused.execute({
      function: { name: 'search_web', arguments: JSON.stringify({ query: 'steam for baguettes' }) },
    });
    const broadResult = await broad.execute({
      function: { name: 'search_web', arguments: JSON.stringify({ query: 'compare methods' }) },
    });
    const focusedBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const broadBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(focusedBody.max_results).toBe(3);
    expect(focusedResult.sources).toHaveLength(3);
    expect(broadBody.max_results).toBe(5);
    expect(broadResult.sources).toHaveLength(5);
  });

  test('repairs researched answers without inline citations and exposes only cited sources', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'search-1',
                    type: 'function',
                    function: {
                      name: 'search_web',
                      arguments: JSON.stringify({ query: 'sourdough starter beginner timing' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/starter',
              title: 'Building a Starter',
              content: 'A starter commonly takes about a week to establish.',
            },
            {
              url: 'https://example.com/loaf',
              title: 'First Sourdough Loaf',
              content: 'A beginner loaf guide.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'A starter commonly needs about seven days before baking.',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'A starter commonly needs about seven days before baking, according to [Building a Starter](https://example.com/starter).',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Research sourdough starter beginner timing.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });
    const correctionBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    const correctionPrompt = correctionBody.messages[correctionBody.messages.length - 1].content;

    expect(result.text).toContain('[Building a Starter](https://example.com/starter)');
    expect(correctionPrompt).toContain('A starter commonly needs about seven days before baking.');
    expect(result.webSources).toEqual([
      expect.objectContaining({ title: 'Building a Starter', url: 'https://example.com/starter' }),
    ]);
  });

  test('does not accept a source-only researched completion as the user-facing answer', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'search-1',
                    type: 'function',
                    function: {
                      name: 'search_web',
                      arguments: JSON.stringify({ query: 'sourdough beginner bread' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/starter',
              title: 'Building a Starter',
              content: 'An active starter is needed before mixing a naturally leavened loaf.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Source: [Building a Starter](https://example.com/starter)',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'Sourdough begins with a lively starter rather than packaged yeast. If you do not have one yet, start there first; an active starter is what raises the loaf ([Building a Starter](https://example.com/starter)). Do you already have an active starter?',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Verify sourdough beginner bread guidance.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });
    const correctionBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    const correctionPrompt = correctionBody.messages[correctionBody.messages.length - 1].content;

    expect(correctionPrompt).toContain(
      'contains only source attribution and does not answer the user request',
    );
    expect(result.text).toContain('Sourdough begins with a lively starter');
    expect(result.text).not.toMatch(/^Source:/);
    expect(result.webSources).toEqual([
      expect.objectContaining({ title: 'Building a Starter', url: 'https://example.com/starter' }),
    ]);
  });

  test('does not accept plain source titles as a researched completion', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'search-1',
                    type: 'function',
                    function: {
                      name: 'search_web',
                      arguments: JSON.stringify({ query: 'blueberry cheesecake' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://beyondfrosting.com/blueberry-cheesecake/',
              title: 'Blueberry Cheesecake | Beyond Frosting',
              content: 'Blueberry cheesecake with a graham cracker crust and blueberry topping.',
            },
            {
              url: 'https://sugarspunrun.com/blueberry-cheesecake/',
              title: 'Blueberry Cheesecake - Sugar Spun Run',
              content: 'A baked blueberry cheesecake recipe.',
            },
            {
              url: 'https://www.thecookingfoodie.com/recipe/blueberry-cheesecake',
              title: 'Easy Baked Blueberry Cheesecake with Blueberry Sauce - The Cooking Foodie',
              content: 'Baked blueberry cheesecake served with blueberry sauce.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: [
                  'Sources:',
                  'Blueberry Cheesecake | Beyond Frosting',
                  'Blueberry Cheesecake - Sugar Spun Run',
                  'Easy Baked Blueberry Cheesecake with Blueberry Sauce - The Cooking Foodie',
                ].join('\n'),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'For blueberry cheesecake, make a graham cracker crust, bake a cream-cheese filling until just set, then finish it with blueberry sauce or compote ([Blueberry Cheesecake | Beyond Frosting](https://beyondfrosting.com/blueberry-cheesecake/)). Chill it fully before slicing so the filling firms up cleanly.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Research blueberry cheese cake sources.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });
    const correctionBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    const correctionPrompt = correctionBody.messages[correctionBody.messages.length - 1].content;

    expect(correctionPrompt).toContain(
      'contains only source attribution and does not answer the user request',
    );
    expect(result.text).toContain('For blueberry cheesecake');
    expect(result.text).not.toMatch(/^Sources:/);
    expect(result.webSources).toEqual([
      expect.objectContaining({
        title: 'Blueberry Cheesecake | Beyond Frosting',
        url: 'https://beyondfrosting.com/blueberry-cheesecake/',
      }),
    ]);
  });

  test('preserves researched advice with a source reference if citation repair fails', async () => {
    const draftAnswer =
      'A starter usually takes several days of daily feedings. Do you already have one?';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'search-1',
                    type: 'function',
                    function: {
                      name: 'search_web',
                      arguments: JSON.stringify({ query: 'sourdough starter beginner timing' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/starter',
              title: 'Building a Starter',
              content: 'A starter commonly takes about a week to establish.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: draftAnswer } }],
        }),
      })
      .mockRejectedValueOnce(new Error('provider unavailable'));

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Research sourdough starter beginner timing.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    expect(result.text).toContain(draftAnswer);
    expect(result.text).toContain('Reference: [Building a Starter](https://example.com/starter)');
    expect(result.text).not.toContain('could not produce a properly cited answer');
    expect(result.webSources).toEqual([
      expect.objectContaining({ title: 'Building a Starter', url: 'https://example.com/starter' }),
    ]);
  });

  test('collects cooking web source metadata from page reads', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'page-1',
                    type: 'function',
                    function: {
                      name: 'read_web_page',
                      arguments: JSON.stringify({
                        url: 'https://example.com/recipe',
                        sourceType: 'page',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/recipe',
              title: 'Example Recipe',
              raw_content: '# Example Recipe\n\nToast cumin.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'Based on [Example Recipe](https://example.com/recipe), I would toast the cumin first.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Please look up the recipe page I am sending through the tool.',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    expect(result.webSources).toEqual([
      expect.objectContaining({
        title: 'Example Recipe',
        url: 'https://example.com/recipe',
        sourceType: 'page',
      }),
    ]);
    expect(result.text).toContain('[Example Recipe](https://example.com/recipe)');
  });
});
