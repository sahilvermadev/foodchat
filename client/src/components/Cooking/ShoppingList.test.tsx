import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { ShoppingList } from 'librechat-data-provider';
import ShoppingListScreen from './ShoppingList';

const mockUpdateItem = jest.fn();

const mockList: ShoppingList = {
  _id: 'shopping-list-1',
  name: 'Shopping list',
  items: [
    {
      id: 'item-1',
      canonicalName: 'olive oil',
      displayName: 'olive oil',
      quantity: 3,
      unit: 'tbsp',
      category: 'pantry',
      categoryOverride: false,
      purchased: false,
      optional: false,
      pantry: false,
      contributions: [
        {
          id: 'recipe:recipe-1:oil',
          kind: 'recipe',
          ingredientId: 'oil',
          optional: false,
          quantity: 1,
          recipeId: 'recipe-1',
          recipeTitle: 'Hummus',
          servings: 4,
          unit: 'tbsp',
        },
        {
          id: 'recipe:recipe-2:oil',
          kind: 'recipe',
          ingredientId: 'oil',
          optional: false,
          quantity: 2,
          recipeId: 'recipe-2',
          recipeTitle: 'Salad',
          servings: 2,
          unit: 'tbsp',
        },
      ],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

jest.mock('~/data-provider', () => ({
  useAddShoppingItemsMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useClearPurchasedShoppingItemsMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useDeleteShoppingContributionMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useDeleteShoppingItemMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useMergeShoppingItemsMutation: () => ({ isLoading: false, mutate: jest.fn() }),
  useShoppingListQuery: () => ({ data: mockList, isError: false, isLoading: false }),
  useUpdateShoppingItemMutation: () => ({ isLoading: false, mutate: mockUpdateItem }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    `${key}${values ? `:${Object.values(values).join(':')}` : ''}`,
}));

describe('ShoppingList', () => {
  it('shows every contributing recipe and updates purchased state', () => {
    render(<ShoppingListScreen />);

    expect(screen.getByRole('heading', { name: 'com_shopping_title' })).toHaveClass(
      'text-[1.9rem]',
      'sm:text-[2.5rem]',
    );
    expect(screen.getByRole('main')).toHaveClass('rekky-ui', 'bg-surface-primary-alt');
    fireEvent.click(screen.getByText('com_shopping_for_recipes:1:Hummus'));
    expect(screen.getByText('com_shopping_required_amount:1 tbsp:Hummus')).toBeInTheDocument();
    expect(screen.getByText('com_shopping_required_amount:2 tbsp:Salad')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_shopping_mark_purchased:olive oil' }));
    expect(mockUpdateItem).toHaveBeenCalledWith({
      itemId: 'item-1',
      patch: { purchased: true },
    });
  });
});
