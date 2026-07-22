import type { PublicRecipeSummary } from '@/features/recipes/types';

export const exploreFixtures: PublicRecipeSummary[] = [
  {
    _id: 'fixture-ginger-noodles',
    author: { id: 'fixture-maya', name: 'Maya Chen', username: 'mayamakes' },
    categorization: { cuisine: ['Chinese'], mealType: ['Dinner'] },
    documentType: 'recipe',
    illustrationStatus: 'complete',
    illustrationUrl:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85',
    servings: 2,
    shortDescription: 'Silky noodles with ginger, scallions, and crisp sesame.',
    title: 'Ginger-Scallion Noodles',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    _id: 'fixture-jollof',
    author: { id: 'fixture-amara', name: 'Amara Okafor', username: 'amaracooks' },
    categorization: { cuisine: ['West African'], mealType: ['Dinner'] },
    documentType: 'recipe',
    illustrationStatus: 'complete',
    illustrationUrl:
      'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85',
    servings: 4,
    shortDescription: 'Smoky tomato rice finished with charred peppers and herbs.',
    title: 'Charred Tomato Jollof',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    _id: 'fixture-potato-tacos',
    author: { id: 'fixture-leo', name: 'Leo Martín', username: 'leoeats' },
    categorization: { cuisine: ['Mexican'], mealType: ['Dinner'] },
    documentType: 'recipe',
    illustrationStatus: 'complete',
    illustrationUrl:
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=900&q=85',
    servings: 3,
    shortDescription: 'Crackly potatoes, salsa verde, and soft corn tortillas.',
    title: 'Crispy Potato Tacos',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
  {
    _id: 'fixture-khichdi',
    author: { id: 'fixture-nadia', name: 'Nadia Rahman', username: 'nadiasupper' },
    categorization: { cuisine: ['Indian'], mealType: ['Dinner'] },
    documentType: 'recipe',
    illustrationStatus: 'complete',
    illustrationUrl:
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
    servings: 4,
    shortDescription: 'A soothing pot of rice, lentils, turmeric, and browned ghee.',
    title: 'Golden Lentil Khichdi',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
];

export function isExploreFixture(recipeId: string) {
  return recipeId.startsWith('fixture-');
}
