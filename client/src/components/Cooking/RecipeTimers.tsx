import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw } from 'lucide-react';
import type {
  CookingTimer,
  RecipeWorkspaceState,
  RecipeWorkspaceTimer,
  StructuredRecipe,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { playTimerCompleteAlarm, prepareTimerAlarm } from './timerAlarm';

export type RecipeTimerView = {
  completed: boolean;
  definition: CookingTimer;
  remaining: number;
  running: boolean;
  started: boolean;
};

const remainingSeconds = (timer: RecipeWorkspaceTimer, now = Date.now()) =>
  timer.running && timer.endsAt
    ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
    : timer.remaining;

export const timerClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function timerDurationLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} hr`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return timerClock(seconds);
}

export function useRecipeTimers({
  onWorkspaceChange,
  recipe,
  workspaceState,
}: {
  onWorkspaceChange?(state: Omit<RecipeWorkspaceState, 'updatedAt'>): void;
  recipe: StructuredRecipe;
  workspaceState?: RecipeWorkspaceState;
}) {
  const [timers, setTimers] = useState<RecipeWorkspaceTimer[]>(workspaceState?.timers ?? []);
  const timersRef = useRef(timers);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!workspaceState?.updatedAt) return;
    timersRef.current = workspaceState.timers;
    setTimers(workspaceState.timers);
  }, [workspaceState?.timers, workspaceState?.updatedAt]);

  const persist = (next: RecipeWorkspaceTimer[]) => {
    timersRef.current = next;
    setTimers(next);
    onWorkspaceChange?.({
      checkedIngredientIds: workspaceState?.checkedIngredientIds ?? [],
      servings: workspaceState?.servings ?? recipe.servings,
      timers: next,
      unitMode: workspaceState?.unitMode ?? 'original',
    });
  };

  const running = timers.some((timer) => timer.running && remainingSeconds(timer, now) > 0);
  useEffect(() => {
    if (!running) return undefined;
    const sync = () => setNow(Date.now());
    const interval = window.setInterval(sync, 500);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running]);

  useEffect(() => {
    const expired = timers.filter(
      (timer) => timer.running && timer.endsAt && remainingSeconds(timer, now) === 0,
    );
    if (!expired.length) return;
    const expiredIds = new Set(expired.map((timer) => timer.id));
    const next = timers.map((timer) =>
      expiredIds.has(timer.id)
        ? { ...timer, endsAt: undefined, remaining: 0, running: false }
        : timer,
    );
    try {
      playTimerCompleteAlarm();
    } catch (error) {
      console.error('Timer alarm failed:', error);
    }
    persist(next);
  }, [now, timers]);

  const stateById = useMemo(() => new Map(timers.map((timer) => [timer.id, timer])), [timers]);

  const view = (definition: CookingTimer): RecipeTimerView => {
    const stored = stateById.get(definition.id);
    const remaining = stored ? remainingSeconds(stored, now) : definition.durationSeconds;
    return {
      completed: Boolean(stored && remaining === 0),
      definition,
      remaining,
      running: Boolean(stored?.running && remaining > 0),
      started: Boolean(stored),
    };
  };

  const toggle = (definition: CookingTimer) => {
    const current = view(definition);
    const nextRemaining = current.completed ? definition.durationSeconds : current.remaining;
    if (!current.running) prepareTimerAlarm();
    const nextTimer: RecipeWorkspaceTimer = current.running
      ? { id: definition.id, label: definition.label, remaining: current.remaining, running: false }
      : {
          endsAt: Date.now() + nextRemaining * 1000,
          id: definition.id,
          label: definition.label,
          remaining: nextRemaining,
          running: true,
        };
    persist([...timersRef.current.filter((timer) => timer.id !== definition.id), nextTimer]);
  };

  const reset = (definition: CookingTimer) =>
    persist([
      ...timersRef.current.filter((timer) => timer.id !== definition.id),
      {
        id: definition.id,
        label: definition.label,
        remaining: definition.durationSeconds,
        running: false,
      },
    ]);

  return { reset, toggle, view };
}

export function RecipeStepTimer({
  timer,
  timerView,
  onReset,
  onToggle,
}: {
  timer: CookingTimer;
  timerView: RecipeTimerView;
  onReset(): void;
  onToggle(): void;
}) {
  const localize = useLocalize();
  const { completed, remaining, running, started } = timerView;
  const duration = timerDurationLabel(timer.durationSeconds);
  const buttonText = running
    ? timerClock(remaining)
    : completed
      ? `${localize('com_recipe_restart_short')} ${duration}`
      : `${localize('com_recipe_start_short')} ${duration}`;
  const showLabel = timer.label.trim().toLowerCase() !== duration.toLowerCase();

  return (
    <div className="flex min-h-11 w-full max-w-full items-center rounded-control border border-border-light bg-surface-primary-alt sm:w-auto">
      <button
        type="button"
        onClick={onToggle}
        aria-label={localize(running ? 'com_recipe_pause_timer' : 'com_recipe_start_timer', {
          timer: timer.label,
        })}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px ${
          running
            ? 'bg-status-caution/10 text-status-caution'
            : completed
              ? 'bg-status-success/10 text-status-success'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        {running ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : completed ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
        <span className="whitespace-nowrap tabular-nums">{buttonText}</span>
      </button>
      {showLabel ? (
        <span className="min-w-0 flex-1 truncate px-2 text-xs text-text-secondary sm:max-w-48 sm:flex-none">
          {timer.label}
        </span>
      ) : null}
      {started ? (
        <button
          type="button"
          onClick={onReset}
          aria-label={localize('com_recipe_reset_timer', { timer: timer.label })}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
