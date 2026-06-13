import { deriveCookingChatCategory, resolveCookingChatCategory } from './category';

describe('cooking conversation categories', () => {
  test('uses broad fallback categories for common cooking jobs', () => {
    expect(
      deriveCookingChatCategory({
        text: 'What can I cook tonight?',
        intent: 'quick_recommendation',
        action: 'direct_answer',
      }),
    ).toBe('ideas');
    expect(
      deriveCookingChatCategory({
        text: 'Make me a complete biryani recipe',
        intent: 'recipe_request',
        action: 'create_document',
      }),
    ).toBe('recipes');
    expect(
      deriveCookingChatCategory({
        text: 'Scale this to six servings',
        intent: 'document_edit',
        action: 'revise_document',
      }),
    ).toBe('adjustments');
    expect(
      deriveCookingChatCategory({
        text: 'Why did my sauce split?',
        intent: 'general_cooking_question',
        action: 'direct_answer',
      }),
    ).toBe('cooking_help');
  });

  test('keeps the strongest established session category', () => {
    expect(
      resolveCookingChatCategory({
        currentCategory: 'adjustments',
        proposedCategory: 'cooking_help',
        text: 'How should I store it?',
        intent: 'document_question',
        action: 'direct_answer',
      }),
    ).toBe('adjustments');
  });

  test('makes recipes sticky whenever the session contains a recipe document', () => {
    expect(
      resolveCookingChatCategory({
        currentCategory: 'ideas',
        proposedCategory: 'adjustments',
        text: 'Make it spicier',
        intent: 'document_edit',
        action: 'revise_document',
        existingDocumentTypes: ['recipe'],
      }),
    ).toBe('recipes');
  });

  test('keeps saved recipe conversations distinct from newly created recipe chats', () => {
    expect(
      resolveCookingChatCategory({
        currentCategory: 'saved_recipe',
        proposedCategory: 'adjustments',
        text: 'Make my saved recipe spicier',
        intent: 'document_edit',
        action: 'revise_document',
        existingDocumentTypes: ['recipe'],
      }),
    ).toBe('saved_recipe');
  });
});
