import { isRecipeCategorizationActive } from './library';

describe('recipe library status', () => {
  test.each(['pending', 'processing'] as const)('keeps categorization active for %s', (status) => {
    expect(isRecipeCategorizationActive(status)).toBe(true);
  });

  test.each(['complete', 'failed'] as const)('stops categorization activity for %s', (status) => {
    expect(isRecipeCategorizationActive(status)).toBe(false);
  });
});
