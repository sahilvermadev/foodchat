/* Hallmark · component: instructions · genre: editorial · theme: DESIGN.md · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import { useMemo, useRef } from 'react';
import { Timer, TriangleAlert } from 'lucide-react';
import type { RecipeWorkspaceState, StructuredRecipe } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { RecipeStepTimer, timerClock, useRecipeTimers } from './RecipeTimers';

const PLACEHOLDER_INSTRUCTION_PATTERN =
  /^(?:prepare|make|cook) (?:the )?recipe\.?$|^(?:follow|see) (?:the )?instructions\.?$/i;

export function isDisplayableInstruction(text: string): boolean {
  const value = text.trim();
  return value.length > 0 && !PLACEHOLDER_INSTRUCTION_PATTERN.test(value);
}

export function hasDisplayableInstructions(recipe?: StructuredRecipe | null): boolean {
  return Boolean(recipe?.steps.some((step) => isDisplayableInstruction(step.text)));
}

export default function RecipeInstructions({
  onWorkspaceChange,
  recipe,
  workspaceState,
}: {
  onWorkspaceChange?(state: Omit<RecipeWorkspaceState, 'updatedAt'>): void;
  recipe: StructuredRecipe;
  workspaceState?: RecipeWorkspaceState;
}) {
  const localize = useLocalize();
  const stepRefs = useRef(new Map<string, HTMLLIElement>());
  const steps = useMemo(
    () =>
      recipe.steps
        .filter((step) => isDisplayableInstruction(step.text))
        .sort((a, b) => a.order - b.order),
    [recipe.steps],
  );
  const timers = useRecipeTimers({ onWorkspaceChange, recipe, workspaceState });
  const active = steps
    .flatMap((step) => step.timers.map((timer) => ({ step, timer, view: timers.view(timer) })))
    .filter((item) => item.view.running);

  if (!steps.length) return null;

  const returnToStep = (stepId: string) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    stepRefs.current.get(stepId)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  return (
    <section className="mb-8" aria-labelledby="recipe-instructions-title">
      <h2 id="recipe-instructions-title" className="rekky-section-title text-text-primary">
        {localize('com_recipe_instructions')}
      </h2>

      {active.length ? (
        <button
          type="button"
          onClick={() => returnToStep(active[0].step.id)}
          className="border-status-caution/40 sticky top-4 z-sticky mt-4 flex min-h-11 w-full items-center gap-3 rounded-control border bg-surface-primary px-3 text-left shadow-floating transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          aria-label={localize('com_recipe_back_to_timer_step')}
        >
          <Timer className="size-4 shrink-0 text-status-caution" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {active[0].timer.label}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-status-caution">
            {timerClock(active[0].view.remaining)}
          </span>
          {active.length > 1 ? (
            <span className="text-xs text-text-secondary">+{active.length - 1}</span>
          ) : null}
        </button>
      ) : null}

      <ol className="mt-4 divide-y divide-border-light border-y border-border-light">
        {steps.map((step, index) => (
          <li
            key={step.id}
            ref={(node) => {
              if (node) stepRefs.current.set(step.id, node);
              else stepRefs.current.delete(step.id);
            }}
            className="grid scroll-m-24 grid-cols-[2rem_minmax(0,1fr)] gap-3 py-5"
          >
            <span
              className="flex size-8 items-center justify-center rounded-full border border-border-light font-mono text-xs font-semibold text-text-secondary"
              aria-hidden="true"
            >
              {step.order || index + 1}
            </span>
            <div className="min-w-0">
              <p className="rekky-body max-w-[68ch] text-[0.98rem] leading-7 text-text-primary">
                {step.text}
              </p>
              {step.warnings.map((warning) => (
                <p
                  key={warning}
                  className="mt-2 flex max-w-[68ch] items-start gap-2 text-sm leading-6 text-status-caution"
                >
                  <TriangleAlert className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{warning}</span>
                </p>
              ))}
              {step.tips.map((tip) => (
                <p key={tip} className="mt-2 max-w-[68ch] text-sm leading-6 text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {localize('com_recipe_tip')}:
                  </span>{' '}
                  {tip}
                </p>
              ))}
              {step.timers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {step.timers.map((timer) => (
                    <RecipeStepTimer
                      key={timer.id}
                      timer={timer}
                      timerView={timers.view(timer)}
                      onToggle={() => timers.toggle(timer)}
                      onReset={() => timers.reset(timer)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
