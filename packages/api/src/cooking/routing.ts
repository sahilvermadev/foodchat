import type { CookingTurnPlan } from './planner';

export type CookingModelPurpose = 'planner' | 'response' | 'quality_repair';

export type CookingModelRoutingReason =
  | 'planner'
  | 'complex_planning'
  | 'routine_direct'
  | 'food_safety'
  | 'source_or_research'
  | 'document_work'
  | 'quality_repair';

export type CookingModelRoute = {
  model: string;
  purpose: CookingModelPurpose;
  reason: CookingModelRoutingReason;
  elevated: boolean;
};

export type CookingModelRoutes = {
  planner: CookingModelRoute;
  response: CookingModelRoute;
  repair: CookingModelRoute;
};

export type CookingModelRoutingInput = {
  defaultModel: string;
  plannerModel?: string;
  complexModel?: string;
  repairModel?: string;
  turnPlan: CookingTurnPlan;
  safetySensitive: boolean;
  sourceDependent: boolean;
};

export type CookingPlannerRoutingInput = {
  defaultModel: string;
  plannerModel?: string;
  complexModel?: string;
  complexPlanning: boolean;
};

function configuredModel(value: string | undefined): string | undefined {
  const model = value?.trim();
  return model || undefined;
}

function responseReason(input: CookingModelRoutingInput): CookingModelRoutingReason {
  if (input.safetySensitive) {
    return 'food_safety';
  }
  if (
    input.sourceDependent ||
    input.turnPlan.promptProfile === 'source_or_research' ||
    input.turnPlan.action === 'research_then_answer' ||
    input.turnPlan.action === 'read_source'
  ) {
    return 'source_or_research';
  }
  if (
    input.turnPlan.promptProfile === 'document_work' &&
    (input.turnPlan.action === 'create_document' || input.turnPlan.action === 'revise_document')
  ) {
    return 'document_work';
  }
  return 'routine_direct';
}

export function routeCookingPlanner(input: CookingPlannerRoutingInput): CookingModelRoute {
  const planner = configuredModel(input.plannerModel) ?? input.defaultModel;
  const complex = configuredModel(input.complexModel);
  const model = input.complexPlanning ? (complex ?? planner) : planner;
  return {
    model,
    purpose: 'planner',
    reason: input.complexPlanning ? 'complex_planning' : 'planner',
    elevated: model !== input.defaultModel,
  };
}

export function routeCookingModels(input: CookingModelRoutingInput): CookingModelRoutes {
  const reason = responseReason(input);
  const planner = configuredModel(input.plannerModel) ?? input.defaultModel;
  const complex = configuredModel(input.complexModel);
  const response =
    reason === 'routine_direct' ? input.defaultModel : (complex ?? input.defaultModel);
  const repair = configuredModel(input.repairModel) ?? complex ?? response;

  return {
    planner: {
      model: planner,
      purpose: 'planner',
      reason: 'planner',
      elevated: planner !== input.defaultModel,
    },
    response: {
      model: response,
      purpose: 'response',
      reason,
      elevated: response !== input.defaultModel,
    },
    repair: {
      model: repair,
      purpose: 'quality_repair',
      reason: 'quality_repair',
      elevated: repair !== input.defaultModel,
    },
  };
}
