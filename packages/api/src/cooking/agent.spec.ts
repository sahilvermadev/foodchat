import { RerankerTypes, ScraperProviders, SearchProviders } from 'librechat-data-provider';

import type { CookingDraft, TCustomConfig, TMessage } from 'librechat-data-provider';

import { runCookingChat, sanitizePromptSuggestions } from './agent';
import { createCookingWebContext } from './web';
import { generateCookingDraft, getCookingDraftByConversation, updateCookingDraft } from './service';

jest.mock('./service', () => ({
  generateCookingDraft: jest.fn(),
  getCookingDraftByConversation: jest.fn(),
  updateCookingDraft: jest.fn(),
}));

describe('cooking agent prompt suggestions', () => {
  const originalKey = process.env.COOKING_AGENT_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.COOKING_AGENT_API_KEY = 'test-key';
    jest.mocked(generateCookingDraft).mockResolvedValue(activeDraft());
    jest.mocked(getCookingDraftByConversation).mockResolvedValue(activeDraft());
    jest.mocked(updateCookingDraft).mockResolvedValue(activeDraft());
  });

  afterEach(() => {
    process.env.COOKING_AGENT_API_KEY = originalKey;
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

    setFetch(fetchMock);

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
    expect(deltas).toEqual(['Use a wide ', 'pan.']);
    expect(result.text).toBe('Use a wide pan.');
  });

  test('accumulates streamed tool call argument deltas before executing tools', async () => {
    const encoder = new TextEncoder();
    const toolStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"suggestions-1","type":"function","function":{"name":"set_prompt_suggestions","arguments":"{\\"suggestions\\":["}}]}}]}',
              '',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"What texture cues should I watch for?\\""}}]}}]}',
              '',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"]}"}}]}}]}',
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
      text: 'How do I brown onions?',
    });

    expect(result.promptSuggestions).toEqual(['What texture cues should I watch for?']);
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
      'read_recipe_canvas',
      'revise_recipe_canvas',
      'set_prompt_suggestions',
    ]);
    expect(body.messages[0].content).toContain('Active recipe canvas: yes');
    expect(body.messages[0].content).toContain('Current canvas markdown:');
    expect(body.messages[0].content).toContain('| Dahi | 480 ml | 2 cups | chilled |');
    expect(body.messages[0].content).toContain('Chat is the right response for questions');
    expect(body.messages[0].content).toContain('Prior discussion is not consent to edit the canvas');
    const reviseTool = body.tools.find(
      (tool: { function: { name: string } }) => tool.function.name === 'revise_recipe_canvas',
    );
    expect(reviseTool.function.description).toContain(
      'when the recipe itself should become different for future cooking',
    );
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

    expect(toolNames).toEqual(['create_recipe_canvas', 'set_prompt_suggestions']);
    expect(toolNames).not.toContain('revise_recipe_canvas');
  });

  test('arrange the recipe better updates via revise_recipe_canvas', async () => {
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
                    name: 'revise_recipe_canvas',
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
      'read_recipe_canvas',
      'revise_recipe_canvas',
      'set_prompt_suggestions',
    ]);
    expect(result).toMatchObject({
      draftChanged: true,
      text: 'I reorganized the canvas so the recipe is easier to follow.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("I don't have an immersion blender updates via revise_recipe_canvas", async () => {
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
                    name: 'revise_recipe_canvas',
                    arguments: JSON.stringify({
                      revision_type: 'equipment_alternative',
                      markdown: revisedMarkdown,
                      change_summary: 'added non-blender alternatives',
                      user_message: 'I added whisk, mathani, and jar-shake alternatives to the canvas.',
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

    expect(toolNames).not.toContain('create_recipe_canvas');
    expect(toolNames).toContain('revise_recipe_canvas');
    expect(body.messages[0].content).toContain('Chat is the right response for questions');
  });

  test('what is on the canvas uses read_recipe_canvas', async () => {
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
                      name: 'read_recipe_canvas',
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
                    id: 'create-1',
                    type: 'function',
                    function: {
                      name: 'create_recipe_canvas',
                      arguments: JSON.stringify({
                        title: 'Authentic Village-Style Masala Chhach',
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('overlong canvas user_message does not block creating the recipe canvas', async () => {
    const draft = activeDraft();
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
                    name: 'create_recipe_canvas',
                    arguments: JSON.stringify({
                      title: 'Cheese Souffle',
                      markdown: draft.documentMarkdown ?? '',
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
      text: 'I created the Cheese Souffle recipe canvas.',
    });
    expect(generateCookingDraft).toHaveBeenCalled();
  });

  test('malformed markdown rejects and does not mark draftChanged', async () => {
    const draft = activeDraft();
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
                    name: 'revise_recipe_canvas',
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
                    name: 'revise_recipe_canvas',
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

  test('prompt suggestions from a canvas mutation persist in the result', async () => {
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
                  id: 'suggestions-1',
                  type: 'function',
                  function: {
                    name: 'set_prompt_suggestions',
                    arguments: JSON.stringify({
                      suggestions: ['Can you add a spicy variation?'],
                    }),
                  },
                },
                {
                  id: 'revise-1',
                  type: 'function',
                  function: {
                    name: 'revise_recipe_canvas',
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

    expect(result.promptSuggestions).toEqual(['Can you add a spicy variation?']);
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
                      name: 'create_recipe_canvas',
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
    const sourceMarkdown = `${draft.documentMarkdown}\n\n## Source Notes\n\n- Source proportions verified from Serious Eats.`;
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
                      name: 'create_recipe_canvas',
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
                content: 'I read the recipe source and would toast the cumin first.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Please read the recipe page I am sending through the tool.',
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
  });
});
