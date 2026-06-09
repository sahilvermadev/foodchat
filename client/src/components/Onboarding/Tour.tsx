import React, { useState, useEffect } from 'react';
import { useAuthContext, useLocalize } from '~/hooks';

interface TourStep {
  target: string;
  titleKey: string;
  descKey: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'body',
    titleKey: 'com_tour_welcome_title',
    descKey: 'com_tour_welcome_desc',
    position: 'center',
  },
  {
    target: '[data-testid="text-input"]',
    titleKey: 'com_tour_crafting_title',
    descKey: 'com_tour_crafting_desc',
    position: 'top',
  },
  {
    target: '#side-nav-recipes',
    titleKey: 'com_tour_library_title',
    descKey: 'com_tour_library_desc',
    position: 'right',
  },
  {
    target: '#side-nav-preferences',
    titleKey: 'com_tour_preferences_title',
    descKey: 'com_tour_preferences_desc',
    position: 'right',
  },
];

export default function Tour() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
  const [visible, setVisible] = useState(false);

  const step = TOUR_STEPS[currentStepIdx];

  useEffect(() => {
    if (user && user.showTour) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  useEffect(() => {
    if (!visible || !step) return;

    if (step.position === 'center') {
      setHighlightStyle({ display: 'none' });
      return;
    }

    const element = document.querySelector(step.target);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = element.getBoundingClientRect();

      setHighlightStyle({
        top: rect.top + window.scrollY - 8,
        left: rect.left + window.scrollX - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
        borderRadius: '12px',
        position: 'absolute',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
      });
    } else {
      setHighlightStyle({ display: 'none' });
    }
  }, [currentStepIdx, visible, step]);

  const handleNext = () => {
    if (currentStepIdx < TOUR_STEPS.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx((prev) => prev - 1);
    }
  };

  const handleSkip = () => handleComplete();

  const handleComplete = async () => {
    setVisible(false);
    try {
      await fetch('/api/user/tour-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      console.error('Failed to complete onboarding tour:', err);
    }
  };

  if (!visible || !step) return null;

  return (
    <>
      {step.position !== 'center' && (
        <div
          style={highlightStyle}
          className="pointer-events-none ring-2 ring-primary/80 transition-all duration-300"
        />
      )}
      {step.position === 'center' && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
      )}

      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div className="animate-slide-down pointer-events-auto w-full max-w-sm scale-100 transform rounded-2xl border border-white/10 bg-white/80 p-6 shadow-2xl backdrop-blur-xl transition-all dark:border-white/5 dark:bg-zinc-900/80">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              {localize('com_cooking_step_progress', {
                0: currentStepIdx + 1,
                1: TOUR_STEPS.length,
              })}
            </span>
            <button
              onClick={handleSkip}
              className="text-xs text-text-secondary transition-colors hover:text-text-primary focus:outline-none"
            >
              {localize('com_ui_skip')}
            </button>
          </div>

          <h3 className="mb-2 text-base font-semibold leading-snug text-text-primary">
            {localize(step.titleKey as any)}
          </h3>
          <p className="mb-6 text-xs leading-relaxed text-text-secondary">
            {localize(step.descKey as any)}
          </p>

          <div className="flex items-center justify-between">
            <button
              disabled={currentStepIdx === 0}
              onClick={handleBack}
              className="border-border-medium/30 rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-all hover:bg-surface-secondary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {localize('com_ui_back')}
            </button>
            <button
              onClick={handleNext}
              className="hover:bg-primary-hover rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-primary/20 transition-all"
            >
              {currentStepIdx === TOUR_STEPS.length - 1
                ? localize('com_tour_get_cooking')
                : localize('com_ui_next')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
