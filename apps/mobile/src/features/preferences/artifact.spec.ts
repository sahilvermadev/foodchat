import { preferenceSections, replacePreferenceSection } from './artifact';

describe('preference artifact', () => {
  test('presents every preference section in canonical order', () => {
    const sections = preferenceSections(
      '## Taste\n- Spicy\n- Garlic lover\n\n## Safety\n- Peanut allergy',
    );

    expect(sections[0]).toEqual({ heading: 'Safety', lines: ['Peanut allergy'] });
    expect(sections.find((section) => section.heading === 'Taste')?.lines).toEqual([
      'Spicy',
      'Garlic lover',
    ]);
    expect(sections).toHaveLength(11);
  });

  test('replaces one section without losing the rest of the profile', () => {
    const markdown = replacePreferenceSection(
      '## Safety\n- Peanut allergy\n\n## Taste\n- Spicy',
      'Diet',
      ['Vegetarian', '- Dairy-free'],
    );

    expect(markdown).toContain('## Safety\n- Peanut allergy');
    expect(markdown).toContain('## Diet\n- Vegetarian\n- Dairy-free');
    expect(markdown).toContain('## Taste\n- Spicy');
  });

  test('removes a section when its final value is cleared', () => {
    const markdown = replacePreferenceSection(
      '## Diet\n- Vegan\n\n## Goals\n- Quick dinners',
      'Diet',
      [],
    );

    expect(markdown).not.toContain('## Diet');
    expect(markdown).toContain('## Goals\n- Quick dinners');
  });
});
