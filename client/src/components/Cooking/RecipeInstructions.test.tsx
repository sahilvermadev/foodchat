import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import type { StructuredRecipe } from 'librechat-data-provider';
import RecipeInstructions, { hasDisplayableInstructions } from './RecipeInstructions';

const mockAlarm = jest.fn();

jest.mock('./timerAlarm', () => ({
  playTimerCompleteAlarm: () => mockAlarm(),
  prepareTimerAlarm: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) => {
    const labels: Record<string, string> = {
      com_recipe_back_to_timer_step: 'Return to timer step',
      com_recipe_instructions: 'Instructions',
      com_recipe_pause_timer: 'Pause {{timer}}',
      com_recipe_reset_timer: 'Reset {{timer}}',
      com_recipe_restart_short: 'Restart',
      com_recipe_start_short: 'Start',
      com_recipe_start_timer: 'Start {{timer}}',
      com_recipe_tip: 'Tip',
    };
    return (labels[key] ?? key).replace('{{timer}}', values?.timer ?? '');
  },
}));

const recipe: StructuredRecipe = {
  title: 'Chicken',
  description: '',
  servings: 4,
  timing: { prepMinutes: 20, cookMinutes: 30, totalMinutes: 50 },
  ingredients: [],
  notes: [],
  tags: [],
  steps: [
    {
      id: 'rest-step',
      ingredientIds: [],
      order: 1,
      text: 'Mix the chicken and rest it at room temperature.',
      timers: [{ id: 'rest-timer', durationSeconds: 2, label: 'Rest chicken' }],
      tips: ['Keep the bowl covered.'],
      warnings: [],
    },
    {
      id: 'grill-step',
      ingredientIds: [],
      order: 2,
      text: 'Grill until charred and cooked through.',
      timers: [],
      tips: [],
      warnings: ['Check that the chicken is fully cooked.'],
    },
  ],
};

describe('RecipeInstructions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-28T10:00:00.000Z'));
    mockAlarm.mockClear();
  });

  afterEach(() => jest.useRealTimers());

  test('rejects placeholder steps so legacy Markdown instructions remain available', () => {
    expect(
      hasDisplayableInstructions({
        ...recipe,
        steps: [{ ...recipe.steps[0], text: 'Prepare the recipe.' }],
      }),
    ).toBe(false);
  });

  test('places each timer with its instruction and has no detached Timers section', () => {
    render(<RecipeInstructions recipe={recipe} />);

    const step = screen.getByText(/Mix the chicken/).closest('li');
    expect(step).not.toBeNull();
    expect(within(step!).getByRole('button', { name: 'Start Rest chicken' })).toBeInTheDocument();
    expect(within(step!).getByText('Rest chicken')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Timers' })).not.toBeInTheDocument();
  });

  test('uses a wall-clock deadline, exposes the active dock, and persists completion', () => {
    const onWorkspaceChange = jest.fn();
    render(<RecipeInstructions recipe={recipe} onWorkspaceChange={onWorkspaceChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Rest chicken' }));

    expect(screen.getByRole('button', { name: 'Return to timer step' })).toBeInTheDocument();
    expect(onWorkspaceChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timers: [
          expect.objectContaining({
            endsAt: Date.parse('2026-07-28T10:00:02.000Z'),
            id: 'rest-timer',
            running: true,
          }),
        ],
      }),
    );

    act(() => {
      jest.setSystemTime(new Date('2026-07-28T10:00:02.100Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('Restart 0:02')).toBeInTheDocument();
    expect(mockAlarm).toHaveBeenCalledTimes(1);
    expect(onWorkspaceChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timers: [expect.objectContaining({ id: 'rest-timer', remaining: 0, running: false })],
      }),
    );
  });
});
