import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CookingSession from './Session';

const mockAppendMutate = jest.fn();
const mockCompleteMutate = jest.fn();
const mockNavigate = jest.fn();
const mockUseWakeLock = jest.fn();

const mockSession = {
  _id: 'session-1',
  user: 'user-1',
  status: 'active',
  currentStepIndex: 1,
  recipeSnapshot: {
    title: 'Weeknight Lentils',
    description: 'A simple dinner',
    servings: 4,
    timing: { prepMinutes: 10, cookMinutes: 30, totalMinutes: 40 },
    ingredients: [],
    notes: [],
    tags: [],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Rinse the lentils.',
        ingredientIds: [],
        timers: [],
        warnings: [],
        tips: [],
      },
      {
        id: 'step-2',
        order: 2,
        text: 'Simmer until tender and creamy.',
        ingredientIds: [],
        timers: [{ id: 'timer-1', label: 'Simmer lentils', durationSeconds: 3 }],
        temperature: { value: 190, unit: 'F', appliance: 'Pot' },
        warnings: ['Stir occasionally so the bottom does not catch.'],
        tips: ['Use a heavy pot if you have one.'],
      },
    ],
  },
  summary: { notes: [], substitutions: [], problems: [] },
  startedAt: '2026-05-14T00:00:00.000Z',
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
};

const mockLabels: Record<string, string> = {
  com_cooking_add_note: 'Add Note',
  com_cooking_finish: 'Finish',
  com_cooking_finish_note: 'Post-cook Review',
  com_cooking_next_step: 'Next step',
  com_cooking_previous_step: 'Previous step',
  com_cooking_rating: 'Rating',
  com_cooking_record: 'Record',
  com_cooking_record_substitution: 'Record substitution',
  com_cooking_repeat: 'Repeat',
  com_cooking_repeat_step: 'Repeat current step',
  com_cooking_restart_timer: 'Restart',
  com_cooking_save_note: 'Save note',
  com_cooking_start_timer: 'Start {{0}} timer',
  com_cooking_start_timer_short: 'Start',
  com_cooking_step_number: 'Step {{0}}',
  com_cooking_step_progress: 'Step {{0}} of {{1}}',
  com_cooking_substitution: 'Record Substitution',
  com_cooking_timer_completed: '{{0}} timer complete',
  com_cooking_timer_done: 'Complete',
  com_cooking_timer_ready: 'Ready',
  com_cooking_timer_running: 'Running',
  com_cooking_timers: 'Timers',
  com_cooking_wake_lock: 'Keep screen awake',
  com_cooking_wake_lock_unsupported: 'Screen wake lock unavailable',
  com_ui_loading: 'Loading',
  com_ui_next: 'Next',
  com_ui_prev: 'Prev',
  com_ui_save: 'Save',
};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ sessionId: 'session-1' }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }) => (
    <button {...props}>{children}</button>
  ),
  Switch: ({ checked, onCheckedChange, ...props }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) => {
    let value = mockLabels[key] ?? key;
    if (options) {
      Object.entries(options).forEach(([placeholder, replacement]) => {
        value = value.replace(`{{${placeholder}}}`, String(replacement));
      });
    }
    return value;
  },
}));

jest.mock('~/hooks/useWakeLock', () => ({
  __esModule: true,
  default: (shouldHold: boolean) => mockUseWakeLock(shouldHold),
}));

jest.mock('~/data-provider', () => ({
  useCookingSessionQuery: () => ({ data: mockSession, isLoading: false }),
  useAppendCookingSessionEventMutation: () => ({ mutate: mockAppendMutate }),
  useCompleteCookingSessionMutation: () => ({ mutate: mockCompleteMutate }),
}));

const renderSession = () => render(<CookingSession />);

beforeEach(() => {
  jest.useRealTimers();
  mockAppendMutate.mockClear();
  mockCompleteMutate.mockClear();
  mockNavigate.mockClear();
  mockUseWakeLock.mockClear();
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: jest.fn() },
  });
});

describe('CookingSession', () => {
  it('renders the phone-first step player content with timers and side controls', () => {
    renderSession();

    expect(screen.getByText('Weeknight Lentils')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Simmer until tender and creamy.')).toBeInTheDocument();
    expect(screen.getByText('Pot: 190°F')).toBeInTheDocument();
    expect(screen.getByText('Stir occasionally so the bottom does not catch.')).toBeInTheDocument();
    expect(screen.getByText('Use a heavy pot if you have one.')).toBeInTheDocument();
    expect(screen.getByText('Simmer lentils')).toBeInTheDocument();
    expect(screen.getByLabelText('Add Note')).toBeInTheDocument();
    expect(screen.getByLabelText('Record Substitution')).toBeInTheDocument();
    expect(screen.getByLabelText('Rating')).toBeInTheDocument();
  });

  it('persists navigation events with the authenticated session id and current step context', () => {
    renderSession();

    fireEvent.click(screen.getAllByLabelText('Previous step')[0]);
    fireEvent.click(screen.getAllByLabelText('Next step')[0]);
    fireEvent.click(screen.getAllByLabelText('Repeat current step')[0]);

    expect(mockAppendMutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      event: { type: 'navigation', action: 'previous', stepIndex: 1 },
    });
    expect(mockAppendMutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      event: { type: 'navigation', action: 'next', stepIndex: 1 },
    });
    expect(mockAppendMutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      event: { type: 'navigation', action: 'repeat', stepIndex: 1 },
    });
  });

  it('supports keyboard shortcuts except while focus is inside form fields', () => {
    renderSession();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'r' });

    expect(mockAppendMutate).toHaveBeenCalledTimes(3);

    const noteInput = screen.getByLabelText('Add Note');
    fireEvent.keyDown(noteInput, { key: 'ArrowRight' });

    expect(mockAppendMutate).toHaveBeenCalledTimes(3);
  });

  it('starts a local countdown and persists a timer started event', () => {
    jest.useFakeTimers();
    renderSession();

    fireEvent.click(screen.getByLabelText('Start Simmer lentils timer'));

    expect(screen.getByText('0:03')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(mockAppendMutate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      event: {
        type: 'timer',
        timerId: 'timer-1',
        action: 'started',
        stepIndex: 1,
        durationSeconds: 3,
      },
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('0:02')).toBeInTheDocument();
  });

  it('announces timer completion and persists exactly one timer completed event', () => {
    jest.useFakeTimers();
    renderSession();

    fireEvent.click(screen.getByLabelText('Start Simmer lentils timer'));

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Simmer lentils timer complete')).toBeInTheDocument();
    expect(
      mockAppendMutate.mock.calls.filter(
        ([payload]) =>
          payload.event.type === 'timer' &&
          payload.event.timerId === 'timer-1' &&
          payload.event.action === 'completed',
      ),
    ).toHaveLength(1);
  });

  it('defaults wake lock on and lets the cook opt out', () => {
    renderSession();

    expect(mockUseWakeLock).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getAllByLabelText('Keep screen awake')[0]);

    expect(mockUseWakeLock).toHaveBeenLastCalledWith(false);
  });

  it('exposes accessible labels for controls', () => {
    renderSession();

    expect(screen.getAllByLabelText('Previous step')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Next step')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Repeat current step')).not.toHaveLength(0);
    expect(screen.getByLabelText('Start Simmer lentils timer')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Keep screen awake')).not.toHaveLength(0);
    expect(screen.getByLabelText('Add Note')).toBeInTheDocument();
    expect(screen.getByLabelText('Record Substitution')).toBeInTheDocument();
    expect(screen.getByLabelText('Rating')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Finish')).not.toHaveLength(0);
  });
});
