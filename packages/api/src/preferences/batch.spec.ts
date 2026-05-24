import { applyCuratedPreferenceSections, withPendingPreferenceBatch } from './batch';

describe('preference batch helpers', () => {
  test('marks user messages as pending without dropping existing metadata', () => {
    const message = withPendingPreferenceBatch({
      messageId: 'message-1',
      metadata: {
        existing: true,
      },
    });

    expect(message.metadata).toMatchObject({
      existing: true,
      cookingPreferenceBatch: {
        status: 'pending',
        queuedAt: expect.any(String),
      },
    });
  });

  test('rewrites only curated sections and preserves unaffected markdown', () => {
    const result = applyCuratedPreferenceSections(
      [
        '## Safety',
        '- Avoid peanuts.',
        '',
        '## Kitchen',
        '- Has an oven.',
        '',
        '## Taste',
        '- Likes spicy food.',
      ].join('\n'),
      {
        Kitchen: '- Has an oven.\n- Does not own an immersion blender.',
      },
    );

    expect(result.changed).toBe(true);
    expect(result.markdown).toBe(
      [
        '## Safety',
        '- Avoid peanuts.',
        '',
        '## Kitchen',
        '- Has an oven.',
        '- Does not own an immersion blender.',
        '',
        '## Taste',
        '- Likes spicy food.',
      ].join('\n'),
    );
  });
});
