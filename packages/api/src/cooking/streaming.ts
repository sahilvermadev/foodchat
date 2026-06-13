import type { CookingContextCategory, CookingTurnPlan } from './planner';

const sensitiveStreamingContext = new Set<CookingContextCategory>([
  'locale',
  'household',
  'personal_context',
]);

export function canStreamCookingTurnBeforeValidation(input: {
  turnPlan: CookingTurnPlan;
  activeCanvas: boolean;
  draftChanged: boolean;
  sourceReadRequired: boolean;
}): boolean {
  if (input.activeCanvas || input.draftChanged || input.sourceReadRequired) {
    return false;
  }
  if (input.turnPlan.action !== 'direct_answer') {
    return false;
  }
  if (input.turnPlan.promptProfile !== 'routine_direct') {
    return false;
  }
  if (
    input.turnPlan.intent !== 'general_cooking_question' &&
    input.turnPlan.intent !== 'quick_recommendation'
  ) {
    return false;
  }
  if (input.turnPlan.constraints.hard.length > 0) {
    return false;
  }
  if (
    input.turnPlan.selectedContextCategories.some((category) =>
      sensitiveStreamingContext.has(category),
    )
  ) {
    return false;
  }
  return true;
}
