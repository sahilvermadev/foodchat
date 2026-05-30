import type { CookingPlannedAction, CookingPromptProfile } from './planner';
import type { CookingQualityFailureLabel } from './quality';

export type CookingEvaluationExpectation = {
  plannedAction?: CookingPlannedAction;
  promptProfile?: CookingPromptProfile;
  requiredTools?: string[];
  forbiddenTools?: string[];
  forbiddenResponseTerms?: string[];
  draftChanged?: boolean;
  sourceRequired?: boolean;
};

export type CookingEvaluationTurn = {
  text: string;
  preferencesMarkdown?: string;
  hasActiveDraft?: boolean;
  expectation: CookingEvaluationExpectation;
};

export type CookingEvaluationScenario = {
  id: string;
  title: string;
  turns: CookingEvaluationTurn[];
};

export type CookingEvaluationObservation = {
  text: string;
  plannedAction: CookingPlannedAction;
  promptProfile: CookingPromptProfile;
  availableToolNames: string[];
  qualityFailureLabels: CookingQualityFailureLabel[];
  draftChanged: boolean;
  webSourceCount: number;
  durationMs: number;
  repairAttempted: boolean;
};

export type CookingEvaluationTurnResult = {
  scenarioId: string;
  turnIndex: number;
  passed: boolean;
  failures: string[];
  observation: CookingEvaluationObservation;
};

export type CookingEvaluationResult = {
  scenarioId: string;
  passed: boolean;
  turns: CookingEvaluationTurnResult[];
};

export type CookingEvaluationSuiteResult = {
  passed: boolean;
  scenarios: CookingEvaluationResult[];
  latency: CookingLatencyBaseline;
};

export type CookingLatencyBaseline = {
  sampleCount: number;
  routineDirectCount: number;
  complexTurnCount: number;
  repairCount: number;
  repairRate: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
};

export type CookingEvaluationRunner = (
  scenario: CookingEvaluationScenario,
  turn: CookingEvaluationTurn,
  turnIndex: number,
) => Promise<CookingEvaluationObservation>;

function includesInsensitive(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function percentile(sortedDurations: number[], percentileValue: number): number {
  if (sortedDurations.length === 0) {
    return 0;
  }
  const index = Math.ceil((percentileValue / 100) * sortedDurations.length) - 1;
  return sortedDurations[Math.max(0, Math.min(index, sortedDurations.length - 1))];
}

export function scoreCookingEvaluationTurn(
  scenarioId: string,
  turnIndex: number,
  turn: CookingEvaluationTurn,
  observation: CookingEvaluationObservation,
): CookingEvaluationTurnResult {
  const failures: string[] = [];
  const expectation = turn.expectation;

  if (expectation.plannedAction && observation.plannedAction !== expectation.plannedAction) {
    failures.push(`planned_action:${observation.plannedAction}`);
  }
  if (expectation.promptProfile && observation.promptProfile !== expectation.promptProfile) {
    failures.push(`prompt_profile:${observation.promptProfile}`);
  }
  for (const toolName of expectation.requiredTools ?? []) {
    if (!observation.availableToolNames.includes(toolName)) {
      failures.push(`missing_tool:${toolName}`);
    }
  }
  for (const toolName of expectation.forbiddenTools ?? []) {
    if (observation.availableToolNames.includes(toolName)) {
      failures.push(`forbidden_tool:${toolName}`);
    }
  }
  for (const term of expectation.forbiddenResponseTerms ?? []) {
    if (includesInsensitive(observation.text, term)) {
      failures.push(`private_or_irrelevant_text:${term}`);
    }
  }
  if (
    typeof expectation.draftChanged === 'boolean' &&
    observation.draftChanged !== expectation.draftChanged
  ) {
    failures.push(`draft_changed:${observation.draftChanged}`);
  }
  if (expectation.sourceRequired && observation.webSourceCount === 0) {
    failures.push('missing_source');
  }
  if (observation.qualityFailureLabels.length > 0) {
    failures.push(`quality:${observation.qualityFailureLabels.join(',')}`);
  }

  return {
    scenarioId,
    turnIndex,
    passed: failures.length === 0,
    failures,
    observation,
  };
}

export function buildCookingLatencyBaseline(
  results: CookingEvaluationResult[],
): CookingLatencyBaseline {
  const observations = results.flatMap((result) => result.turns.map((turn) => turn.observation));
  const durations = observations.map((observation) => observation.durationMs).sort((a, b) => a - b);
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const repairCount = observations.filter((observation) => observation.repairAttempted).length;
  const routineDirectCount = observations.filter(
    (observation) => observation.promptProfile === 'routine_direct',
  ).length;

  return {
    sampleCount: observations.length,
    routineDirectCount,
    complexTurnCount: observations.length - routineDirectCount,
    repairCount,
    repairRate: observations.length === 0 ? 0 : repairCount / observations.length,
    averageDurationMs:
      observations.length === 0 ? 0 : Math.round(totalDuration / observations.length),
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
  };
}

export async function runCookingEvaluationScenario(
  scenario: CookingEvaluationScenario,
  runner: CookingEvaluationRunner,
): Promise<CookingEvaluationResult> {
  const turns: CookingEvaluationTurnResult[] = [];
  for (let index = 0; index < scenario.turns.length; index += 1) {
    const turn = scenario.turns[index];
    const observation = await runner(scenario, turn, index);
    turns.push(scoreCookingEvaluationTurn(scenario.id, index, turn, observation));
  }
  return {
    scenarioId: scenario.id,
    passed: turns.every((turn) => turn.passed),
    turns,
  };
}

export async function runCookingEvaluationSuite(
  scenarios: CookingEvaluationScenario[],
  runner: CookingEvaluationRunner,
): Promise<CookingEvaluationSuiteResult> {
  const results: CookingEvaluationResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runCookingEvaluationScenario(scenario, runner));
  }
  return {
    passed: results.every((result) => result.passed),
    scenarios: results,
    latency: buildCookingLatencyBaseline(results),
  };
}

export const cookingEvaluationScenarios: CookingEvaluationScenario[] = [
  {
    id: 'quick-everyday-private-context',
    title: 'Quick everyday recommendation keeps specialty inventory private',
    turns: [
      {
        text: 'Suggest me something to eat which can be cooked fast under 15 mins.',
        preferencesMarkdown:
          '## Location\n- Dwarka, Delhi, India.\n\n## Specialty Ingredients\n- Chili oil\n- Fish sauce',
        expectation: {
          plannedAction: 'direct_answer',
          promptProfile: 'routine_direct',
          forbiddenTools: ['create_cooking_document', 'search_web'],
          forbiddenResponseTerms: ['Dwarka', 'chili oil', 'fish sauce'],
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'normal-food-correction',
    title: 'Normal food correction remains active across turns',
    turns: [
      {
        text: 'These are specialty ingredients. Give me normal food.',
        expectation: {
          plannedAction: 'direct_answer',
          forbiddenResponseTerms: ['fish sauce', 'chili oil'],
          draftChanged: false,
        },
      },
      {
        text: 'Something from Indian cuisine.',
        expectation: {
          plannedAction: 'direct_answer',
          forbiddenResponseTerms: ['fish sauce', 'chili oil'],
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'immediate-indian-recipe',
    title: 'Recipe request receives usable guidance without workflow delay',
    turns: [
      {
        text: 'Give me a normal Indian recipe I can cook now.',
        expectation: {
          plannedAction: 'direct_answer',
          forbiddenResponseTerms: ['Would you like me to create a canvas'],
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'hard-dietary-rule',
    title: 'Hard dietary constraints override plausible suggestions',
    turns: [
      {
        text: 'Recommend a quick dinner.',
        preferencesMarkdown: '## Diet\n- Vegetarian only.',
        expectation: {
          plannedAction: 'direct_answer',
          forbiddenResponseTerms: ['chicken', 'bacon'],
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'meal-occasion-prior',
    title: 'Meal occasion shapes suggestions without revealing inference',
    turns: [
      {
        text: 'Suggest something quick to eat.',
        expectation: {
          plannedAction: 'direct_answer',
          forbiddenResponseTerms: ['your timezone', 'based on your location'],
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'explicit-specialty-use',
    title: 'Specialty inventory becomes relevant when explicitly requested',
    turns: [
      {
        text: 'Give me a creative way to use chili oil.',
        preferencesMarkdown: '## Specialty Ingredients\n- Chili oil',
        expectation: {
          plannedAction: 'direct_answer',
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'linked-recipe-source',
    title: 'A supplied recipe source is read before faithful adaptation',
    turns: [
      {
        text: 'Use this exact recipe: https://example.com/recipe',
        expectation: {
          promptProfile: 'source_or_research',
          sourceRequired: true,
        },
      },
    ],
  },
  {
    id: 'researched-answer',
    title: 'Requested research produces substantive sourced guidance',
    turns: [
      {
        text: 'Verify the safe storage time for this cooked dish.',
        expectation: {
          plannedAction: 'research_then_answer',
          promptProfile: 'source_or_research',
          sourceRequired: true,
        },
      },
    ],
  },
  {
    id: 'canvas-discussion',
    title: 'A selected document can be discussed without mutation',
    turns: [
      {
        text: 'Why is this recipe using so much liquid?',
        hasActiveDraft: true,
        expectation: {
          promptProfile: 'active_canvas_discussion',
          draftChanged: false,
        },
      },
    ],
  },
  {
    id: 'canvas-edit',
    title: 'An explicit document edit revises the selected canvas',
    turns: [
      {
        text: 'Update this recipe to serve four.',
        hasActiveDraft: true,
        expectation: {
          plannedAction: 'revise_document',
          promptProfile: 'document_work',
          requiredTools: ['revise_cooking_document'],
          draftChanged: true,
        },
      },
    ],
  },
];
