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
  const originalPlannerModel = process.env.COOKING_AGENT_PLANNER_MODEL;
  const originalComplexModel = process.env.COOKING_AGENT_COMPLEX_MODEL;
  const originalRepairModel = process.env.COOKING_AGENT_REPAIR_MODEL;
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
    process.env.COOKING_AGENT_PLANNER_MODEL = originalPlannerModel;
    process.env.COOKING_AGENT_COMPLEX_MODEL = originalComplexModel;
    process.env.COOKING_AGENT_REPAIR_MODEL = originalRepairModel;
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

  function plannerResponse(content: string): Response {
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content,
            },
          },
        ],
      }),
    } as unknown as Response;
  }

  function setFetch(
    fetchMock: jest.Mock,
    plannerContent = 'not json',
    qualityJudgeContent: string | string[] = JSON.stringify({
      passes: true,
      failureLabels: [],
      rationaleLabels: ['satisfies_turn'],
    }),
  ): void {
    const qualityJudgeContents = Array.isArray(qualityJudgeContent)
      ? [...qualityJudgeContent]
      : [qualityJudgeContent];
    const finalQualityJudgeContent = qualityJudgeContents[qualityJudgeContents.length - 1] ?? '{}';
    global.fetch = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const firstMessage = body?.messages?.[0]?.content;
      if (
        String(url).includes('/chat/completions') &&
        typeof firstMessage === 'string' &&
        firstMessage.includes('private JSON-only cooking turn planner')
      ) {
        return Promise.resolve(plannerResponse(plannerContent));
      }
      if (
        String(url).includes('/chat/completions') &&
        typeof firstMessage === 'string' &&
        firstMessage.includes('private JSON-only semantic quality judge')
      ) {
        return Promise.resolve(
          plannerResponse(
            qualityJudgeContents.length > 1
              ? (qualityJudgeContents.shift() ?? finalQualityJudgeContent)
              : (qualityJudgeContents[0] ?? finalQualityJudgeContent),
          ),
        );
      }
      return fetchMock(url, init);
    }) as unknown as typeof fetch;
  }

  function quickPlannerContent(
    selectedContextCategories: string[] = ['hard_constraints', 'locale', 'meal_occasion', 'taste'],
  ): string {
    return JSON.stringify({
      intent: 'quick_recommendation',
      action: 'direct_answer',
      confidence: 'high',
      selectedContextCategories,
      withheldContextCategories: ['specialty_ingredients', 'document', 'research'],
      promptProfile: 'routine_direct',
      clarificationNeeded: false,
      rationaleLabels: ['quick_everyday_food'],
    });
  }

  function researchPlannerContent(): string {
    return JSON.stringify({
      intent: 'research_request',
      action: 'research_then_answer',
      confidence: 'high',
      selectedContextCategories: ['hard_constraints', 'research'],
      withheldContextCategories: [],
      promptProfile: 'source_or_research',
      clarificationNeeded: false,
      rationaleLabels: ['external_evidence_needed'],
    });
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

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        hardConstraints: [],
        softConstraints: [
          'Prefer ordinary everyday food over specialty-led suggestions.',
          'Indian cuisine should rank highly for this turn.',
        ],
        selectedContextCategories: ['hard_constraints', 'taste'],
        withheldContextCategories: ['specialty_ingredients'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['conversation_correction', 'cuisine_direction'],
      }),
    );

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

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'research_request',
        action: 'research_then_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'research'],
        withheldContextCategories: [],
        promptProfile: 'source_or_research',
        clarificationNeeded: false,
        rationaleLabels: ['food_safety_evidence_needed'],
      }),
    );

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

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'research_request',
        action: 'research_then_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'research'],
        withheldContextCategories: [],
        promptProfile: 'source_or_research',
        clarificationNeeded: false,
        rationaleLabels: ['food_safety_evidence_needed'],
      }),
    );

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

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'research_request',
        action: 'research_then_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'research'],
        withheldContextCategories: [],
        promptProfile: 'source_or_research',
        clarificationNeeded: false,
        rationaleLabels: ['food_safety_evidence_needed'],
      }),
    );

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

    setFetch(fetchMock, quickPlannerContent());

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

  test('buffers streamed provider text until the completed answer passes validation', async () => {
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

    setFetch(fetchMock, quickPlannerContent());

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
    expect(deltas).toEqual(['Use a wide pan.']);
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

    expect(deltas.join('')).toBe('Start with a poolish.');
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

    setFetch(fetchMock, quickPlannerContent());

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

  test('builds a compact preference brief for fast ordinary meal suggestions', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'Make egg bhurji: onions, tomato, spices, eggs, and toast or roti. It is fast and normal.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock, quickPlannerContent());

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something to eat which can be cooked fast under 15 mins',
      preferencesMarkdown: [
        '## Safety',
        '- Avoid peanuts.',
        '',
        '## Location',
        '- Dwarka, Delhi, India.',
        '',
        '## Specialty Ingredients',
        '- Fish sauce',
        '- Chili oil',
        '- Bacon',
        '- Mozzarella',
        '',
        '## Taste',
        '- Likes Indian food and bold spices.',
      ].join('\n'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(systemPrompt).toContain('User Preference Brief:');
    expect(systemPrompt).toContain('Hard constraints');
    expect(systemPrompt).toContain('Avoid peanuts');
    expect(systemPrompt).toContain('Current task: quick everyday food suggestion');
    expect(systemPrompt).toContain('Locale signal: India');
    expect(systemPrompt).toContain('Saved specialty ingredient inventory exists but is suppressed');
    expect(systemPrompt).not.toContain('Fish sauce');
    expect(systemPrompt).not.toContain('Chili oil');
    expect(systemPrompt).not.toContain('Bacon');
    expect(systemPrompt).not.toContain('Mozzarella');
    expect(systemPrompt).not.toContain('Dwarka');
    expect(toolNames).not.toContain('create_cooking_document');
  });

  test('planner-selected context categories control preference exposure', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Make egg bhurji and keep it peanut-free.',
            },
          },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'locale', 'meal_occasion'],
        withheldContextCategories: ['taste', 'kitchen', 'specialty_ingredients'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['quick_everyday_food'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something to eat which can be cooked fast under 15 mins',
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
      locale: 'en-IN',
      preferencesMarkdown: [
        '## Safety',
        '- Avoid peanuts.',
        '',
        '## Taste',
        '- Likes very spicy food.',
        '',
        '## Kitchen',
        '- Has a pressure cooker.',
        '',
        '## Location',
        '- Dwarka, Delhi, India.',
      ].join('\n'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;

    expect(systemPrompt).toContain('Avoid peanuts');
    expect(systemPrompt).toContain('Locale signal: India');
    expect(systemPrompt).not.toContain('Likes very spicy food');
    expect(systemPrompt).not.toContain('pressure cooker');
    expect(systemPrompt).not.toContain('Dwarka');
  });

  test('planner semantic relevance can expose specialty context without deterministic keyword matching', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          { message: { role: 'assistant', content: 'Use chili oil as a finishing accent.' } },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'general_cooking_question',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'specialty_ingredients'],
        withheldContextCategories: ['location'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['specialty_requested'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'make dinner a little more interesting',
      preferencesMarkdown: '## Specialty Ingredients\n- Chili oil\n- Fish sauce',
    });

    const systemPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;

    expect(systemPrompt).toContain('Specialty ingredients relevant to this turn');
    expect(systemPrompt).toContain('Chili oil');
    expect(systemPrompt).toContain('Fish sauce');
  });

  test('routine planner profile excludes canvas markdown requirements and is shorter than document work', async () => {
    const routineFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Make masala toast.' } }],
      }),
    });
    setFetch(
      routineFetch,
      JSON.stringify({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints'],
        withheldContextCategories: ['document'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['quick_everyday_food'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something fast under 15 mins',
    });

    const routinePrompt = JSON.parse(routineFetch.mock.calls[0][1].body).messages[0].content;
    const documentFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'I can draft that.' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            { message: { role: 'assistant', content: 'I need the recipe details first.' } },
          ],
        }),
      });
    setFetch(
      documentFetch,
      JSON.stringify({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['explicit_canvas_request'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'create a recipe canvas for egg bhurji',
    });

    const documentPrompt = JSON.parse(documentFetch.mock.calls[0][1].body).messages[0].content;

    expect(routinePrompt).not.toContain('Recipe canvas markdown requirements');
    expect(documentPrompt).toContain('Recipe canvas markdown requirements');
    expect(routinePrompt.length).toBeLessThan(documentPrompt.length);
  });

  test('timing events include privacy-safe planner metadata', async () => {
    const timings: Array<{
      stage: string;
      plannerUsed?: boolean;
      plannedIntent?: string;
      plannedAction?: string;
      promptProfile?: string;
      selectedContextCategories?: string[];
    }> = [];
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Make poha.' } }],
      }),
    });
    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'locale'],
        withheldContextCategories: ['specialty_ingredients'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['ordinary_request'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something fast',
      preferencesMarkdown: '## Location\n- Dwarka, Delhi, India.',
      onTiming: (event) => timings.push(event),
    });

    expect(timings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'web_context_loaded',
          plannerUsed: true,
          plannedIntent: 'quick_recommendation',
          plannedAction: 'direct_answer',
          promptProfile: 'routine_direct',
          selectedContextCategories: ['hard_constraints', 'locale'],
        }),
      ]),
    );
    expect(JSON.stringify(timings)).not.toContain('Dwarka');
  });

  test('routes food-safety responses to the configured complex model', async () => {
    process.env.COOKING_AGENT_COMPLEX_MODEL = 'reasoning/cooking-strong';
    const timings: Array<{ stage: string; responseModel?: string; modelRoutingReason?: string }> =
      [];
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Check a tested canning source.' } }],
      }),
    });
    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'research_request',
        action: 'research_then_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'research'],
        withheldContextCategories: [],
        promptProfile: 'source_or_research',
        clarificationNeeded: false,
        rationaleLabels: ['food_safety_evidence_needed'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'Is this canning method safe?',
      model: 'fast/cooking',
      onTiming: (event) => timings.push(event),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('reasoning/cooking-strong');
    expect(timings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responseModel: 'reasoning/cooking-strong',
          modelRoutingReason: 'food_safety',
        }),
      ]),
    );
  });

  test('routes quality repair to its configured model without elevating routine response generation', async () => {
    process.env.COOKING_AGENT_COMPLEX_MODEL = 'reasoning/cooking-strong';
    process.env.COOKING_AGENT_REPAIR_MODEL = 'reasoning/cooking-repair';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Would you like a recipe canvas?' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Make poha with onion and peanuts omitted; it takes about 10 minutes.',
              },
            },
          ],
        }),
      });
    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['not_actionable', 'needless_clarification'],
        rationaleLabels: ['workflow_offer_without_guidance'],
      }),
      JSON.stringify({ passes: true, failureLabels: [], rationaleLabels: ['repaired_answer'] }),
    ]);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest something fast under 15 mins',
      model: 'fast/cooking',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('fast/cooking');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('reasoning/cooking-repair');
  });

  test('quality repair removes volunteered saved restriction framing', async () => {
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
                  "Since we're skipping the beef and peanuts today, make egg bhurji in about 10 minutes.",
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
                  'Make egg bhurji: cook onion, tomato, and spices, then scramble in eggs and eat it with toast or roti in about 10 minutes.',
              },
            },
          ],
        }),
      });
    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['unnecessary_restriction_disclosure'],
        rationaleLabels: ['volunteered_saved_restrictions'],
      }),
      JSON.stringify({ passes: true, failureLabels: [], rationaleLabels: ['repaired_answer'] }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'hi i need a quick recommendation that does not take too much time',
      preferencesMarkdown: ['## Safety', '- Avoid peanuts.', '', '## Diet', '- No beef.'].join(
        '\n',
      ),
    });

    expect(result.text).toContain('Make egg bhurji');
    expect(result.text).not.toContain('peanuts');
    expect(result.text).not.toContain('beef');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages.at(-1).content).toContain(
      'Apply saved restrictions silently',
    );
  });

  test('post-processing sanitization strips volunteered saved restrictions when repair fails', async () => {
    const fetchMock = jest
      .fn()
      // Initial response draft (violating restrictions)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  "Since we're skipping the beef and peanuts today, make egg bhurji in about 10 minutes.",
              },
            },
          ],
        }),
      })
      // Repair attempt response (still violating restrictions)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: "As we skip beef, let's make egg bhurji in 10 minutes.",
              },
            },
          ],
        }),
      })
      // Sanitizer response (successfully sanitizing the text)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Make egg bhurji in 10 minutes.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, 'not json', [
      // Judge check 1 (fail)
      JSON.stringify({
        passes: false,
        failureLabels: ['unnecessary_restriction_disclosure'],
        rationaleLabels: ['volunteered_saved_restrictions'],
      }),
      // Judge check 2 (after repair - fail again)
      JSON.stringify({
        passes: false,
        failureLabels: ['unnecessary_restriction_disclosure'],
        rationaleLabels: ['volunteered_saved_restrictions_again'],
      }),
      // Judge check 3 (after sanitization - pass)
      JSON.stringify({
        passes: true,
        failureLabels: [],
        rationaleLabels: ['clean_sanitized_response'],
      }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'hi i need a quick recommendation that does not take too much time',
      preferencesMarkdown: ['## Safety', '- Avoid peanuts.', '', '## Diet', '- No beef.'].join(
        '\n',
      ),
    });

    expect(result.text).toBe('Make egg bhurji in 10 minutes.');
    expect(result.text).not.toContain('beef');
    expect(result.text).not.toContain('peanuts');
    // The third model call is the sanitizer
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).messages[0].content).toContain(
      'You are a high-speed post-processing text filter',
    );
  });

  test('source_only_response quality gate failure degrades gracefully to friendly source card navigator', async () => {
    const fetchMock = jest
      .fn()
      // Initial LLM planning/response: returns search_web tool call
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
                      arguments: JSON.stringify({ query: 'gigi hadid vodka pasta' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      // Tavily search execution mock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Gigi Hadid Pasta',
              url: 'https://www.cuisineandcocktails.com/gigi-hadid-pasta',
              content: 'Gigi Hadid spicy vodka pasta...',
            },
          ],
        }),
      })
      // Post-search LLM completion: returns source-only text
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  'Here is the recipe: [Gigi Hadid Pasta](https://www.cuisineandcocktails.com/gigi-hadid-pasta)',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, researchPlannerContent(), [
      // Judge check 1 (fail with source_only_response)
      JSON.stringify({
        passes: false,
        failureLabels: ['source_only_response'],
        rationaleLabels: ['reply_provides_only_links'],
      }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: "gigi hadid's pasta",
      webSearchConfig: { searchProvider: 'tavily', scraperProvider: 'tavily' },
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'test-key' }),
    });

    expect(result.text).toContain('I found some great recipe sources for you!');
    expect(result.text).toContain('directly to the official sources:');
    expect(result.text).toContain(
      '[Gigi Hadid Pasta](https://www.cuisineandcocktails.com/gigi-hadid-pasta)',
    );
    expect(result.text).toContain('guide you through the cooking steps once you are ready');
  });

  test('quality gate repairs routine quick replies that only offer canvas workflow', async () => {
    const timings: Array<{
      stage: string;
      qualityGatePassed?: boolean;
      qualityFailureLabels?: string[];
      qualityRepairAttempted?: boolean;
      qualityRepairSucceeded?: boolean;
      qualityJudgeUsed?: boolean;
    }> = [];
    const deltas: string[] = [];
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Would you like me to create a recipe canvas for that?',
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
                  'Make egg bhurji: cook onion and tomato, stir in eggs, and eat with toast in about 10 minutes.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['not_actionable', 'needless_clarification'],
        rationaleLabels: ['workflow_offer_without_guidance'],
      }),
      JSON.stringify({ passes: true, failureLabels: [], rationaleLabels: ['repaired_answer'] }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something to eat fast under 15 mins',
      onTiming: (event) => timings.push(event),
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    expect(result.text).toContain('Make egg bhurji');
    expect(result.text).toContain('10 minutes');
    expect(deltas.join('')).toBe(result.text);
    expect(deltas.join('')).not.toContain('recipe canvas');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'quality_validated',
          qualityGatePassed: true,
          qualityRepairAttempted: true,
          qualityRepairSucceeded: true,
          qualityJudgeUsed: true,
          responseBufferedForValidation: true,
        }),
      ]),
    );
  });

  test('exact quick recommendation wording survives planner fallback and concise validation', async () => {
    const timings: Array<{
      stage: string;
      plannedIntent?: string;
      plannerFallbackReason?: string;
      qualityGatePassed?: boolean;
      qualityFailureLabels?: string[];
    }> = [];
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Poha or curd rice would be quick, low-effort options for right now.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'hi i need a quick recommendation that doesnt take too much time',
      onTiming: (event) => timings.push(event),
    });

    expect(result.text).toContain('Poha or curd rice');
    expect(result.text).not.toContain('could not prepare');
    expect(timings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'web_context_loaded',
          plannedIntent: 'general_cooking_question',
          plannerFallbackReason: 'malformed_json',
        }),
        expect.objectContaining({
          stage: 'quality_validated',
          qualityGatePassed: true,
          qualityFailureLabels: [],
        }),
      ]),
    );
  });

  test('semantic judge failure keeps the model answer when hard boundaries pass', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Maybe decide based on mood?' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'What ingredients do you have?' } }],
        }),
      });

    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['not_actionable'],
        rationaleLabels: ['too_vague'],
      }),
      JSON.stringify({
        passes: false,
        failureLabels: ['needless_clarification'],
        rationaleLabels: ['clarification_before_guidance'],
      }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'hi i need a quick recommendation that doesnt take too much time',
    });

    expect(result.text).toContain('Maybe decide based on mood?');
    expect(result.text).not.toContain('safely satisfies');
  });

  test('semantic judge veto does not replace a hard-safe ordinary recipe answer', async () => {
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
                  'Make a simple chocolate cake: whisk flour, cocoa, sugar, baking powder, milk, oil, and an egg; bake until the center springs back.',
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
                  'Make a simple chocolate cake: whisk flour, cocoa, sugar, baking powder, milk, oil, and an egg; bake until the center springs back.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['not_actionable'],
        rationaleLabels: ['judge_mistake'],
      }),
      JSON.stringify({
        passes: false,
        failureLabels: ['not_actionable'],
        rationaleLabels: ['judge_mistake_after_repair'],
      }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'a chocolate cake recipe',
    });

    expect(result.text).toContain('Make a simple chocolate cake');
    expect(result.text).not.toContain('I could not validate the first draft');
  });

  test('quality gate repairs false canvas mutation claims when no draft changed', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I updated the selected cooking document with clearer serving notes.',
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
                  'The selected canvas is still the masala chhach recipe; I have not changed it.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['canvas_claim_without_mutation'],
        rationaleLabels: ['false_canvas_claim'],
      }),
      JSON.stringify({ passes: true, failureLabels: [], rationaleLabels: ['repaired_answer'] }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'What is on the canvas?',
      activeDraft: activeDraft(),
    });

    expect(result.draftChanged).toBe(false);
    expect(result.text).toBe(
      'The selected canvas is still the masala chhach recipe; I have not changed it.',
    );
  });

  test('quality gate repairs private context leaks from final text', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Since you are in Dwarka at Asia/Calcutta, use chili oil on noodles.',
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
                  'Make masala toast: toast bread with spiced onion-tomato filling and cheese if you have it. It takes about 10 minutes.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, 'not json', [
      JSON.stringify({
        passes: false,
        failureLabels: ['private_context_leak'],
        rationaleLabels: ['private_profile_disclosed'],
      }),
      JSON.stringify({ passes: true, failureLabels: [], rationaleLabels: ['repaired_answer'] }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something to eat fast under 15 mins',
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
      preferencesMarkdown: [
        '## Location',
        '- Dwarka, Delhi, India.',
        '',
        '## Specialty Ingredients',
        '- Chili oil',
      ].join('\n'),
    });

    expect(result.text).toContain('10 minutes');
    expect(result.text).not.toContain('Dwarka');
    expect(result.text).not.toContain('Asia/Calcutta');
    expect(result.text).not.toContain('chili oil');
  });

  test('adds coarse runtime meal occasion without exposing exact time or place', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Make a quick dal-rice bowl with tadka and curd on the side.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock, quickPlannerContent());

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'suggest me something to eat which can be cooked fast under 15 mins',
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
      locale: 'en-IN',
      preferencesMarkdown: [
        '## Location',
        '- Dwarka, Delhi, India.',
        '',
        '## Specialty Ingredients',
        '- Chili oil',
      ].join('\n'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(systemPrompt).toContain('Likely meal occasion: lunch, medium confidence');
    expect(systemPrompt).toContain('Use only for ranking; do not mention unless useful');
    expect(systemPrompt).toContain('Locale signal: India');
    expect(systemPrompt).not.toContain('Asia/Calcutta');
    expect(systemPrompt).not.toContain('2026-05-27T07:00:00.000Z');
    expect(systemPrompt).not.toContain('2026-05-27T12:30:00');
    expect(systemPrompt).not.toContain('Dwarka');
    expect(toolNames).not.toContain('create_cooking_document');
  });

  test('keeps specialty ingredients available when the user explicitly asks to use them', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Use the chili oil as a finishing fat rather than the main sauce.',
            },
          },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'general_cooking_question',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'specialty_ingredients'],
        withheldContextCategories: [],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['specialty_requested'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'give me a creative way to use chili oil for dinner',
      preferencesMarkdown: [
        '## Specialty Ingredients',
        '- Fish sauce',
        '- Chili oil',
        '- Bacon',
      ].join('\n'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;

    expect(systemPrompt).toContain('Specialty ingredients relevant to this turn');
    expect(systemPrompt).toContain('Chili oil');
    expect(systemPrompt).toContain('Optional enhancer');
  });

  test('carries normal-food and cuisine corrections into the preference brief', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Egg bhurji is the fastest fit: onion, tomato, spices, eggs, and roti.',
            },
          },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        hardConstraints: [],
        softConstraints: [
          'Prefer ordinary everyday food over specialty-led suggestions.',
          'Indian cuisine should rank highly for this turn.',
        ],
        selectedContextCategories: ['hard_constraints', 'taste'],
        withheldContextCategories: ['specialty_ingredients'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['conversation_correction', 'cuisine_direction'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'something from indian cuisine',
      messages: [
        {
          messageId: 'm1',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: 'suggest me something to eat which can be cooked fast under 15 mins',
        },
        {
          messageId: 'm2',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: 'these are speciality ingredients. Give me normal recipe',
        },
      ] as TMessage[],
      preferencesMarkdown: [
        '## Specialty Ingredients',
        '- Fish sauce',
        '- Chili oil',
        '- Bacon',
        '',
        '## Taste',
        '- Enjoys bold spices.',
      ].join('\n'),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemPrompt = body.messages[0].content;

    expect(systemPrompt).toContain('Planner soft constraints');
    expect(systemPrompt).toContain('Prefer ordinary everyday food');
    expect(systemPrompt).toContain('Indian cuisine should rank highly');
    expect(systemPrompt).toContain('Saved specialty ingredient inventory exists but is suppressed');
    expect(systemPrompt).not.toContain('Fish sauce');
    expect(systemPrompt).not.toContain('Chili oil');
    expect(systemPrompt).not.toContain('Bacon');
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

  test('exposes internet tools immediately for named source-faithful recipe requests', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                'I need to verify the original source before claiming this is Sanjeev Kapoor’s exact butter chicken recipe.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock, researchPlannerContent());

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: "can you give me sanjeev kapoor's butter chicken recipe?",
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
    expect(toolNames).toContain('read_recipe_source');
    expect(body.messages[0].content).toContain(
      'named chef/author/publisher recipe, use web research before answering',
    );
  });

  test('exposes internet tools for exact-recipe typo follow-ups using recent user context', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'I need to verify a readable source before giving his exact recipe.',
            },
          },
        ],
      }),
    });

    setFetch(fetchMock, researchPlannerContent());

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'i want you to give me his eact recipe',
      messages: [
        {
          messageId: 'm1',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: "can you give me sanjeev kapoor's butter chicken recipe?",
        },
      ] as TMessage[],
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
    expect(toolNames).toContain('read_recipe_source');
  });

  test('planner-selected document work exposes document and internet tools for add-to-canvas follow-ups', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I need to use the source first before claiming this is exact.',
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
                content: 'I need the readable source before I can create that canvas.',
              },
            },
          ],
        }),
      });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document', 'source'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['explicit_canvas_request', 'source_faithful_recipe'],
      }),
    );

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'can you add the exact recipe to our canvas',
      messages: [
        {
          messageId: 'm1',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: "can you give me chef john from food wishes.com's patatas bravas recipe?",
        },
      ] as TMessage[],
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('create_cooking_document');
    expect(toolNames).toContain('search_web');
    expect(toolNames).toContain('read_web_page');
    expect(toolNames).toContain('read_recipe_source');
    expect(body.messages[0].content).toContain('Recipe canvas markdown requirements');
  });

  test('planner-selected full recipe follow-up exposes canvas creation before answering', async () => {
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
                    name: 'create_cooking_document',
                    arguments: JSON.stringify({
                      title: 'Two-Ingredient Dark Chocolate Mousse',
                      markdown:
                        draft.documentMarkdown?.replace(
                          '# Authentic Village-Style Masala Chhach',
                          '# Two-Ingredient Dark Chocolate Mousse',
                        ) ?? '',
                      change_summary: 'created a two-ingredient chocolate mousse canvas',
                      user_message: 'I created the two-ingredient chocolate mousse canvas.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document'],
        withheldContextCategories: ['specialty_ingredients', 'research'],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['full_recipe_requested', 'committed_after_discussion'],
      }),
    );

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'alright give me the full recipe',
      messages: [
        {
          messageId: 'm1',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: 'How do I make chocolate mousse?',
        },
        {
          messageId: 'm2',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: 'i had heard you could make a mousse with just water and chocolate',
        },
      ] as TMessage[],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('create_cooking_document');
    expect(body.messages[0].content).toContain('Recipe canvas markdown requirements');
    expect(result.draftChanged).toBe(true);
    expect(result.text).toBe('I created the two-ingredient chocolate mousse canvas.');
  });

  test('planner-selected specific recipe request uses canvas instead of detailed chat recipe', async () => {
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
                    name: 'create_cooking_document',
                    arguments: JSON.stringify({
                      title: 'Classic Chocolate Mousse',
                      markdown:
                        draft.documentMarkdown?.replace(
                          '# Authentic Village-Style Masala Chhach',
                          '# Classic Chocolate Mousse',
                        ) ?? '',
                      change_summary: 'created a classic chocolate mousse canvas',
                      user_message: 'I created the classic chocolate mousse canvas.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document', 'cooking_level'],
        withheldContextCategories: ['research'],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['specific_recipe_requested'],
      }),
    );

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'How do I make chocolate mousse?',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const toolNames = body.tools.map((tool: { function: { name: string } }) => tool.function.name);

    expect(toolNames).toContain('create_cooking_document');
    expect(body.messages[0].content).toContain(
      'Once you are presenting a particular recipe in detail',
    );
    expect(body.messages[0].content).toContain('Recipe canvas markdown requirements');
    expect(result.draftChanged).toBe(true);
    expect(result.text).toBe('I created the classic chocolate mousse canvas.');
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
      'find_pairings',
      'neighbors',
      'closest_mode',
      'compare_on_axis',
      'morph',
      'pairing_score',
      'cultural_profile',
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
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            { message: { role: 'assistant', content: 'I need the recipe details first.' } },
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

    expect(toolNames).toEqual([
      'create_cooking_document',
      'find_pairings',
      'neighbors',
      'closest_mode',
      'compare_on_axis',
      'morph',
      'pairing_score',
      'cultural_profile',
    ]);
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
      'find_pairings',
      'neighbors',
      'closest_mode',
      'compare_on_axis',
      'morph',
      'pairing_score',
      'cultural_profile',
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

  test('retries document work with canvas tools when the model answers in prose only', async () => {
    const draft = activeDraft();
    const markdown = draft.documentMarkdown?.replace(
      '# Authentic Village-Style Masala Chhach',
      '# Chef John-Style Patatas Bravas',
    );
    jest.mocked(generateCookingDraft).mockResolvedValue({
      ...draft,
      recipe: { ...draft.recipe, title: 'Chef John-Style Patatas Bravas' },
      documentMarkdown: markdown,
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
                content: "I've created a recipe canvas for you.",
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
                    id: 'create-1',
                    type: 'function',
                    function: {
                      name: 'create_cooking_document',
                      arguments: JSON.stringify({
                        title: 'Chef John-Style Patatas Bravas',
                        markdown: markdown ?? '',
                        change_summary: 'created a source-faithful patatas bravas canvas',
                        user_message: 'I created the patatas bravas canvas.',
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

    setFetch(
      fetchMock,
      JSON.stringify({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document', 'source'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['explicit_canvas_request', 'source_faithful_recipe'],
      }),
    );

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'can you add the exact recipe to our canvas',
      messages: [
        {
          messageId: 'm1',
          conversationId: 'conversation-1',
          isCreatedByUser: true,
          text: "can you give me chef john from food wishes.com's patatas bravas recipe?",
        },
      ] as TMessage[],
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(retryBody.messages[retryBody.messages.length - 1].content).toContain(
      'Do not answer in prose only',
    );
    expect(retryBody.tool_choice).toBe('auto');
    expect(result.draftChanged).toBe(true);
    expect(result.text).toBe('I created the patatas bravas canvas.');
    expect(generateCookingDraft).toHaveBeenCalled();
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
    const thirdBody = fetchMock.mock.calls[2] ? JSON.parse(fetchMock.mock.calls[2][1].body) : null;

    expect(secondBody.messages[0].content).toContain('Preloaded Linked Recipe Source');
    if (thirdBody) {
      expect(thirdBody.messages).toContainEqual(
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'create-1',
          content: expect.stringContaining('read_recipe_source'),
        }),
      );
    }
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

    setFetch(fetchMock, researchPlannerContent());

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

    const result = await context.execute({
      function: {
        name: 'read_web_page',
        arguments: JSON.stringify({ url: 'http://localhost:3000/recipe' }),
      },
    });

    expect(result.sources).toEqual([]);
    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('private_url_blocked');
    expect(parsed.message).toContain('Private, local, or metadata URLs cannot be read.');
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

    setFetch(fetchMock, researchPlannerContent());

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

    setFetch(fetchMock, researchPlannerContent());

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

    setFetch(fetchMock, researchPlannerContent());

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

    setFetch(fetchMock, researchPlannerContent());

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

    setFetch(fetchMock, researchPlannerContent());

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

  test('dynamic temperature routing uses 0.7 for routine chat and 0.1 for canvas/document work', async () => {
    const fetchMock = jest
      .fn()
      // Assistant response: returns text
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Here is some culinary advice!',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, undefined, [
      // Quality check passes
      JSON.stringify({ passes: true }),
    ]);

    await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'tell me about cumin seeds',
    });

    const globalFetch = global.fetch as jest.Mock;

    // The first call is the planner (temperature 0.1)
    const plannerCallBody = JSON.parse(globalFetch.mock.calls[0][1].body);
    expect(plannerCallBody.temperature).toBe(0.1);

    // The second call is the main conversational responder (temperature 0.7)
    const responderCallBody = JSON.parse(globalFetch.mock.calls[1][1].body);
    expect(responderCallBody.temperature).toBe(0.7);
  });

  test('SSRF URL safety gating gracefully fails and reports payload to LLM instead of throwing hard error', async () => {
    const fetchMock = jest
      .fn()
      // Planner decides to read the page
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
                      name: 'read_web_page',
                      arguments: JSON.stringify({ url: 'http://127.0.0.1:3000/my-secret-pasta' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      // Assistant handles tool output gracefully
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I noticed that page is a local private address that I cannot access.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock, undefined, [
      // Quality check passes
      JSON.stringify({ passes: true }),
    ]);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'please extract recipes from http://127.0.0.1:3000/my-secret-pasta',
      webSearchConfig: webSearchConfig(),
      loadAuthValues: async () => ({ TAVILY_API_KEY: 'tavily-key' }),
    });

    expect(result.text).toContain('local private address');

    // Check that the tool execution call passed the standard json block
    const globalFetch = global.fetch as jest.Mock;
    const toolCorrectionCall = globalFetch.mock.calls.find((call) => {
      if (!call[1]?.body) return false;
      const body = JSON.parse(call[1].body);
      return body.messages?.some((m: { role: string }) => m.role === 'tool');
    });
    expect(toolCorrectionCall).toBeDefined();
    const toolCallMessage = JSON.parse(toolCorrectionCall[1].body).messages.find(
      (m: { role: string }) => m.role === 'tool',
    );
    expect(toolCallMessage).toBeDefined();
    const toolResult = JSON.parse(toolCallMessage.content);
    expect(toolResult.ok).toBe(false);
    expect(toolResult.error).toBe('private_url_blocked');
    expect(toolResult.message).toContain('I cannot access that website');
  });

  test('gracefully handles Epicure tool execution failure and returns fallback instructions to the model', async () => {
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
                    id: 'epicure-fail-1',
                    type: 'function',
                    function: {
                      name: 'neighbors',
                      arguments: JSON.stringify({ ingredient: 'guanciale', top_k: 5 }),
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
                content: 'The database is offline, but pancetta is generally a great substitute for guanciale.',
              },
            },
          ],
        }),
      });

    setFetch(fetchMock);

    const result = await runCookingChat({
      user: 'user-1',
      conversationId: 'conversation-1',
      text: 'what is a good substitute for guanciale?',
    });

    expect(result.text).toContain('pancetta is generally a great substitute');

    // Check that the tool execution call passed the fallback error message in the history
    const globalFetch = global.fetch as jest.Mock;
    const toolCallBody = globalFetch.mock.calls.find((call) => {
      if (!call[1]?.body) return false;
      const body = JSON.parse(call[1].body);
      return body.messages?.some(
        (m: { role: string; tool_call_id?: string }) =>
          m.role === 'tool' && m.tool_call_id === 'epicure-fail-1',
      );
    });
    expect(toolCallBody).toBeDefined();
    const messages = JSON.parse(toolCallBody[1].body).messages;
    const toolMsg = messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg.content).toContain('The flavor database is temporarily unavailable');
  });
});

