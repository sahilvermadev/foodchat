import { visibleRecipeMetrics } from './metric';

describe('visibleRecipeMetrics', () => {
  it('omits unknown zero timing instead of presenting it as recipe guidance', () => {
    expect(
      visibleRecipeMetrics([
        { label: 'Prep time', value: '0 minutes' },
        { label: 'Cook time', value: '25 minutes' },
        { label: 'Total time', value: '25 minutes' },
      ]),
    ).toEqual([
      { label: 'Cook time', value: '25 minutes' },
      { label: 'Total time', value: '25 minutes' },
    ]);
  });

  it('continues to hide yield metrics handled by ingredient scaling', () => {
    expect(visibleRecipeMetrics([{ label: 'Yield', value: '12 rolls' }])).toEqual([]);
  });
});
