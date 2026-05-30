import type { CookingEvaluationObservation } from './evaluation';
import {
  buildCookingLatencyBaseline,
  cookingEvaluationScenarios,
  runCookingEvaluationScenario,
  runCookingEvaluationSuite,
} from './evaluation';

function observation(
  overrides: Partial<CookingEvaluationObservation> = {},
): CookingEvaluationObservation {
  return {
    text: 'Make egg bhurji in about 10 minutes.',
    plannedAction: 'direct_answer',
    promptProfile: 'routine_direct',
    availableToolNames: [],
    qualityFailureLabels: [],
    draftChanged: false,
    webSourceCount: 0,
    durationMs: 100,
    repairAttempted: false,
    ...overrides,
  };
}

describe('cooking evaluation harness', () => {
  test('defines the ten PRD conversation scenarios', () => {
    expect(cookingEvaluationScenarios).toHaveLength(10);
    expect(cookingEvaluationScenarios.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining([
        'quick-everyday-private-context',
        'normal-food-correction',
        'linked-recipe-source',
        'canvas-edit',
      ]),
    );
  });

  test('scores privacy, tools, quality, document state, and source requirements', async () => {
    const scenario = cookingEvaluationScenarios[0];
    const result = await runCookingEvaluationScenario(scenario, async () =>
      observation({
        text: 'Since you are in Dwarka, use chili oil.',
        availableToolNames: ['create_cooking_document'],
        qualityFailureLabels: ['private_context_leak'],
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.turns[0].failures).toEqual(
      expect.arrayContaining([
        'forbidden_tool:create_cooking_document',
        'private_or_irrelevant_text:Dwarka',
        'private_or_irrelevant_text:chili oil',
        'quality:private_context_leak',
      ]),
    );
  });

  test('runs scenarios and establishes latency and repair baselines', async () => {
    const scenarios = cookingEvaluationScenarios.slice(0, 2);
    let turnCount = 0;
    const result = await runCookingEvaluationSuite(scenarios, async () => {
      turnCount += 1;
      return observation({
        durationMs: turnCount * 100,
        repairAttempted: turnCount === 2,
      });
    });

    expect(result.passed).toBe(true);
    expect(result.latency).toEqual({
      sampleCount: 3,
      routineDirectCount: 3,
      complexTurnCount: 0,
      repairCount: 1,
      repairRate: 1 / 3,
      averageDurationMs: 200,
      p50DurationMs: 200,
      p95DurationMs: 300,
    });
  });

  test('calculates an empty latency baseline safely', () => {
    expect(buildCookingLatencyBaseline([])).toMatchObject({
      sampleCount: 0,
      repairRate: 0,
      averageDurationMs: 0,
    });
  });
});
