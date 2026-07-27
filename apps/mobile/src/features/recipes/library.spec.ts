/// <reference types="jest" />

import { buildFilterGroups, buildLibraryFilters, displayFilter, getLibraryState } from './library';

describe('recipe library', () => {
  it('builds the website-equivalent API filters', () => {
    expect(
      buildLibraryFilters('  pasta  ', 'cooked_already', {
        documentType: ['recipe'],
        cuisine: ['italian'],
        mealType: ['dinner'],
        diet: ['vegetarian'],
        timeBucket: ['under_30'],
        mainIngredient: ['tomato'],
        equipment: ['oven'],
      }),
    ).toEqual({
      q: 'pasta',
      saveList: 'cooked_already',
      documentType: 'recipe',
      cuisine: 'italian',
      mealType: 'dinner',
      diet: 'vegetarian',
      timeBucket: 'under_30',
      mainIngredient: 'tomato',
      equipment: 'oven',
      sort: 'recently_updated',
    });
    expect(buildLibraryFilters('', 'all', {})).toEqual({ sort: 'recently_updated' });
  });

  it('derives unique advanced options from cookbook recipes', () => {
    const groups = buildFilterGroups({
      total: 2,
      documentType: [
        { value: 'guide', count: 1 },
        { value: 'recipe', count: 1 },
      ],
      cuisine: [{ value: 'indian', count: 2 }],
      mealType: [{ value: 'dinner', count: 1 }],
      diet: [{ value: 'vegetarian', count: 1 }],
      difficulty: [],
      timeBucket: [{ value: 'under_30', count: 1 }],
      mainIngredient: [{ value: 'lentils', count: 1 }],
      equipment: [{ value: 'pressure cooker', count: 1 }],
      collection: [],
    });

    expect(groups.find((group) => group.key === 'documentType')?.values).toEqual([
      { value: 'guide', count: 1 },
      { value: 'recipe', count: 1 },
    ]);
    expect(groups.find((group) => group.key === 'cuisine')?.values).toEqual([
      { value: 'indian', count: 2 },
    ]);
    expect(groups.find((group) => group.key === 'equipment')?.values).toEqual([
      { value: 'pressure cooker', count: 1 },
    ]);
    expect(displayFilter('under_30')).toBe('Under 30');
  });

  it('distinguishes an empty cookbook from an empty filtered result', () => {
    expect(getLibraryState({ hasActiveQuery: false, recipeCount: 0 })).toBe('empty');
    expect(getLibraryState({ hasActiveQuery: true, recipeCount: 0 })).toBe('no_matches');
    expect(getLibraryState({ hasActiveQuery: true, recipeCount: 2 })).toBe('results');
  });
});
