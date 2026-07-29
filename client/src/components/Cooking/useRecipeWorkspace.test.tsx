import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { RecipeWorkspaceState } from 'librechat-data-provider';
import useRecipeWorkspace from './useRecipeWorkspace';

const initial: RecipeWorkspaceState = {
  checkedIngredientIds: [],
  servings: 4,
  timers: [],
  unitMode: 'original',
  updatedAt: '2026-07-28T09:00:00.000Z',
};
const startTimerLabel = 'Start timer';
const checkIngredientLabel = 'Check ingredient';

function WorkspaceHarness({ persist }: { persist: jest.Mock }) {
  const [state, update] = useRecipeWorkspace(initial, persist);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          update({
            checkedIngredientIds: state?.checkedIngredientIds ?? [],
            servings: state?.servings ?? 4,
            timers: [
              {
                id: 'timer-1',
                label: 'Rest',
                remaining: 1200,
                running: true,
              },
            ],
            unitMode: state?.unitMode ?? 'original',
          })
        }
      >
        {startTimerLabel}
      </button>
      <button
        type="button"
        onClick={() =>
          update({
            checkedIngredientIds: ['ingredient-1'],
            servings: state?.servings ?? 4,
            timers: state?.timers ?? [],
            unitMode: state?.unitMode ?? 'original',
          })
        }
      >
        {checkIngredientLabel}
      </button>
    </>
  );
}

describe('useRecipeWorkspace', () => {
  test('keeps an optimistic timer when another workspace control updates immediately afterward', async () => {
    const persist = jest.fn();
    render(<WorkspaceHarness persist={persist} />);

    fireEvent.click(screen.getByRole('button', { name: startTimerLabel }));
    fireEvent.click(screen.getByRole('button', { name: checkIngredientLabel }));

    await waitFor(() =>
      expect(persist).toHaveBeenLastCalledWith(
        expect.objectContaining({
          checkedIngredientIds: ['ingredient-1'],
          timers: [expect.objectContaining({ id: 'timer-1', running: true })],
        }),
      ),
    );
  });

  test('coalesces changes and never persists two workspace states concurrently', async () => {
    let resolveFirst: (() => void) | undefined;
    const persist = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(undefined);
    render(<WorkspaceHarness persist={persist} />);

    fireEvent.click(screen.getByRole('button', { name: startTimerLabel }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: checkIngredientLabel }));

    expect(persist).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        checkedIngredientIds: ['ingredient-1'],
        timers: [expect.objectContaining({ id: 'timer-1', running: true })],
      }),
    );
  });
});
