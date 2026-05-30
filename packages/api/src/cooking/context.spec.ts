import { buildTurnContext } from './context';

describe('cooking turn context', () => {
  test('maps Asia/Calcutta morning to breakfast', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T02:30:00.000Z',
      timeZone: 'Asia/Calcutta',
      locale: 'en-IN',
    });

    expect(context.likelyMealOccasion).toBe('breakfast');
    expect(context.confidence).toBe('medium');
    expect(context.timeZoneSource).toBe('input');
    expect(context.coarseLocaleCountry).toBe('India');
    expect(context.normalizedLocalTimestamp).toBe('2026-05-27T08:00:00');
  });

  test('maps Asia/Calcutta midday to lunch', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
    });

    expect(context.likelyMealOccasion).toBe('lunch');
  });

  test('maps Asia/Calcutta evening to dinner', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T14:30:00.000Z',
      timeZone: 'Asia/Calcutta',
    });

    expect(context.likelyMealOccasion).toBe('dinner');
  });

  test('maps Asia/Calcutta late night to late_night', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T19:30:00.000Z',
      timeZone: 'Asia/Calcutta',
    });

    expect(context.likelyMealOccasion).toBe('late_night');
  });

  test('maps missing or invalid date or timezone to unknown', () => {
    expect(
      buildTurnContext({
        conversationCreatedAt: 'not-a-date',
        timeZone: 'Asia/Calcutta',
      }).likelyMealOccasion,
    ).toBe('unknown');
    expect(
      buildTurnContext({
        conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      }).likelyMealOccasion,
    ).toBe('unknown');
    expect(
      buildTurnContext({
        conversationCreatedAt: '2026-05-27T07:00:00.000Z',
        timeZone: 'Invalid/Zone',
      }).likelyMealOccasion,
    ).toBe('unknown');
  });

  test('uses explicitly saved preference timezone and coarse saved country only', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      preferencesMarkdown: [
        '## Location',
        '- Dwarka, Delhi, India.',
        '- Timezone: Asia/Calcutta.',
      ].join('\n'),
    });

    expect(context.likelyMealOccasion).toBe('lunch');
    expect(context.timeZoneSource).toBe('saved_preferences');
    expect(context.coarseLocaleCountry).toBe('India');
  });

  test('does not treat cuisine taste as saved locale', () => {
    const context = buildTurnContext({
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
      preferencesMarkdown: '## Taste\n- Likes Indian food and bold spices.',
    });

    expect(context.coarseLocaleCountry).toBeUndefined();
    expect(context.localeSource).toBe('unavailable');
  });
});
