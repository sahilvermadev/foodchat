import type { CookingSession } from 'librechat-data-provider';
import { reduceSessionEvent } from './reducer';
import { normalizeRecipe } from './validation';

const recipe = () =>
  normalizeRecipe({
    title: 'Lentil stew',
    description: '',
    servings: 2,
    timing: { prepMinutes: 10, cookMinutes: 20, totalMinutes: 30 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '1 cup lentils',
        item: 'lentils',
        quantityType: 'measured',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Rinse the lentils.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
      {
        id: 'step-2',
        order: 2,
        text: 'Simmer until tender.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
    ],
    notes: [],
    tags: [],
  });

const baseSession = (): CookingSession => ({
  _id: 'session-1',
  user: 'user-1',
  status: 'active',
  currentStepIndex: 0,
  draftId: 'draft-1',
  recipeSnapshot: recipe(),
  summary: { notes: [], substitutions: [], problems: [] },
  startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
});

describe('cooking reducer', () => {
  test('advances and bounds current step navigation', () => {
    const session = baseSession();

    const next = reduceSessionEvent(session, { type: 'navigation', action: 'next' });
    expect(next.currentStepIndex).toBe(1);

    const beyondLast = reduceSessionEvent(
      { ...session, currentStepIndex: session.recipeSnapshot.steps.length - 1 },
      { type: 'navigation', action: 'next' },
    );
    expect(beyondLast.currentStepIndex).toBe(session.recipeSnapshot.steps.length - 1);

    const previous = reduceSessionEvent(session, { type: 'navigation', action: 'previous' });
    expect(previous.currentStepIndex).toBe(0);
  });

  test('records notes, substitutions, problems, and review summary', () => {
    const session = baseSession();
    const withNote = reduceSessionEvent(session, {
      type: 'note',
      stepIndex: 0,
      text: 'Needed more salt',
    });
    expect(withNote.summary.notes).toEqual(['Needed more salt']);

    const withSubstitution = reduceSessionEvent(
      { ...session, summary: withNote.summary },
      { type: 'substitution', text: 'Used chickpeas' },
    );
    expect(withSubstitution.summary.substitutions).toEqual([{ text: 'Used chickpeas' }]);

    const withProblem = reduceSessionEvent(
      { ...session, summary: withSubstitution.summary },
      { type: 'problem', text: 'Pan was too hot' },
    );
    expect(withProblem.summary.problems).toEqual(['Pan was too hot']);

    const reviewed = reduceSessionEvent(
      { ...session, summary: withProblem.summary },
      { type: 'review', rating: 4, note: 'Good weeknight base' },
    );
    expect(reviewed.summary.rating).toBe(4);
    expect(reviewed.summary.reviewNote).toBe('Good weeknight base');
  });
});
