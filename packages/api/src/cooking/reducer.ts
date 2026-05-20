import type { CookingSession, CookingSessionEvent } from 'librechat-data-provider';

export function reduceSessionEvent(
  session: CookingSession,
  event: CookingSessionEvent,
): Pick<CookingSession, 'currentStepIndex' | 'summary' | 'status'> {
  const lastStepIndex = Math.max(0, session.recipeSnapshot.steps.length - 1);

  if (event.type === 'navigation') {
    if (event.action === 'next') {
      return {
        status: session.status,
        summary: session.summary,
        currentStepIndex: Math.min(lastStepIndex, session.currentStepIndex + 1),
      };
    }
    if (event.action === 'previous') {
      return {
        status: session.status,
        summary: session.summary,
        currentStepIndex: Math.max(0, session.currentStepIndex - 1),
      };
    }
    if (event.action === 'jump') {
      return {
        status: session.status,
        summary: session.summary,
        currentStepIndex: Math.min(lastStepIndex, Math.max(0, event.stepIndex ?? 0)),
      };
    }
    return {
      status: session.status,
      summary: session.summary,
      currentStepIndex: session.currentStepIndex,
    };
  }

  if (event.type === 'note') {
    return {
      status: session.status,
      currentStepIndex: session.currentStepIndex,
      summary: { ...session.summary, notes: [...session.summary.notes, event.text] },
    };
  }

  if (event.type === 'substitution') {
    return {
      status: session.status,
      currentStepIndex: session.currentStepIndex,
      summary: {
        ...session.summary,
        substitutions: [
          ...session.summary.substitutions,
          { ...(event.ingredientId ? { ingredientId: event.ingredientId } : {}), text: event.text },
        ],
      },
    };
  }

  if (event.type === 'problem') {
    return {
      status: session.status,
      currentStepIndex: session.currentStepIndex,
      summary: { ...session.summary, problems: [...session.summary.problems, event.text] },
    };
  }

  if (event.type === 'review') {
    return {
      status: session.status,
      currentStepIndex: session.currentStepIndex,
      summary: {
        ...session.summary,
        rating: event.rating,
        reviewNote: event.note,
      },
    };
  }

  return {
    status: session.status,
    summary: session.summary,
    currentStepIndex: session.currentStepIndex,
  };
}
