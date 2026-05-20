import {
  populatedPreferenceSections,
  preferenceSections,
  renderEditablePreferencesMarkdown,
  renderPreferencesMarkdown,
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

  it('renders every canonical section for display', () => {
    const sections = preferenceSections('## Safety\n- No peanuts.');

    expect(sections.map((section) => section.heading)).toContain('Religious & Cultural Rules');
    expect(sections.find((section) => section.heading === 'Safety')?.lines).toEqual([
      '- No peanuts.',
    ]);
    expect(sections.find((section) => section.heading === 'Religious & Cultural Rules')?.lines).toEqual(
      [],
    );
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
