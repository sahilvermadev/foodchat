import type { CookingTurnPlan } from './planner';
import { routeCookingModels, routeCookingPlanner } from './routing';

function plan(overrides: Partial<CookingTurnPlan> = {}): CookingTurnPlan {
  return {
    category: 'cooking_help',
    intent: 'general_cooking_question',
    action: 'direct_answer',
    confidence: 'high',
    constraints: { hard: [], soft: [] },
    selectedContextCategories: ['hard_constraints'],
    withheldContextCategories: [],
    promptProfile: 'routine_direct',
    deliveryMode: 'standard',
    clarification: { needed: false },
    privacySafeRationaleLabels: [],
    toolPolicy: { allowDocumentTools: false, allowResearchRequestTool: false },
    plannerUsed: true,
    ...overrides,
  };
}

describe('cooking model routing', () => {
  test('keeps routine direct answers on the default fast model', () => {
    const routes = routeCookingModels({
      defaultModel: 'fast',
      complexModel: 'strong',
      turnPlan: plan(),
      safetySensitive: false,
      sourceDependent: false,
    });

    expect(routes.response).toMatchObject({
      model: 'fast',
      reason: 'routine_direct',
      elevated: false,
    });
  });

  test('routes food-safety and source-dependent work to the configured complex model', () => {
    const safety = routeCookingModels({
      defaultModel: 'fast',
      complexModel: 'strong',
      turnPlan: plan(),
      safetySensitive: true,
      sourceDependent: false,
    });
    const source = routeCookingModels({
      defaultModel: 'fast',
      complexModel: 'strong',
      turnPlan: plan({
        intent: 'source_driven_request',
        action: 'read_source',
        promptProfile: 'source_or_research',
      }),
      safetySensitive: false,
      sourceDependent: true,
    });

    expect(safety.response).toMatchObject({ model: 'strong', reason: 'food_safety' });
    expect(source.response).toMatchObject({ model: 'strong', reason: 'source_or_research' });
  });

  test('routes document mutation and quality repair independently', () => {
    const routes = routeCookingModels({
      defaultModel: 'fast',
      complexModel: 'strong',
      repairModel: 'repair',
      plannerModel: 'planner',
      turnPlan: plan({
        intent: 'recipe_request',
        action: 'create_document',
        promptProfile: 'document_work',
      }),
      safetySensitive: false,
      sourceDependent: false,
    });

    expect(routes.planner.model).toBe('planner');
    expect(routes.response).toMatchObject({ model: 'strong', reason: 'document_work' });
    expect(routes.repair).toMatchObject({ model: 'repair', reason: 'quality_repair' });
  });

  test('elevates planning only for preflight-classified complex work', () => {
    const routine = routeCookingPlanner({
      defaultModel: 'fast',
      plannerModel: 'planner',
      complexModel: 'strong',
      complexPlanning: false,
    });
    const complex = routeCookingPlanner({
      defaultModel: 'fast',
      plannerModel: 'planner',
      complexModel: 'strong',
      complexPlanning: true,
    });

    expect(routine).toMatchObject({ model: 'planner', reason: 'planner' });
    expect(complex).toMatchObject({ model: 'strong', reason: 'complex_planning' });
  });
});
