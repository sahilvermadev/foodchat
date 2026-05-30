import type { TMessage } from 'librechat-data-provider';

import type { CookingContextCategory, CookingTurnPlan } from './planner';
import type { CookingTurnUnderstanding } from './understanding';

type PreferenceSections = Map<string, { title: string; body: string }>;

type PreferenceBriefInput = {
  markdown?: string;
  conversationId: string;
  text: string;
  messages?: TMessage[];
  turnUnderstanding: CookingTurnUnderstanding;
  turnPlan?: CookingTurnPlan;
};

function normalizePreferenceHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parsePreferenceSections(markdown: string): PreferenceSections {
  const sections: PreferenceSections = new Map();
  let currentTitle = '';
  let currentLines: string[] = [];

  const commit = () => {
    const body = currentLines.join('\n').trim();
    if (!currentTitle || !body) {
      return;
    }
    sections.set(normalizePreferenceHeading(currentTitle), {
      title: currentTitle,
      body,
    });
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{2,}\s+(.+?)\s*$/);
    if (heading) {
      commit();
      currentTitle = heading[1].trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  commit();

  return sections;
}

function preferenceSection(
  sections: PreferenceSections,
  matches: Array<string | RegExp>,
): { title: string; body: string } | undefined {
  for (const [key, section] of sections) {
    if (matches.some((match) => (typeof match === 'string' ? key === match : match.test(key)))) {
      return section;
    }
  }
  return undefined;
}

function formatPreferenceSection(section: { title: string; body: string }): string {
  return [`${section.title}:`, section.body].join('\n');
}

function planSelects(
  turnPlan: CookingTurnPlan | undefined,
  category: CookingContextCategory,
): boolean {
  return !turnPlan || turnPlan.selectedContextCategories.includes(category);
}

export function buildPreferenceBrief(input: PreferenceBriefInput): string {
  const preferences = input.markdown?.trim();
  const { turnPlan, turnUnderstanding } = input;
  const hasSituationalContext = Boolean(
    turnUnderstanding.contextPolicy.situationalPriors.localeCountry ||
      turnUnderstanding.contextPolicy.situationalPriors.likelyMealOccasion,
  );
  if (!preferences && !hasSituationalContext) {
    return '';
  }

  const sections: PreferenceSections = preferences
    ? parsePreferenceSections(preferences)
    : new Map();
  const hardSections = [
    preferenceSection(sections, ['safety']),
    preferenceSection(sections, ['diet']),
    preferenceSection(sections, [/religious/, /cultural/]),
  ].filter((section): section is { title: string; body: string } => Boolean(section));
  const tasteSection = preferenceSection(sections, ['taste']);
  const goalsSection = preferenceSection(sections, ['goals']);
  const householdSection = preferenceSection(sections, ['household']);
  const kitchenSection = preferenceSection(sections, ['kitchen']);
  const cookingLevelSection = preferenceSection(sections, ['cooking level']);
  const specialtySection = preferenceSection(sections, ['specialty ingredients']);
  const plannedIntent = turnPlan?.intent ?? turnUnderstanding.intent;
  const exposeSpecialty =
    Boolean(specialtySection) && planSelects(turnPlan, 'specialty_ingredients');
  const localeSignal = turnUnderstanding.contextPolicy.situationalPriors.localeCountry;

  const brief = [
    'User Preference Brief:',
    'Use this task-specific brief instead of treating the full saved profile as instructions. Hard constraints silently filter outputs; do not announce, narrate, or congratulate the user for avoiding them unless the user asks or there is a direct conflict. Soft preferences rank options; availability is not preference.',
  ];

  if (hardSections.length > 0) {
    brief.push(['Hard constraints:', ...hardSections.map(formatPreferenceSection)].join('\n'));
  }

  const taskLines: string[] = [];
  if (plannedIntent === 'quick_recommendation') {
    taskLines.push(
      '- Current task: quick everyday food suggestion. Give immediately usable options before asking follow-up questions.',
      '- Prefer ordinary accessible food over novelty unless the user asks for novelty.',
      '- Do not create or suggest a durable recipe document unless the user asks for one.',
    );
  }
  if (taskLines.length > 0) {
    brief.push(['Current task and corrections:', ...taskLines].join('\n'));
  }

  if (turnPlan?.constraints.soft.length) {
    brief.push(
      [
        'Planner soft constraints:',
        ...turnPlan.constraints.soft.map((constraint) => `- ${constraint}`),
        "Use these as the planner's semantic reading of the conversation, not as quoted user text.",
      ].join('\n'),
    );
  }

  const situationalLines: string[] = [];
  if (
    localeSignal &&
    turnUnderstanding.contextPolicy.allowLocaleSignal &&
    planSelects(turnPlan, 'locale')
  ) {
    situationalLines.push(
      `- Locale signal: ${localeSignal}. Use quietly for accessibility and cuisine ranking; do not name the user's exact place unless asked.`,
    );
  }
  if (plannedIntent === 'quick_recommendation' && planSelects(turnPlan, 'meal_occasion')) {
    const mealOccasion = turnUnderstanding.contextPolicy.situationalPriors.likelyMealOccasion;
    const confidence = turnUnderstanding.contextPolicy.situationalPriors.mealOccasionConfidence;
    if (mealOccasion && confidence) {
      situationalLines.push(
        `- Likely meal occasion: ${mealOccasion}, ${confidence} confidence. Use only for ranking; do not mention unless useful.`,
      );
    }
  }
  if (
    plannedIntent === 'quick_recommendation' &&
    !turnUnderstanding.contextPolicy.situationalPriors.likelyMealOccasion
  ) {
    situationalLines.push(
      '- Meal occasion is uncertain; make a practical default and keep assumptions light.',
    );
  }
  if (situationalLines.length > 0) {
    brief.push(['Situational priors:', ...situationalLines].join('\n'));
  }

  const relevantSoftSections = [
    planSelects(turnPlan, 'taste') ? tasteSection : undefined,
    planSelects(turnPlan, 'goals') ? goalsSection : undefined,
    planSelects(turnPlan, 'household') ? householdSection : undefined,
    planSelects(turnPlan, 'kitchen') ? kitchenSection : undefined,
    planSelects(turnPlan, 'cooking_level') ? cookingLevelSection : undefined,
  ].filter((section): section is { title: string; body: string } => Boolean(section));
  if (relevantSoftSections.length > 0) {
    brief.push(
      [
        'Relevant soft context:',
        ...relevantSoftSections.map(formatPreferenceSection),
        'Treat these as ranking and feasibility hints, not commands.',
      ].join('\n'),
    );
  }

  if (specialtySection) {
    if (exposeSpecialty) {
      brief.push(
        [
          'Specialty ingredients relevant to this turn:',
          formatPreferenceSection(specialtySection),
          'Optional enhancer: use only if it genuinely improves the answer.',
        ].join('\n'),
      );
    } else {
      brief.push(
        [
          'Suppressed preference context:',
          '- Saved specialty ingredient inventory exists but is suppressed for this turn. Do not anchor ordinary suggestions on it or mention the inventory.',
        ].join('\n'),
      );
    }
  }

  return [
    ...brief,
    'If a saved preference is not present in this brief, assume it was withheld intentionally for this turn.',
  ].join('\n\n');
}
