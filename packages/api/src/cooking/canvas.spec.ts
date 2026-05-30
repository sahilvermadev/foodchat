import { applyRecipeCanvasOperations, isRecipeDocumentMarkdown } from './canvas';

const recipeMarkdown = `# Tomato Soup

## Equipment

- Pot

## Recipe Data

- Servings: 2
- Prep time: 5 minutes
- Cook time: 20 minutes
- Total time: 25 minutes

## Quality Checks

- Simmer until the tomatoes smell sweet.

## Ingredients

| Ingredient | Metric | Imperial | State/Form | Notes |
| --- | --- | --- | --- | --- |
| Tomato | 500 g | 1 lb | chopped | ripe |

## Instructions

1. Heat the pot for [timer:60] until warm and fragrant.
2. Simmer tomatoes for [timer:900] until soft and glossy.

## Notes

- Blend for a smoother soup.`;

describe('cooking canvas helpers', () => {
  it('recognizes structured recipe markdown', () => {
    expect(isRecipeDocumentMarkdown(recipeMarkdown)).toBe(true);
    expect(isRecipeDocumentMarkdown('Tell me about Indian cuisine.')).toBe(false);
  });

  it('applies deterministic recipe canvas operations', () => {
    const result = applyRecipeCanvasOperations(recipeMarkdown, [
      { op: 'set_title', title: 'Roasted Tomato Soup' },
      { op: 'replace_step', step: 2, markdown: '2. Roast tomatoes for [timer:1200] until jammy.' },
      { op: 'append_note', markdown: '- Finish with olive oil.' },
    ]);

    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.markdown).toContain('# Roasted Tomato Soup');
    expect(result.markdown).toContain('2. Roast tomatoes for [timer:1200] until jammy.');
    expect(result.markdown).toContain('- Finish with olive oil.');
  });

  it('reports patch warnings without changing unrelated sections', () => {
    const result = applyRecipeCanvasOperations(recipeMarkdown, [
      { op: 'replace_section', heading: 'Shopping', markdown: '- tomato' },
    ]);

    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual(['Section not found: Shopping']);
    expect(result.markdown).toBe(recipeMarkdown);
  });
});
