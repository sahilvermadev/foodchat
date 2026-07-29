import { structuredRecipeMarkdownSections } from './recipe';

describe('structuredRecipeMarkdownSections', () => {
  test('keeps the introduction and notes while removing canonical ingredients and instructions', () => {
    const result = structuredRecipeMarkdownSections(
      `A silky, charred chicken dish.

## Ingredients
- chicken

## Instructions
1. Rest the chicken. [timer:1200]

## Notes
Serve immediately.`,
      { ingredients: true, instructions: true },
    );

    expect(result.preamble).toBe('A silky, charred chicken dish.');
    expect(result.remainder).toBe('## Notes\nServe immediately.');
    expect(result.remainder).not.toContain('[timer:1200]');
  });

  test('preserves Markdown instructions when structured steps are unavailable', () => {
    const markdown = '## Instructions\n1. Simmer gently. [timer:600]';
    expect(
      structuredRecipeMarkdownSections(markdown, { ingredients: false, instructions: false }),
    ).toEqual({ preamble: '', remainder: markdown });
  });
});
