import {
  applyPreferencePatch,
  preferenceProfileStatus,
  renderPreferencesMarkdown,
} from './artifact';

describe('preference artifact helpers', () => {
  test('keeps broad equipment and location notes out of Safety', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Safety',
      markdown: 'I have an oven, microwave, electric grill, and live in Delhi near Modern Bazaar.',
    });

    expect(result.markdown).toBe('');
    expect(result.changed).toBe(false);
    expect(result.changedHeadings).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining('Skipped broad or misplaced Safety preference'),
    ]);
  });

  test('allows explicit absence of safety precautions', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Safety',
      markdown: 'No allergies or major safety precautions.',
    });

    expect(result.changed).toBe(true);
    expect(result.changedHeadings).toEqual(['Safety']);
    expect(result.markdown).toBe('## Safety\n- No allergies or major safety precautions.');
  });

  test('stores personal context as relationship context', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Personal Context',
      markdown: 'I cook after work and like learning the reason behind techniques.',
    });

    expect(result.changed).toBe(true);
    expect(result.changedHeadings).toEqual(['Personal Context']);
    expect(result.markdown).toBe(
      '## Personal Context\n- I cook after work and like learning the reason behind techniques.',
    );
  });

  test('rejects transient cooking projects as durable personal context', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Personal Context',
      markdown: [
        'Currently working on mastering a classic cheese souffle.',
        'Interested in learning to bake khameeri roti.',
        'Considering adding a French whisk to kitchen tools.',
        'Interested in undertaking periodic intensive kitchen projects.',
      ].join('\n'),
    });

    expect(result.markdown).toBe('');
    expect(result.changed).toBe(false);
    expect(result.changedHeadings).toEqual([]);
    expect(result.warnings).toEqual([
      expect.stringContaining('Skipped broad or misplaced Personal Context preference'),
      expect.stringContaining('Skipped broad or misplaced Personal Context preference'),
      expect.stringContaining('Skipped broad or misplaced Personal Context preference'),
      expect.stringContaining('Skipped broad or misplaced Personal Context preference'),
    ]);
  });

  test('allows durable learning style without saving a current project', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Goals',
      markdown: 'Enjoys occasional long kitchen projects for technique mastery.',
    });

    expect(result.changed).toBe(true);
    expect(result.changedHeadings).toEqual(['Goals']);
    expect(result.markdown).toBe(
      '## Goals\n- Enjoys occasional long kitchen projects for technique mastery.',
    );
  });

  test('stores durable specialty ingredients separately from kitchen equipment', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Specialty Ingredients',
      markdown: 'Usually keeps gochujang, capers, and preserved lemons on hand.',
    });

    expect(result.changed).toBe(true);
    expect(result.changedHeadings).toEqual(['Specialty Ingredients']);
    expect(result.markdown).toBe(
      '## Specialty Ingredients\n- Usually keeps gochujang, capers, and preserved lemons on hand.',
    );
  });

  test('stores religious and cultural rules separately from safety', () => {
    const result = applyPreferencePatch('', {
      op: 'append_to_section',
      heading: 'Religious & Cultural Rules',
      markdown: 'Avoids pork and alcohol for religious reasons.',
    });

    expect(result.changed).toBe(true);
    expect(result.changedHeadings).toEqual(['Religious & Cultural Rules']);
    expect(result.markdown).toBe(
      '## Religious & Cultural Rules\n- Avoids pork and alcohol for religious reasons.',
    );
  });

  test('reports profile completion only after core sections are populated', () => {
    const markdown = renderPreferencesMarkdown(`
## Safety
- No allergies.
## Diet
- No dietary rules.
## Religious & Cultural Rules
- No religious or cultural food rules.
## Cooking Level
- Beginner to intermediate.
## Household
- Usually cooks for three people.
## Kitchen
- Has an oven and a large freezer.
## Goals
- Wants authentic, tasty dishes without too much time.
## Location
- Cooks in Delhi with good ingredient access.
`);

    expect(preferenceProfileStatus(markdown)).toMatchObject({
      complete: true,
      missing: [],
      populated: [
        'Safety',
        'Diet',
        'Religious & Cultural Rules',
        'Cooking Level',
        'Household',
        'Kitchen',
        'Goals',
        'Location',
      ],
    });
  });
});
