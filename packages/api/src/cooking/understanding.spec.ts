import { buildTurnContext } from './context';
import { understandCookingTurn } from './understanding';

describe('cooking runtime turn context', () => {
  test('does not make semantic intent decisions from user wording', () => {
    const turn = understandCookingTurn({
      conversationId: 'conversation-1',
      text: 'suggest me something to eat fast under 15 mins',
    });

    expect(turn.intent).toBe('general_cooking_question');
    expect(turn.responseMode).toBe('direct_answer');
    expect(turn.constraints).toEqual({ hard: [], soft: [] });
    expect(turn.activeCorrections).toEqual([]);
    expect(turn.contextPolicy.allowSpecialtyIngredients).toBe(false);
    expect(turn.contextPolicy.preferEverydayAccessibleFood).toBe(false);
    expect(turn.toolPolicy.allowDocumentTools).toBe(true);
    expect(turn.toolPolicy.allowResearchRequestTool).toBe(true);
  });

  test('carries only runtime situational facts for the LLM planner and response model', () => {
    const turn = understandCookingTurn({
      conversationId: 'conversation-1',
      text: 'pasta please',
      turnContext: buildTurnContext({
        conversationCreatedAt: '2026-05-27T07:00:00.000Z',
        timeZone: 'Asia/Calcutta',
        locale: 'en-IN',
      }),
    });

    expect(turn.contextPolicy.situationalPriors).toEqual(
      expect.objectContaining({
        localeCountry: 'India',
        likelyMealOccasion: 'lunch',
        mealOccasionConfidence: 'medium',
      }),
    );
    expect(turn.contextPolicy.situationalPriors.suppressedMealOccasionReason).toBeUndefined();
  });
});
