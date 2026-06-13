import type { CookingTurnPlan } from './planner';
import { canStreamCookingTurnBeforeValidation } from './streaming';

function plan(overrides: Partial<CookingTurnPlan> = {}): CookingTurnPlan {
  return {
    category: 'ideas',
    intent: 'quick_recommendation',
    action: 'direct_answer',
    confidence: 'high',
    constraints: {
      hard: [],
      soft: ['fast dinner'],
    },
    selectedContextCategories: ['hard_constraints', 'taste', 'kitchen'],
    withheldContextCategories: ['locale', 'personal_context'],
    promptProfile: 'routine_direct',
    deliveryMode: 'glance',
    clarification: {
      needed: false,
    },
    privacySafeRationaleLabels: ['quick_food'],
    toolPolicy: {
      allowDocumentTools: false,
      allowResearchRequestTool: false,
    },
    plannerUsed: true,
    ...overrides,
  };
}

describe('cooking streaming gate', () => {
  test('allows routine direct answers with irrelevant soft preference context', () => {
    expect(
      canStreamCookingTurnBeforeValidation({
        turnPlan: plan(),
        activeCanvas: false,
        draftChanged: false,
        sourceReadRequired: false,
      }),
    ).toBe(true);
  });

  test('blocks hard constraints and sensitive profile context', () => {
    expect(
      canStreamCookingTurnBeforeValidation({
        turnPlan: plan({ constraints: { hard: ['peanut allergy'], soft: [] } }),
        activeCanvas: false,
        draftChanged: false,
        sourceReadRequired: false,
      }),
    ).toBe(false);

    expect(
      canStreamCookingTurnBeforeValidation({
        turnPlan: plan({ selectedContextCategories: ['hard_constraints', 'locale'] }),
        activeCanvas: false,
        draftChanged: false,
        sourceReadRequired: false,
      }),
    ).toBe(false);
  });
});
