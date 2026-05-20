import { runCookingChat, sanitizePromptSuggestions } from './agent';
import { createCookingWebContext } from './web';
import type { TMessage } from 'librechat-data-provider';

describe('cooking agent prompt suggestions', () => {
  const originalKey = process.env.COOKING_AGENT_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.COOKING_AGENT_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.COOKING_AGENT_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

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

  test('collects valid set_prompt_suggestions tool calls into the chat result', async () => {
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
                        suggestions: [
                          'How do I prep this so dinner is faster tomorrow?',
                          'What signs show the onions are browned enough?',
                          'How would you adapt this for my smaller pan?',
                        ],
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
                content: 'Use a wide pan and listen for a steady sizzle.',
              },
            },
          ],
        }),
      });

    global.fetch = fetchMock as typeof fetch;

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'How do I brown onions?',
    });

    expect(result).toMatchObject({
      text: 'Use a wide pan and listen for a steady sizzle.',
      draftChanged: false,
      promptSuggestions: [
        'How do I prep this so dinner is faster tomorrow?',
        'What signs show the onions are browned enough?',
        'How would you adapt this for my smaller pan?',
      ],
    });
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

    global.fetch = fetchMock as typeof fetch;

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'I have spinach and paneer in my fridge. Suggest me some recipes.',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.messages[0].content).toContain('Ideation mode');
    expect(body.messages[0].content).toContain('do not jump to a single recipe or canvas');
    expect(body.messages[0].content).toContain('Do not imitate or quote any real chef');
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

    global.fetch = fetchMock as typeof fetch;

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

  test('tells the model to preserve an active canvas for additive accompaniment requests', async () => {
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
                    id: 'replace-1',
                    type: 'function',
                    function: {
                      name: 'create_recipe_canvas',
                      arguments: JSON.stringify({
                        title: 'Simple Garlic Aioli',
                        markdown: [
                          '# Simple Garlic Aioli',
                          '',
                          'A quick sauce.',
                          '',
                          '## Ingredients',
                          '',
                          '| Ingredient | Metric | Imperial | State/Form | Notes |',
                          '| --- | --- | --- | --- | --- |',
                          '| Mayonnaise | 120 ml | 1/2 cup | Full-fat | Base |',
                          '',
                          '## Instructions',
                          '',
                          '1. Mix the sauce until smooth.',
                          '2. Serve chilled.',
                        ].join('\n'),
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
                content: 'I should add the aioli to the existing Patatas Bravas canvas instead.',
              },
            },
          ],
        }),
      });

    global.fetch = fetchMock as typeof fetch;

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'How do I make a quick garlic aioli to go with these?',
      activeDraft: {
        _id: 'draft-1',
        user: 'user-1',
        conversationId: 'conversation-1',
        prompt: 'Patatas bravas',
        status: 'active',
        recipe: {
          title: 'Chef John Patatas Bravas',
          description: '',
          servings: 4,
          timing: { prepMinutes: 10, cookMinutes: 30, totalMinutes: 40 },
          ingredients: [{ id: 'ingredient-1', item: 'potatoes', quantityType: 'estimated' }],
          steps: [
            {
              id: 'step-1',
              order: 1,
              text: 'Fry the potatoes.',
              ingredientIds: ['ingredient-1'],
              timers: [],
              warnings: [],
              tips: [],
            },
          ],
          notes: [],
          tags: [],
        },
        expiresAt: '2026-05-19T00:00:00.000Z',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
      },
    });

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(firstBody.messages[0].content).toContain('Chef John Patatas Bravas');
    expect(secondBody.messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'replace-1',
        content: expect.stringContaining('this request looks additive'),
      }),
    );
    expect(result.draftChanged).toBe(false);
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

    global.fetch = fetchMock as typeof fetch;

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Is this canning method safe?',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).not.toContain('search_web');
    expect(toolNames).not.toContain('read_web_page');
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

    global.fetch = fetchMock as typeof fetch;

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Is this canning method safe?',
      webSearchConfig: {
        searchProvider: 'serper',
        scraperProvider: 'serper',
        rerankerType: 'none',
        serperApiKey: '${SERPER_API_KEY}',
      },
      loadAuthValues: async () => ({ SERPER_API_KEY: 'serper-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
  });

  test('read_web_page rejects local and private URLs before fetching', async () => {
    const context = await createCookingWebContext({
      user: 'user-1',
      webSearchConfig: {
        searchProvider: 'serper',
        scraperProvider: 'serper',
        rerankerType: 'none',
        serperApiKey: '${SERPER_API_KEY}',
      },
      loadAuthValues: async () => ({ SERPER_API_KEY: 'serper-key' }),
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
        status: 200,
        headers: new Headers(),
        text: async () => '<html><title>Example Recipe</title><main>Toast cumin.</main></html>',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I read the recipe source and would toast the cumin first.',
              },
            },
          ],
        }),
      });

    global.fetch = fetchMock as typeof fetch;

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Use https://example.com/recipe',
      webSearchConfig: {
        searchProvider: 'serper',
        scraperProvider: 'serper',
        rerankerType: 'none',
        serperApiKey: '${SERPER_API_KEY}',
      },
      loadAuthValues: async () => ({ SERPER_API_KEY: 'serper-key' }),
    });

    expect(result.webSources).toEqual([
      expect.objectContaining({
        title: 'Example Recipe',
        url: 'https://example.com/recipe',
        sourceType: 'page',
      }),
    ]);
  });
});
