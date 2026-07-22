import { recipeReaderContent } from './content';

describe('recipe reader content', () => {
  test('extracts recipe data into metrics without losing surrounding prose', () => {
    const content = recipeReaderContent(`# Pizza

Long fermented and crisp.

## Recipe Data

| Field | Value |
| --- | --- |
| Yield | 4 pizzas |
| Prep time | 20 minutes |
| Rise time | 2 hours or overnight |

## Ingredients

- Flour`);

    expect(content.beforeMetrics).toContain('Long fermented and crisp.');
    expect(content.metrics).toEqual([
      { label: 'Yield', value: '4 pizzas' },
      { label: 'Prep time', value: '20 minutes' },
      { label: 'Rise time', value: '2 hours or overnight' },
    ]);
    expect(content.afterMetrics).toContain('## Ingredients');
  });

  test('leaves markdown intact when no recipe data table exists', () => {
    const markdown = '## Ingredients\n\n- Tomatoes';
    expect(recipeReaderContent(markdown)).toEqual({
      afterMetrics: '',
      beforeMetrics: markdown,
      metrics: [],
    });
  });
});
