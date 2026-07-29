import type { Ingredient } from 'librechat-data-provider';
import { ingredientText, restoredTimerState, scaledYieldText } from './workspace-format';

const ingredient: Ingredient = {
  id: 'flour',
  item: 'flour',
  originalText: '2 cups flour',
  quantity: 2,
  quantityType: 'measured',
  unit: 'cups',
};

describe('ingredientText', () => {
  it('scales structured quantities with servings', () => {
    expect(ingredientText(ingredient, 1.5, 'original')).toBe('3 cups flour');
  });

  it('converts supported volume units without inventing ingredient densities', () => {
    expect(ingredientText(ingredient, 1, 'metric')).toBe('475 ml flour');
  });

  it('uses kitchen-friendly fractions when scaling original quantities', () => {
    expect(ingredientText(ingredient, 0.75, 'original')).toBe('1 1/2 cups flour');
  });

  it('preserves source text when no structured quantity is available', () => {
    expect(
      ingredientText(
        { ...ingredient, originalText: 'Salt to taste', quantity: undefined },
        2,
        'metric',
      ),
    ).toBe('Salt to taste');
  });

  it('separates common estimated amounts for a scannable ingredient column', () => {
    expect(
      ingredientText(
        {
          ...ingredient,
          item: 'red pepper flakes',
          originalText: 'pinch red pepper flakes',
          quantity: undefined,
        },
        1,
        'original',
      ),
    ).toBe('pinch red pepper flakes');
  });
});

describe('scaledYieldText', () => {
  it('preserves a descriptive published yield at its original scale', () => {
    expect(
      scaledYieldText({ baseServings: 24, currentServings: 24, yieldText: '24 meatballs' }),
    ).toBe('24 meatballs');
  });

  it('retains the published yield unit when ingredient quantities are scaled', () => {
    expect(
      scaledYieldText({ baseServings: 24, currentServings: 12, yieldText: '24 meatballs' }),
    ).toBe('12 meatballs');
  });

  it('updates a serves-style yield', () => {
    expect(scaledYieldText({ baseServings: 4, currentServings: 6, yieldText: 'Serves 4' })).toBe(
      'Serves 6',
    );
  });
});

describe('restoredTimerState', () => {
  it('restores a running timer from its deadline', () => {
    expect(
      restoredTimerState({ endsAt: 70_000, remaining: 60, running: true }, 60, 10_000),
    ).toEqual({ endsAt: 70_000, remaining: 60, running: true });
  });

  it('finishes an elapsed timer instead of restarting it', () => {
    expect(restoredTimerState({ endsAt: 9_000, remaining: 30, running: true }, 30, 10_000)).toEqual(
      { endsAt: undefined, remaining: 0, running: false },
    );
  });
});
