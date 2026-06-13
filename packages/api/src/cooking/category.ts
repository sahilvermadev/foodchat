import type { CookingChatCategory, CookingDocumentType } from 'librechat-data-provider';

import type { CookingPlannedAction } from './planner';
import type { CookingTurnIntent } from './understanding';

const categoryPriority: Record<CookingChatCategory, number> = {
  ideas: 1,
  cooking_help: 2,
  adjustments: 3,
  recipes: 4,
  saved_recipe: 5,
};

export function deriveCookingChatCategory(input: {
  text: string;
  intent: CookingTurnIntent;
  action: CookingPlannedAction;
}): CookingChatCategory {
  if (input.action === 'create_document' || input.intent === 'recipe_request') {
    return 'recipes';
  }
  if (input.action === 'revise_document' || input.intent === 'document_edit') {
    return 'adjustments';
  }
  if (input.intent === 'quick_recommendation') {
    return 'ideas';
  }
  if (
    input.intent === 'source_driven_request' &&
    /\b(recipe|recreate|replicate|canvas|ingredients?|method|instructions?)\b/i.test(input.text)
  ) {
    return 'recipes';
  }
  if (
    /\b(what (?:can|should) (?:i|we) (?:cook|make)|ideas?|suggest|recommend|craving|pair(?:ing)?|menu|meal plan)\b/i.test(
      input.text,
    )
  ) {
    return 'ideas';
  }
  return 'cooking_help';
}

export function resolveCookingChatCategory(input: {
  currentCategory?: CookingChatCategory;
  proposedCategory?: CookingChatCategory;
  text: string;
  intent: CookingTurnIntent;
  action: CookingPlannedAction;
  existingDocumentTypes?: CookingDocumentType[];
  changedDocumentType?: CookingDocumentType;
}): CookingChatCategory {
  if (input.currentCategory === 'saved_recipe') {
    return 'saved_recipe';
  }

  const hasRecipe =
    input.existingDocumentTypes?.includes('recipe') === true ||
    input.changedDocumentType === 'recipe';
  if (hasRecipe) {
    return 'recipes';
  }

  const proposed =
    input.proposedCategory ??
    deriveCookingChatCategory({ text: input.text, intent: input.intent, action: input.action });
  if (!input.currentCategory) {
    return proposed;
  }
  return categoryPriority[proposed] > categoryPriority[input.currentCategory]
    ? proposed
    : input.currentCategory;
}
