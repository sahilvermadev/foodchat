import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Switch } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lightbulb,
  Repeat,
  Save,
  StickyNote,
  Thermometer,
} from 'lucide-react';
import type { CookingTimer, Ingredient } from 'librechat-data-provider';
import {
  useCookingSessionQuery,
  useCompleteCookingSessionMutation,
  useAppendCookingSessionEventMutation,
} from '~/data-provider';
import useWakeLock from '~/hooks/useWakeLock';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type TimerRunState = {
  remainingSeconds: number;
  status: 'idle' | 'running' | 'completed';
  completedEventSent: boolean;
};

const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatIngredientQuantity = (ingredient: Ingredient) =>
  [ingredient.quantity, ingredient.unit].filter(Boolean).join(' ');

const formatIngredientText = (ingredient: Ingredient) => {
  const name = ingredient.item.trim();
  const preparation = ingredient.preparation?.trim();
  if (!name) {
    return ingredient.originalText;
  }
  return preparation ? `${name}, ${preparation}` : name;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
};

export default function CookingSession() {
  const { sessionId } = useParams();
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data: session, isLoading } = useCookingSessionQuery(sessionId);
  const appendEvent = useAppendCookingSessionEventMutation();
  const completeSession = useCompleteCookingSessionMutation();
  const [note, setNote] = useState('');
  const [substitution, setSubstitution] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [rating, setRating] = useState(5);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [timerStates, setTimerStates] = useState<Record<string, TimerRunState>>({});
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true);
  const completedTimerEventsRef = useRef<Set<string>>(new Set());
  const currentStepRef = useRef<HTMLElement | null>(null);
  const wakeLockSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof document !== 'undefined';

  useWakeLock(Boolean(sessionId && session && wakeLockEnabled && wakeLockSupported));

  const step = session?.recipeSnapshot.steps[session.currentStepIndex];
  const stepProgress =
    session && step
      ? localize('com_cooking_step_progress', {
          0: session.currentStepIndex + 1,
          1: session.recipeSnapshot.steps.length,
        })
      : '';

  const activeTimers = useMemo(() => step?.timers ?? [], [step?.timers]);
  const timerStatusLabel = (status: TimerRunState['status']) => {
    if (status === 'completed') {
      return localize('com_cooking_timer_done');
    }
    if (status === 'running') {
      return localize('com_cooking_timer_running');
    }
    return localize('com_cooking_timer_ready');
  };

  useEffect(() => {
    currentStepRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [session?.currentStepIndex]);

  const persistTimerCompleted = useCallback(
    (timer: CookingTimer) => {
      if (!sessionId || !session) {
        return;
      }

      appendEvent.mutate({
        sessionId,
        event: {
          type: 'timer',
          timerId: timer.id,
          action: 'completed',
          stepIndex: session.currentStepIndex,
          durationSeconds: timer.durationSeconds,
        },
      });
    },
    [appendEvent, session, sessionId],
  );

  useEffect(() => {
    if (activeTimers.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimerStates((current) => {
        let changed = false;
        const next = { ...current };

        for (const timer of activeTimers) {
          const timerState = next[timer.id];
          if (!timerState || timerState.status !== 'running') {
            continue;
          }

          changed = true;
          const remainingSeconds = timerState.remainingSeconds - 1;
          if (remainingSeconds <= 0) {
            next[timer.id] = {
              remainingSeconds: 0,
              status: 'completed',
              completedEventSent: false,
            };
          } else {
            next[timer.id] = { ...timerState, remainingSeconds };
          }
        }

        return changed ? next : current;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeTimers]);

  useEffect(() => {
    for (const timer of activeTimers) {
      const timerState = timerStates[timer.id];
      if (
        timerState?.status === 'completed' &&
        !timerState.completedEventSent &&
        !completedTimerEventsRef.current.has(timer.id)
      ) {
        completedTimerEventsRef.current.add(timer.id);
        persistTimerCompleted(timer);
        setTimerStates((current) => ({
          ...current,
          [timer.id]: { ...current[timer.id], completedEventSent: true },
        }));
      }
    }
  }, [activeTimers, persistTimerCompleted, timerStates]);

  const move = useCallback(
    (action: 'previous' | 'next' | 'repeat') => {
      if (!sessionId || !session) {
        return;
      }

      appendEvent.mutate({
        sessionId,
        event: { type: 'navigation', action, stepIndex: session.currentStepIndex },
      });
    },
    [appendEvent, session, sessionId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move('previous');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move('next');
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        move('repeat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  if (isLoading || !session || !sessionId || !step) {
    return <div className="p-6 text-text-secondary">{localize('com_ui_loading')}</div>;
  }

  const startTimer = (timer: CookingTimer) => {
    completedTimerEventsRef.current.delete(timer.id);
    setTimerStates((current) => ({
      ...current,
      [timer.id]: {
        remainingSeconds: timer.durationSeconds,
        status: 'running',
        completedEventSent: false,
      },
    }));

    appendEvent.mutate({
      sessionId,
      event: {
        type: 'timer',
        timerId: timer.id,
        action: 'started',
        stepIndex: session.currentStepIndex,
        durationSeconds: timer.durationSeconds,
      },
    });
  };

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    appendEvent.mutate({
      sessionId,
      event: { type: 'note', stepIndex: session.currentStepIndex, text },
    });
    setNote('');
  };

  const addSubstitution = () => {
    const text = substitution.trim();
    if (!text) return;
    appendEvent.mutate({
      sessionId,
      event: { type: 'substitution', stepIndex: session.currentStepIndex, text },
    });
    setSubstitution('');
  };

  const finish = () => {
    completeSession.mutate(
      { sessionId, payload: { rating, note: reviewNote } },
      {
        onSuccess: () => navigate('/cook'),
      },
    );
  };

  const timerCompletionMessage = activeTimers
    .filter((timer) => timerStates[timer.id]?.status === 'completed')
    .map((timer) => localize('com_cooking_timer_completed', { 0: timer.label }))
    .join(' ');

  return (
    <main className="rekky-ui min-h-full bg-surface-primary pb-24 text-text-primary md:pb-0">
      <header className="bg-surface-primary/95 sticky top-0 z-10 border-b border-border-light px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="rekky-meta text-text-secondary">{stepProgress}</p>
            <h1 className="truncate font-serif text-base font-semibold sm:text-lg">
              {session.recipeSnapshot.title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <Switch
                checked={wakeLockEnabled && wakeLockSupported}
                disabled={!wakeLockSupported}
                onCheckedChange={setWakeLockEnabled}
                aria-label={localize('com_cooking_wake_lock')}
              />
              <span className="hidden sm:inline">
                {wakeLockSupported
                  ? localize('com_cooking_wake_lock')
                  : localize('com_cooking_wake_lock_unsupported')}
              </span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={finish}
              aria-label={localize('com_cooking_finish')}
              className="gap-2"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{localize('com_cooking_finish')}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-live="polite" className="space-y-4">
          <div className="rounded-lg border border-border-light bg-surface-secondary p-5 shadow-sm sm:p-7">
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-text-primary"
                style={{
                  width: `${((session.currentStepIndex + 1) / session.recipeSnapshot.steps.length) * 100}%`,
                }}
              />
            </div>

            <p className="rekky-meta mb-3 text-text-secondary">
              {localize('com_cooking_step_number', { 0: step.order })}
            </p>
            <p className="rekky-body text-3xl font-semibold leading-tight sm:text-4xl">
              {step.text}
            </p>

            {(step.temperature || step.warnings.length > 0 || step.tips.length > 0) && (
              <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                {step.temperature && (
                  <div className="flex gap-2 rounded-md border border-border-light bg-surface-primary p-3">
                    <Thermometer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {step.temperature.appliance ? `${step.temperature.appliance}: ` : ''}
                      {step.temperature.value}°{step.temperature.unit}
                    </span>
                  </div>
                )}
                {step.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-2 rounded-md border border-border-light bg-surface-primary p-3 text-text-primary"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{warning}</span>
                  </div>
                ))}
                {step.tips.map((tip) => (
                  <div
                    key={tip}
                    className="flex gap-2 rounded-md border border-border-light bg-surface-primary p-3 text-text-secondary"
                  >
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTimers.length > 0 && (
              <div className="mt-7 space-y-3" aria-live="polite">
                <h2 className="rekky-section-title text-text-primary">
                  {localize('com_cooking_timers')}
                </h2>
                {activeTimers.map((timer) => {
                  const timerState = timerStates[timer.id];
                  const status = timerState?.status ?? 'idle';
                  const remainingSeconds = timerState?.remainingSeconds ?? timer.durationSeconds;

                  return (
                    <div
                      key={timer.id}
                      className="flex flex-col gap-3 rounded-md border border-border-light bg-surface-primary p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                          <span>{timer.label}</span>
                        </div>
                        <p className="rekky-timer mt-1 text-2xl font-bold">
                          {formatTimer(remainingSeconds)}
                        </p>
                        <p className="rekky-meta text-text-secondary">{timerStatusLabel(status)}</p>
                      </div>
                      <Button
                        type="button"
                        variant={status === 'completed' ? 'secondary' : 'outline'}
                        onClick={() => startTimer(timer)}
                        aria-label={localize('com_cooking_start_timer', { 0: timer.label })}
                        className="h-12 justify-center"
                      >
                        {status === 'completed'
                          ? localize('com_cooking_restart_timer')
                          : localize('com_cooking_start_timer_short')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <p aria-live="assertive" className="sr-only">
              {timerCompletionMessage}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <section className="rounded-lg border border-border-light bg-surface-secondary p-4">
              <h2 className="rekky-section-title text-text-primary">
                {localize('com_cooking_ingredients')}
              </h2>
              <div className="mt-3 space-y-2">
                {session.recipeSnapshot.ingredients.map((ingredient) => {
                  const checked = checkedIngredients[ingredient.id] ?? false;
                  const quantity = formatIngredientQuantity(ingredient);
                  return (
                    <label
                      key={ingredient.id}
                      className={cn(
                        'rekky-ingredient-check grid grid-cols-[minmax(4.25rem,auto)_minmax(0,1fr)] gap-3 rounded-md border border-border-light bg-surface-primary p-2 text-sm',
                        checked && 'is-completed',
                      )}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setCheckedIngredients((current) => ({
                              ...current,
                              [ingredient.id]: event.target.checked,
                            }))
                          }
                          className="mt-1"
                          aria-label={ingredient.originalText}
                        />
                        <span className="rekky-quantity font-bold text-text-primary">
                          {quantity || '-'}
                        </span>
                      </span>
                      <span className="rekky-ingredient-text rekky-body text-sm leading-6 text-text-secondary">
                        {formatIngredientText(ingredient)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-border-light bg-surface-secondary p-4">
              <h2 className="rekky-section-title text-text-primary">
                {localize('com_cooking_steps')}
              </h2>
              <div className="mt-3 space-y-3">
                {session.recipeSnapshot.steps.map((recipeStep, index) => {
                  const isCurrent = index === session.currentStepIndex;
                  return (
                    <article
                      key={recipeStep.id}
                      ref={isCurrent ? currentStepRef : undefined}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'rekky-cooking-step rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm',
                        isCurrent && 'is-current',
                      )}
                    >
                      <p
                        className={cn(
                          'rekky-meta text-text-secondary',
                          isCurrent && 'text-sm text-surface-submit',
                        )}
                      >
                        {localize('com_cooking_step_number', { 0: recipeStep.order })}
                      </p>
                      <p
                        className={
                          isCurrent
                            ? 'rekky-body mt-2 text-lg font-semibold leading-7'
                            : 'rekky-body mt-2 text-sm leading-6 text-text-secondary'
                        }
                      >
                        {isCurrent ? `${localize('com_cooking_current_step')}: ` : ''}
                        {recipeStep.text}
                      </p>
                      {recipeStep.timers.length > 0 && (
                        <div className="rekky-meta mt-3 flex flex-wrap gap-2 text-text-secondary">
                          {recipeStep.timers.map((timer) => (
                            <span
                              key={timer.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border-light px-2 py-1"
                            >
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {timer.label} - {formatTimer(timer.durationSeconds)}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Button
              type="button"
              variant="outline"
              onClick={() => move('previous')}
              aria-label={localize('com_cooking_previous_step')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => move('repeat')}
              aria-label={localize('com_cooking_repeat_step')}
            >
              <Repeat className="h-4 w-4" aria-hidden="true" />
              {localize('com_cooking_repeat')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => move('next')}
              aria-label={localize('com_cooking_next_step')}
            >
              {localize('com_ui_next')}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <label htmlFor="cooking-note" className="text-sm font-medium">
              {localize('com_cooking_add_note')}
            </label>
            <textarea
              id="cooking-note"
              aria-label={localize('com_cooking_add_note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 min-h-24 w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addNote}
              aria-label={localize('com_cooking_save_note')}
              className="mt-2"
            >
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_save')}
            </Button>
          </div>

          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <label htmlFor="cooking-substitution" className="text-sm font-medium">
              {localize('com_cooking_substitution')}
            </label>
            <textarea
              id="cooking-substitution"
              aria-label={localize('com_cooking_substitution')}
              value={substitution}
              onChange={(event) => setSubstitution(event.target.value)}
              className="mt-2 min-h-24 w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addSubstitution}
              aria-label={localize('com_cooking_record_substitution')}
              className="mt-2"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {localize('com_cooking_record')}
            </Button>
          </div>

          <div className="rounded-lg border border-border-light bg-surface-secondary p-4">
            <label htmlFor="cooking-rating" className="text-sm font-medium">
              {localize('com_cooking_finish_note')}
            </label>
            <input
              id="cooking-rating"
              aria-label={localize('com_cooking_rating')}
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              className="mt-2 w-20 rounded-md border border-border-light bg-surface-primary px-2 py-1"
            />
            <textarea
              aria-label={localize('com_cooking_finish_note')}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              className="mt-2 min-h-24 w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
            />
            <Button
              type="button"
              variant="submit"
              onClick={finish}
              aria-label={localize('com_cooking_finish')}
              className="mt-2"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {localize('com_cooking_finish')}
            </Button>
          </div>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 gap-2 border-t border-border-light bg-surface-primary p-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          onClick={() => move('previous')}
          aria-label={localize('com_cooking_previous_step')}
          className="h-14"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          {localize('com_ui_prev')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => move('repeat')}
          aria-label={localize('com_cooking_repeat_step')}
          className="h-14"
        >
          <Repeat className="h-5 w-5" aria-hidden="true" />
          {localize('com_cooking_repeat')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => move('next')}
          aria-label={localize('com_cooking_next_step')}
          className="h-14"
        >
          {localize('com_ui_next')}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </nav>
    </main>
  );
}
