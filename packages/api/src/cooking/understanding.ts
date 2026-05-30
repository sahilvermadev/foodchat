import type { TMessage } from 'librechat-data-provider';

import type { MealOccasion, TurnContext, TurnContextConfidence } from './context';

export type CookingTurnIntent =
  | 'quick_recommendation'
  | 'recipe_request'
  | 'document_question'
  | 'document_edit'
  | 'source_driven_request'
  | 'research_request'
  | 'general_cooking_question';

export type CookingResponseMode =
  | 'direct_answer'
  | 'ask_clarifying_question'
  | 'create_document'
  | 'revise_document'
  | 'read_document'
  | 'research_then_answer';

export type CookingTurnUnderstanding = {
  intent: CookingTurnIntent;
  responseMode: CookingResponseMode;
  activeCorrections: string[];
  constraints: {
    hard: string[];
    soft: string[];
  };
  contextPolicy: {
    allowSpecialtyIngredients: boolean;
    allowPersonalContext: boolean;
    allowLocaleSignal: boolean;
    preferEverydayAccessibleFood: boolean;
    situationalPriors: {
      localeCountry?: string;
      likelyMealOccasion?: Exclude<MealOccasion, 'unknown'>;
      mealOccasionConfidence?: Exclude<TurnContextConfidence, 'unknown'>;
      explicitMealOccasion?: Exclude<MealOccasion, 'unknown'>;
      suppressedMealOccasionReason?: 'explicit_meal_request' | 'specific_food_request';
    };
  };
  toolPolicy: {
    allowDocumentTools: boolean;
    allowResearchRequestTool: boolean;
  };
};

export type CookingTurnUnderstandingInput = {
  conversationId: string;
  text: string;
  messages?: TMessage[];
  hasActiveDraft?: boolean;
  turnContext?: TurnContext;
};

function situationalPriors(
  turnContext: TurnContext | undefined,
): CookingTurnUnderstanding['contextPolicy']['situationalPriors'] {
  const likelyMealOccasion = turnContext?.likelyMealOccasion;
  const confidence = turnContext?.confidence;
  const usableRuntimeOccasion =
    likelyMealOccasion &&
    likelyMealOccasion !== 'unknown' &&
    confidence &&
    confidence !== 'unknown';

  return {
    ...(turnContext?.coarseLocaleCountry ? { localeCountry: turnContext.coarseLocaleCountry } : {}),
    ...(usableRuntimeOccasion
      ? {
          likelyMealOccasion,
          mealOccasionConfidence: confidence,
        }
      : {}),
  };
}

export function understandCookingTurn(
  input: CookingTurnUnderstandingInput,
): CookingTurnUnderstanding {
  return {
    intent: 'general_cooking_question',
    responseMode: 'direct_answer',
    activeCorrections: [],
    constraints: {
      hard: [],
      soft: [],
    },
    contextPolicy: {
      allowSpecialtyIngredients: false,
      allowPersonalContext: true,
      allowLocaleSignal: true,
      preferEverydayAccessibleFood: false,
      situationalPriors: situationalPriors(input.turnContext),
    },
    toolPolicy: {
      allowDocumentTools: true,
      allowResearchRequestTool: true,
    },
  };
}
