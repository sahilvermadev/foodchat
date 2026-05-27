import {
  inferSpecialtyIngredientCategory,
  populatedPreferenceSections,
  preferenceSections,
  renderEditablePreferencesMarkdown,
  renderPreferencesMarkdown,
  replacePreferenceSection,
} from './artifact';

describe('preferences artifact helpers', () => {
  it('renders only populated sections', () => {
    expect(populatedPreferenceSections('## Safety\n\n## Taste\n- Bright acidity')).toEqual([
      { heading: 'Taste', lines: ['- Bright acidity'] },
    ]);
  });

  it('normalizes markdown to canonical populated headings', () => {
    expect(renderPreferencesMarkdown('## Kitchen\n- Induction stove\n\n## Goals\n')).toBe(
      '## Kitchen\n- Induction stove',
    );
  });

  it('renders personal context when present', () => {
    expect(
      populatedPreferenceSections('## Personal Context\n- Likes learning food history.'),
    ).toEqual([{ heading: 'Personal Context', lines: ['- Likes learning food history.'] }]);
  });

  it('renders religious and cultural rules when present', () => {
    expect(populatedPreferenceSections('## Religious & Cultural Rules\n- Keeps halal.')).toEqual([
      { heading: 'Religious & Cultural Rules', lines: ['- Keeps halal.'] },
    ]);
  });

  it('renders specialty ingredients when present', () => {
    expect(populatedPreferenceSections('## Specialty Ingredients\n- Preserved lemons')).toEqual([
      { heading: 'Specialty Ingredients', lines: ['- Preserved lemons'] },
    ]);
  });

  it('replaces specialty ingredients without disturbing other sections', () => {
    expect(
      replacePreferenceSection('## Taste\n- Likes spicy food', 'Specialty Ingredients', [
        'Gochujang',
        'Capers',
      ]),
    ).toBe('## Specialty Ingredients\n- Gochujang\n- Capers\n\n## Taste\n- Likes spicy food');
  });

  it('categorizes specialty ingredients from ingredient text', () => {
    expect(inferSpecialtyIngredientCategory('fish sauce')).toBe('Condiments & Sauces');
    expect(inferSpecialtyIngredientCategory('cheddar cheese')).toBe('Cheese & Dairy');
    expect(inferSpecialtyIngredientCategory('frozen mozzarella')).toBe('Freezer');
    expect(inferSpecialtyIngredientCategory('unknown item')).toBe('Other');
  });

  it('renders every canonical section for display', () => {
    const sections = preferenceSections('## Safety\n- No peanuts.');

    expect(sections.map((section) => section.heading)).toContain('Religious & Cultural Rules');
    expect(sections.map((section) => section.heading)).toContain('Specialty Ingredients');
    expect(sections.find((section) => section.heading === 'Safety')?.lines).toEqual([
      '- No peanuts.',
    ]);
    expect(
      sections.find((section) => section.heading === 'Religious & Cultural Rules')?.lines,
    ).toEqual([]);
  });

  it('creates a complete editable markdown template', () => {
    expect(renderEditablePreferencesMarkdown('## Kitchen\n- Induction stove')).toContain(
      '## Religious & Cultural Rules',
    );
    expect(renderEditablePreferencesMarkdown('## Kitchen\n- Induction stove')).toContain(
      '## Personal Context',
    );
  });
});
