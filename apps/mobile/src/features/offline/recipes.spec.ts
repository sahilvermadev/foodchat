import type { RecipeSummary } from '@/features/recipes/types';
import { matchesOfflineRecipe, sortOfflineRecipes } from './filter';

const recipe = (patch: Partial<RecipeSummary> = {}): RecipeSummary => ({
  _id: patch._id ?? 'recipe-1',
  collections: [],
  documentType: 'recipe',
  favorite: false,
  illustrationStatus: 'complete',
  pinned: false,
  saveList: 'want_to_cook',
  title: 'Lemon pudding cake',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
});

describe('offline cookbook parity', () => {
  test('uses OR semantics within a multi-select filter', () => {
    expect(
      matchesOfflineRecipe(recipe({ categorization: { cuisine: ['American'] } }), {
        cuisine: 'american,indian',
      }),
    ).toBe(true);
  });

  test('searches complete recipe markdown', () => {
    expect(matchesOfflineRecipe(recipe(), { q: 'buttermilk' }, 'Use cold buttermilk.')).toBe(true);
  });

  test('honors title and quickest sorting while keeping pins first', () => {
    const recipes = [
      recipe({ _id: 'slow', title: 'Ziti', totalMinutes: 90 }),
      recipe({ _id: 'fast', title: 'Apple salad', totalMinutes: 10 }),
      recipe({ _id: 'pin', pinned: true, title: 'Soup', totalMinutes: 30 }),
    ];
    expect(sortOfflineRecipes(recipes, 'quickest').map((item) => item._id)).toEqual([
      'pin',
      'fast',
      'slow',
    ]);
    expect(sortOfflineRecipes(recipes, 'title').map((item) => item._id)).toEqual([
      'pin',
      'fast',
      'slow',
    ]);
  });
});
