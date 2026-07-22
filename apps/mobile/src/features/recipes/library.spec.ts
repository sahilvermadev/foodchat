/// <reference types="jest" />

import type { RecipeSummary } from './types';
import { buildFilterGroups, buildLibraryFilters, displayFilter, getLibraryState } from './library';

const recipe = (overrides: Partial<RecipeSummary> = {}): RecipeSummary => ({
  _id: 'recipe-1',
  title: 'Dal',
  documentType: 'recipe',
  illustrationStatus: 'complete',
  saveList: 'want_to_cook',
  updatedAt: '2026-07-19T00:00:00.000Z',
  ...overrides,
});

describe('recipe library', () => {
  it('builds the website-equivalent API filters', () => {
    expect(
      buildLibraryFilters('  pasta  ', 'cooked_already', {
        documentType: 'recipe',
        cuisine: 'italian',
        mealType: 'dinner',
        diet: 'vegetarian',
        timeBucket: 'under_30',
        mainIngredient: 'tomato',
        equipment: 'oven',
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
    });
    expect(buildLibraryFilters('', 'all', {})).toEqual({});
  });

  it('derives unique advanced options from cookbook recipes', () => {
    const groups = buildFilterGroups([
      recipe({
        categorization: {
          cuisine: ['indian'],
          mealType: ['dinner'],
          diet: ['vegetarian'],
          timeBucket: 'under_30',
          mainIngredients: ['lentils'],
          equipment: ['pressure cooker'],
        },
      }),
      recipe({ _id: 'recipe-2', documentType: 'guide', categorization: { cuisine: ['indian'] } }),
    ]);

    expect(groups.find((group) => group.key === 'documentType')?.values).toEqual([
      'guide',
      'recipe',
    ]);
    expect(groups.find((group) => group.key === 'cuisine')?.values).toEqual(['indian']);
    expect(groups.find((group) => group.key === 'equipment')?.values).toEqual(['pressure cooker']);
    expect(displayFilter('under_30')).toBe('Under 30');
  });

  it('distinguishes an empty cookbook from an empty filtered result', () => {
    expect(getLibraryState({ hasActiveQuery: false, recipeCount: 0 })).toBe('empty');
    expect(getLibraryState({ hasActiveQuery: true, recipeCount: 0 })).toBe('no_matches');
    expect(getLibraryState({ hasActiveQuery: true, recipeCount: 2 })).toBe('results');
  });
});
