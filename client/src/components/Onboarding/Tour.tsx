import React, { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface TourStep {
  target: string;
  titleKey: string;
  descKey: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  route: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'body',
    titleKey: 'com_tour_welcome_title',
    descKey: 'com_tour_welcome_desc',
    position: 'center',
    route: '/cook',
  },
  {
    target: '#chat-input-container',
    titleKey: 'com_tour_crafting_title',
    descKey: 'com_tour_crafting_desc',
    position: 'top',
    route: '/cook',
  },
  {
    target: '#recipe-library-title',
    titleKey: 'com_tour_library_title',
    descKey: 'com_tour_library_desc',
    position: 'bottom',
    route: '/recipes',
  },
  {
    target: '#preferences-title',
    titleKey: 'com_tour_preferences_title',
    descKey: 'com_tour_preferences_desc',
    position: 'bottom',
    route: '/preferences',
  },
];

export default function Tour() {
  const [user, setUser] = useRecoilState(store.user);
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [visible, setVisible] = useState(false);

  const step = TOUR_STEPS[currentStepIdx];

  useEffect(() => {
    if (user && user.showTour) {
      setCurrentStepIdx(0);
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [user]);

  useEffect(() => {
    if (!visible || !step) return;

    // Trigger navigation if the current route doesn't match the step route
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      return;
    }

    let active = true;
    let retries = 0;
    const maxRetries = 20;

    const findAndPosition = () => {
      if (!active) return;
      const element = document.querySelector(step.target);

      if (step.position === 'center' || step.target === 'body') {
        setHighlightStyle({ display: 'none' });
        setTooltipStyle({
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
        });
        return;
      }

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
          if (!active) return;
          const rect = element.getBoundingClientRect();

          setHighlightStyle({
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
            borderRadius: '12px',
            pointerEvents: 'none',
            zIndex: 90,
            transition: 'all 0.2s ease-out',
          });

          const gap = 14;
          const tooltipWidth = 320;
          // Approximate height of the card to do bound positioning
          const tooltipHeight = 180;

          let top = 0;
          let left = 0;

          if (step.position === 'right') {
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.right + gap;
          } else if (step.position === 'left') {
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.left - tooltipWidth - gap;
          } else if (step.position === 'top') {
            top = rect.top - tooltipHeight - gap;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
          } else if (step.position === 'bottom') {
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
          }

          // Bound checking inside viewport
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          if (left < 16) left = 16;
          if (left + tooltipWidth > viewportWidth - 16) {
            left = viewportWidth - tooltipWidth - 16;
          }
          if (top < 16) top = 16;
          if (top + tooltipHeight > viewportHeight - 16) {
            top = Math.max(16, viewportHeight - tooltipHeight - 16);
          }

          setTooltipStyle({
            position: 'fixed',
            top,
            left,
            width: tooltipWidth,
            zIndex: 100,
            transition: 'all 0.2s ease-out',
          });
        }, 150);
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(findAndPosition, 100);
      } else {
        // Fallback to center
        setHighlightStyle({ display: 'none' });
        setTooltipStyle({
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
        });
      }
    };

    findAndPosition();
    window.addEventListener('resize', findAndPosition);
    return () => {
      active = false;
      window.removeEventListener('resize', findAndPosition);
    };
  }, [currentStepIdx, visible, step, location.pathname, navigate]);

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
    if (user) {
      setUser({ ...user, showTour: false });
    }
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

  const renderArrow = () => {
    if (step.position === 'center' || step.target === 'body') {
      return null;
    }

    const arrowClasses = {
      top: 'bottom-[-6px] left-1/2 -translate-x-1/2 rotate-45 border-b border-r',
      bottom: 'top-[-6px] left-1/2 -translate-x-1/2 rotate-45 border-t border-l',
      left: 'right-[-6px] top-1/2 -translate-y-1/2 rotate-45 border-t border-r',
      right: 'left-[-6px] top-1/2 -translate-y-1/2 rotate-45 border-b border-l',
    };

    return (
      <div
        className={`absolute h-3 w-3 border-white/10 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-900/85 ${
          arrowClasses[step.position]
        }`}
      />
    );
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

      <div
        style={tooltipStyle}
        className="animate-slide-down pointer-events-auto rounded-2xl border border-white/10 bg-white/85 p-6 shadow-2xl backdrop-blur-xl transition-all dark:border-white/5 dark:bg-zinc-900/85"
      >
        {renderArrow()}
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
    </>
  );
}
