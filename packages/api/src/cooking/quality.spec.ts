import type { CookingTurnPlan } from './planner';
import {
  validateCookingResponse,
  validateCookingResponseHardBoundaries,
  validateCookingResponseWithJudge,
} from './quality';

function plan(overrides: Partial<CookingTurnPlan> = {}): CookingTurnPlan {
  return {
    category: 'ideas',
    intent: 'quick_recommendation',
    action: 'direct_answer',
    confidence: 'high',
    constraints: {
      hard: ['time limit: 15 minutes'],
      soft: [],
    },
    selectedContextCategories: ['hard_constraints', 'locale'],
    withheldContextCategories: ['specialty_ingredients'],
    promptProfile: 'routine_direct',
    deliveryMode: 'glance',
    clarification: {
      needed: false,
    },
    privacySafeRationaleLabels: ['quick_everyday_food'],
    toolPolicy: {
      allowDocumentTools: false,
      allowResearchRequestTool: false,
    },
    plannerUsed: true,
    ...overrides,
  };
}

describe('cooking response quality gate', () => {
  test('passes an actionable quick answer that honors the time limit', () => {
    const result = validateCookingResponse({
      text: 'Make egg bhurji: cook onion and tomato, stir in eggs, and eat with toast in about 10 minutes.',
      turnPlan: plan(),
      draftChanged: false,
      webSources: [],
    });

    expect(result).toMatchObject({
      ok: true,
      failureLabels: [],
      repairInstruction: undefined,
    });
  });

  test('passes concise quick recommendation lists without imperative cooking verbs', () => {
    const result = validateCookingResponse({
      text: 'Poha or curd rice would be quick, low-effort options for right now.',
      turnPlan: plan({ constraints: { hard: [], soft: ['quick, low-effort food'] } }),
      draftChanged: false,
      webSources: [],
    });

    expect(result).toMatchObject({
      ok: true,
      failureLabels: [],
      repairInstruction: undefined,
    });
  });

  test('treats delivery budget labels as advisory instead of blocking', async () => {
    const longReply = Array.from({ length: 140 }, (_, index) => `word${index}`).join(' ');
    const result = await validateCookingResponseWithJudge(
      {
        text: longReply,
        turnPlan: plan({ deliveryMode: 'glance' }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['overlong_for_delivery_mode'],
          rationaleLabels: ['too_verbose'],
        }),
    );

    expect(result.ok).toBe(true);
    expect(result.failureLabels).toContain('overlong_for_delivery_mode');
    expect(result.repairInstruction).toContain('glance is 40-90 words');
  });

  test('LLM quality judge can pass semantically useful phrasing that lexical fallback would reject', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'The fastest fit is a tomato rice bowl; keep it light and use leftover rice if you have it.',
        userText: 'I need a quick recommendation.',
        turnPlan: plan({ constraints: { hard: [], soft: ['quick food'] } }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: true,
          failureLabels: [],
          rationaleLabels: ['concrete_quick_option'],
        }),
    );

    expect(result).toEqual({
      ok: true,
      failureLabels: [],
      repairInstruction: undefined,
      qualityJudgeUsed: true,
      qualityJudgeFallbackReason: undefined,
      qualityJudgeRationaleLabels: ['concrete_quick_option'],
    });
  });

  test('LLM quality judge supplies semantic failure labels for repair', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'What ingredients do you have?',
        userText: 'I need a quick recommendation.',
        turnPlan: plan({ constraints: { hard: [], soft: ['quick food'] } }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['not_actionable', 'needless_clarification'],
          rationaleLabels: ['clarification_before_guidance'],
        }),
    );

    expect(result.failureLabels).toEqual(['not_actionable', 'needless_clarification']);
    expect(result.repairInstruction).toContain('immediately usable answer');
    expect(result.qualityJudgeUsed).toBe(true);
  });

  test('LLM quality judge can flag volunteered restriction framing', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: "Since we're skipping the beef and peanuts today, make egg bhurji.",
        userText: 'I need a quick recommendation.',
        turnPlan: plan({ constraints: { hard: [], soft: ['quick food'] } }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['unnecessary_restriction_disclosure'],
          rationaleLabels: ['volunteered_saved_restrictions'],
        }),
    );

    expect(result.failureLabels).toEqual(['unnecessary_restriction_disclosure']);
    expect(result.repairInstruction).toContain('Apply saved restrictions silently');
    expect(result.qualityJudgeUsed).toBe(true);
  });

  test('LLM quality judge reviews private context instead of deterministic term matching', async () => {
    const input = {
      text: 'Since you are in Dwarka, make noodles.',
      userText: 'I need a quick recommendation.',
      turnPlan: plan(),
      draftChanged: false,
      webSources: [],
      preferencesMarkdown: '## Location\n- Dwarka, Delhi, India.',
    };
    const hard = validateCookingResponseHardBoundaries(input);
    const judged = await validateCookingResponseWithJudge(input, async (messages) => {
      expect(messages[0].content).toContain('Use judgment, not keyword matching');
      expect(messages[1].content).toContain('privacyReviewContext');
      return JSON.stringify({
        passes: false,
        failureLabels: ['private_context_leak'],
        rationaleLabels: ['exact_location_disclosed'],
      });
    });

    expect(hard.failureLabels).not.toContain('private_context_leak');
    expect(judged.failureLabels).toEqual(['private_context_leak']);
    expect(judged.qualityJudgeUsed).toBe(true);
  });

  test('LLM quality judge flags quick answers that ignore the time limit', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'Make rajma from dry beans and simmer it until creamy.',
        turnPlan: plan(),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['missing_time_constraint'],
          rationaleLabels: ['time_limit_ignored'],
        }),
    );

    expect(result.failureLabels).toContain('missing_time_constraint');
    expect(result.repairInstruction).toContain('Preserve the explicit time limit');
  });

  test('LLM quality judge flags document-offer replies for routine quick recommendations', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'Would you like me to create a recipe canvas for that?',
        turnPlan: plan(),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['missing_time_constraint', 'not_actionable', 'needless_clarification'],
          rationaleLabels: ['workflow_offer_without_guidance'],
        }),
    );

    expect(result.failureLabels).toEqual(
      expect.arrayContaining([
        'missing_time_constraint',
        'not_actionable',
        'needless_clarification',
      ]),
    );
  });

  test('LLM quality judge flags canvas mutation claims when no draft changed', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'I updated the selected cooking document with faster timing.',
        turnPlan: plan({ intent: 'document_question', constraints: { hard: [], soft: [] } }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['canvas_claim_without_mutation'],
          rationaleLabels: ['false_canvas_claim'],
        }),
    );

    expect(result.failureLabels).toContain('canvas_claim_without_mutation');
  });

  test('LLM quality judge flags contracted canvas mutation claims when no draft changed', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: "I've created a recipe canvas for you that mirrors the source recipe.",
        turnPlan: plan({ intent: 'recipe_request', action: 'create_document' }),
        draftChanged: false,
        webSources: [],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['canvas_claim_without_mutation'],
          rationaleLabels: ['false_canvas_claim'],
        }),
    );

    expect(result.failureLabels).toContain('canvas_claim_without_mutation');
  });

  test('LLM quality judge flags source-only researched completions', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'Sources:\n[USDA](https://example.com/usda)',
        turnPlan: plan({
          intent: 'research_request',
          action: 'research_then_answer',
          promptProfile: 'source_or_research',
          constraints: { hard: [], soft: [] },
        }),
        draftChanged: false,
        webSources: [
          {
            title: 'USDA',
            url: 'https://example.com/usda',
            sourceType: 'safety',
            accessedAt: '2026-05-27T00:00:00.000Z',
          },
        ],
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['source_only_response'],
          rationaleLabels: ['source_only'],
        }),
    );

    expect(result.failureLabels).toContain('source_only_response');
  });

  test('LLM quality judge flags granular location, timezone, timestamp, and private inventory leaks', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'Since you are in Dwarka and it is Asia/Calcutta at 2026-05-27T12:30, use your chili oil.',
        turnPlan: plan(),
        draftChanged: false,
        webSources: [],
        conversationCreatedAt: '2026-05-27T07:00:00.000Z',
        timeZone: 'Asia/Calcutta',
        preferencesMarkdown: [
          '## Location',
          '- Dwarka, Delhi, India.',
          '',
          '## Specialty Ingredients',
          '- Chili oil',
        ].join('\n'),
      },
      async () =>
        JSON.stringify({
          passes: false,
          failureLabels: ['private_context_leak'],
          rationaleLabels: ['private_profile_disclosed'],
        }),
    );

    expect(result.failureLabels).toContain('private_context_leak');
  });

  test('LLM quality judge can pass generic ingredient mentions without private leak', async () => {
    const result = await validateCookingResponseWithJudge(
      {
        text: 'A quick chili-oil noodle bowl would take about 10 minutes.',
        turnPlan: plan(),
        draftChanged: false,
        webSources: [],
        preferencesMarkdown: ['## Specialty Ingredients', '- Chili oil'].join('\n'),
      },
      async () => JSON.stringify({ passes: true, failureLabels: [] }),
    );

    expect(result.failureLabels).not.toContain('private_context_leak');
  });
});
