import type { CookingDraft, TMessage } from 'librechat-data-provider';

import type { TurnContext } from './context';
import type {
  CookingResponseMode,
  CookingTurnIntent,
  CookingTurnUnderstanding,
} from './understanding';
import { understandCookingTurn } from './understanding';

export type CookingPlannedAction =
  | 'direct_answer'
  | 'ask_clarifying_question'
  | 'create_document'
  | 'revise_document'
  | 'read_document'
  | 'read_source'
  | 'research_then_answer';

export type CookingPromptProfile =
  | 'routine_direct'
  | 'document_work'
  | 'source_or_research'
  | 'active_canvas_discussion';

export type CookingPlannerFallbackReason = 'provider_error' | 'malformed_json' | 'invalid_policy';

export type CookingContextCategory =
  | 'hard_constraints'
  | 'taste'
  | 'goals'
  | 'household'
  | 'kitchen'
  | 'cooking_level'
  | 'locale'
  | 'meal_occasion'
  | 'specialty_ingredients'
  | 'personal_context'
  | 'document'
  | 'source'
  | 'research';

export type CookingTurnPlan = {
  intent: CookingTurnIntent;
  action: CookingPlannedAction;
  confidence: 'high' | 'medium' | 'low';
  constraints: {
    hard: string[];
    soft: string[];
  };
  selectedContextCategories: CookingContextCategory[];
  withheldContextCategories: CookingContextCategory[];
  promptProfile: CookingPromptProfile;
  clarification: {
    needed: boolean;
    reasonLabel?: string;
  };
  privacySafeRationaleLabels: string[];
  toolPolicy: {
    allowDocumentTools: boolean;
    allowResearchRequestTool: boolean;
  };
  plannerUsed: boolean;
  fallbackReason?: CookingPlannerFallbackReason;
};

export type CookingPlannerInput = {
  conversationId: string;
  text: string;
  messages?: TMessage[];
  turnContext: TurnContext;
  activeDraft?: CookingDraft | null;
  documents?: CookingDraft[];
  linkedSourceState: {
    urls: string[];
    readRequired: boolean;
    readSucceeded: boolean;
  };
  attachedImageSourceState: {
    currentImageCount: number;
    historicalImageCount: number;
    available: boolean;
  };
  preferenceSectionTitles: string[];
  availableCapabilities: {
    documentTools: boolean;
    activeCanvas: boolean;
    webConfigured: boolean;
  };
  runtimeUnderstanding?: CookingTurnUnderstanding;
};

type PlannerChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export type CookingPlannerProvider = (messages: PlannerChatMessage[]) => Promise<string>;

type RawCookingPlan = {
  intent?: string;
  action?: string;
  confidence?: string;
  hardConstraints?: string[];
  softConstraints?: string[];
  selectedContextCategories?: string[];
  withheldContextCategories?: string[];
  promptProfile?: string;
  clarificationNeeded?: boolean;
  clarificationReasonLabel?: string;
  rationaleLabels?: string[];
};

const intents = new Set<CookingTurnIntent>([
  'quick_recommendation',
  'recipe_request',
  'document_question',
  'document_edit',
  'source_driven_request',
  'research_request',
  'general_cooking_question',
]);

const actions = new Set<CookingPlannedAction>([
  'direct_answer',
  'ask_clarifying_question',
  'create_document',
  'revise_document',
  'read_document',
  'read_source',
  'research_then_answer',
]);

const promptProfiles = new Set<CookingPromptProfile>([
  'routine_direct',
  'document_work',
  'source_or_research',
  'active_canvas_discussion',
]);

const contextCategories = new Set<CookingContextCategory>([
  'hard_constraints',
  'taste',
  'goals',
  'household',
  'kitchen',
  'cooking_level',
  'locale',
  'meal_occasion',
  'specialty_ingredients',
  'personal_context',
  'document',
  'source',
  'research',
]);

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function validStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function validContextCategories(value: unknown): CookingContextCategory[] {
  return unique(
    validStrings(value).filter((item): item is CookingContextCategory =>
      contextCategories.has(item as CookingContextCategory),
    ),
  );
}

function validRationaleLabels(value: unknown): string[] {
  return unique(
    validStrings(value)
      .map((label) =>
        label
          .toLowerCase()
          .replace(/[^a-z0-9_ -]+/g, '')
          .replace(/\s+/g, '_'),
      )
      .filter((label) => label.length >= 3 && label.length <= 48),
  ).slice(0, 8);
}

function actionFromResponseMode(responseMode: CookingResponseMode): CookingPlannedAction {
  if (responseMode === 'create_document') {
    return 'create_document';
  }
  if (responseMode === 'revise_document') {
    return 'revise_document';
  }
  if (responseMode === 'read_document') {
    return 'read_document';
  }
  if (responseMode === 'research_then_answer') {
    return 'research_then_answer';
  }
  if (responseMode === 'ask_clarifying_question') {
    return 'ask_clarifying_question';
  }
  return 'direct_answer';
}

function promptProfileForAction(input: {
  action: CookingPlannedAction;
  activeCanvas: boolean;
  intent: CookingTurnIntent;
}): CookingPromptProfile {
  if (input.action === 'create_document' || input.action === 'revise_document') {
    return 'document_work';
  }
  if (
    input.action === 'read_source' ||
    input.action === 'research_then_answer' ||
    input.intent === 'source_driven_request' ||
    input.intent === 'research_request'
  ) {
    return 'source_or_research';
  }
  if (input.activeCanvas) {
    return 'active_canvas_discussion';
  }
  return 'routine_direct';
}

function selectedCategoriesForUnderstanding(
  understanding: CookingTurnUnderstanding,
): CookingContextCategory[] {
  const selected: CookingContextCategory[] = ['hard_constraints'];
  if (understanding.contextPolicy.allowLocaleSignal) {
    selected.push('locale');
  }
  if (understanding.contextPolicy.situationalPriors.likelyMealOccasion) {
    selected.push('meal_occasion');
  }
  if (understanding.intent !== 'quick_recommendation') {
    selected.push('taste', 'goals', 'household', 'kitchen', 'cooking_level');
  } else {
    selected.push('taste', 'kitchen');
  }
  if (understanding.contextPolicy.allowSpecialtyIngredients) {
    selected.push('specialty_ingredients');
  }
  if (
    understanding.intent === 'document_question' ||
    understanding.intent === 'document_edit' ||
    understanding.responseMode === 'read_document'
  ) {
    selected.push('document');
  }
  if (understanding.intent === 'source_driven_request') {
    selected.push('source');
  }
  if (understanding.intent === 'research_request') {
    selected.push('research');
  }
  return unique(selected);
}

function fallbackPlan(
  input: CookingPlannerInput,
  fallbackReason?: CookingPlannerFallbackReason,
): CookingTurnPlan {
  const understanding =
    input.runtimeUnderstanding ??
    understandCookingTurn({
      conversationId: input.conversationId,
      text: input.text,
      messages: input.messages,
      hasActiveDraft: Boolean(input.activeDraft),
      turnContext: input.turnContext,
    });
  const attachedRecipeRequest =
    input.attachedImageSourceState.available &&
    /\b(recipe|canvas|give me this|make this|write this up|recreate|replicate|transcribe)\b/i.test(
      input.text,
    );
  const attachedRecipeRevisionRequest =
    attachedRecipeRequest &&
    Boolean(input.activeDraft) &&
    /\b(update|revise|edit|replace|overwrite)\b/i.test(input.text);
  let action = actionFromResponseMode(understanding.responseMode);
  if (attachedRecipeRequest) {
    action = attachedRecipeRevisionRequest ? 'revise_document' : 'create_document';
  }
  const intent = attachedRecipeRequest ? 'source_driven_request' : understanding.intent;
  const selectedContextCategories = unique([
    ...selectedCategoriesForUnderstanding(understanding),
    ...(input.attachedImageSourceState.available ? (['source'] as const) : []),
    ...(action === 'create_document' || action === 'revise_document'
      ? (['document'] as const)
      : []),
  ]);
  const allCategories = [...contextCategories];
  let privacySafeRationaleLabels = ['runtime_context_only'];
  if (fallbackReason) {
    privacySafeRationaleLabels = ['planner_unavailable'];
  }
  if (attachedRecipeRequest) {
    privacySafeRationaleLabels = ['attached_image_recipe_source'];
  }
  return {
    intent,
    action,
    confidence: fallbackReason ? 'low' : 'medium',
    constraints: understanding.constraints,
    selectedContextCategories,
    withheldContextCategories: allCategories.filter(
      (category) => !selectedContextCategories.includes(category),
    ),
    promptProfile: promptProfileForAction({
      action,
      activeCanvas: Boolean(input.activeDraft),
      intent,
    }),
    clarification: {
      needed: understanding.responseMode === 'ask_clarifying_question',
    },
    privacySafeRationaleLabels,
    toolPolicy: {
      ...understanding.toolPolicy,
      allowDocumentTools:
        action === 'create_document' ||
        action === 'revise_document' ||
        understanding.toolPolicy.allowDocumentTools,
    },
    plannerUsed: false,
    fallbackReason,
  };
}

function parsePlannerJson(content: string): RawCookingPlan | undefined {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as RawCookingPlan;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizedAction(input: CookingPlannerInput, raw: RawCookingPlan): CookingPlannedAction {
  const rawAction = raw.action;
  if (!rawAction || !actions.has(rawAction as CookingPlannedAction)) {
    return 'direct_answer';
  }
  const action = rawAction as CookingPlannedAction;
  if ((action === 'revise_document' || action === 'read_document') && !input.activeDraft) {
    return 'direct_answer';
  }
  if (action === 'read_source' && !input.linkedSourceState.readRequired) {
    return 'direct_answer';
  }
  return action;
}

function normalizedIntent(raw: RawCookingPlan): CookingTurnIntent {
  return raw.intent && intents.has(raw.intent as CookingTurnIntent)
    ? (raw.intent as CookingTurnIntent)
    : 'general_cooking_question';
}

function normalizedPromptProfile(
  input: CookingPlannerInput,
  raw: RawCookingPlan,
  action: CookingPlannedAction,
  intent: CookingTurnIntent,
): CookingPromptProfile {
  const derived = promptProfileForAction({
    action,
    activeCanvas: Boolean(input.activeDraft),
    intent,
  });
  if (!raw.promptProfile || !promptProfiles.has(raw.promptProfile as CookingPromptProfile)) {
    return derived;
  }
  const profile = raw.promptProfile as CookingPromptProfile;
  if (derived === 'document_work' || derived === 'source_or_research') {
    return derived;
  }
  if (profile === 'document_work' || profile === 'source_or_research') {
    return derived;
  }
  return profile;
}

function normalizePlan(input: CookingPlannerInput, raw: RawCookingPlan): CookingTurnPlan {
  const action = normalizedAction(input, raw);
  const intent =
    input.attachedImageSourceState.available &&
    (action === 'create_document' || action === 'revise_document')
      ? 'source_driven_request'
      : normalizedIntent(raw);
  const promptProfile = normalizedPromptProfile(input, raw, action, intent);
  const plannerSelected = validContextCategories(raw.selectedContextCategories);
  const selectedContextCategories = unique([
    'hard_constraints' as const,
    ...plannerSelected,
    ...(input.linkedSourceState.readRequired ? (['source'] as const) : []),
    ...(input.attachedImageSourceState.available ? (['source'] as const) : []),
    ...(promptProfile === 'source_or_research' ? (['research'] as const) : []),
    ...(promptProfile === 'document_work' || action === 'read_document'
      ? (['document'] as const)
      : []),
  ]);
  const withheldContextCategories = validContextCategories(raw.withheldContextCategories).filter(
    (category) => !selectedContextCategories.includes(category),
  );
  const confidence =
    raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
      ? raw.confidence
      : 'medium';
  const allowDocumentTools =
    action === 'create_document' ||
    (Boolean(input.activeDraft) && (action === 'read_document' || action === 'revise_document'));

  return {
    intent,
    action,
    confidence,
    constraints: {
      hard: unique(validStrings(raw.hardConstraints)),
      soft: unique(validStrings(raw.softConstraints)),
    },
    selectedContextCategories,
    withheldContextCategories:
      withheldContextCategories.length > 0
        ? withheldContextCategories
        : [...contextCategories].filter(
            (category) => !selectedContextCategories.includes(category),
          ),
    promptProfile,
    clarification: {
      needed: Boolean(raw.clarificationNeeded) || action === 'ask_clarifying_question',
      reasonLabel:
        typeof raw.clarificationReasonLabel === 'string'
          ? raw.clarificationReasonLabel.trim().slice(0, 80)
          : undefined,
    },
    privacySafeRationaleLabels: validRationaleLabels(raw.rationaleLabels),
    toolPolicy: {
      allowDocumentTools,
      allowResearchRequestTool:
        action === 'research_then_answer' ||
        action === 'read_source' ||
        intent === 'research_request' ||
        intent === 'source_driven_request',
    },
    plannerUsed: true,
  };
}

export type PreviousPlanState = {
  intent?: CookingTurnIntent;
  action?: CookingPlannedAction;
};

export function extractPreviousPlan(messages?: TMessage[]): PreviousPlanState | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg.isCreatedByUser && msg.metadata) {
      const intent = msg.metadata.cookingActiveIntent as CookingTurnIntent;
      const action = msg.metadata.cookingActiveAction as CookingPlannedAction;
      if (intent || action) {
        return { intent, action };
      }
    }
  }
  return undefined;
}

function recentUserMessages(input: CookingPlannerInput): string[] {
  return (input.messages ?? [])
    .filter((message) => !message.conversationId || message.conversationId === input.conversationId)
    .filter((message) => message.isCreatedByUser)
    .slice(-4)
    .map((message) => message.text)
    .filter((text): text is string => typeof text === 'string' && Boolean(text.trim()));
}

function plannerPrompt(input: CookingPlannerInput): PlannerChatMessage[] {
  const previousPlanState = extractPreviousPlan(input.messages);
  return [
    {
      role: 'system',
      content: [
        'You are the private JSON-only cooking turn planner for Samwise.',
        'Propose semantic intent, relevant context categories, and intended action. Runtime policy will enforce privacy, safety, tool limits, source-reading requirements, and active document availability.',
        'Return exactly one JSON object. No markdown, no prose.',
        '',
        'Allowed values:',
        `intent: ${[...intents].join(', ')}`,
        `action: ${[...actions].join(', ')}`,
        `promptProfile: ${[...promptProfiles].join(', ')}`,
        `context categories: ${[...contextCategories].join(', ')}`,
        '',
        'Output keys: intent, action, confidence, hardConstraints, softConstraints, selectedContextCategories, withheldContextCategories, promptProfile, clarificationNeeded, clarificationReasonLabel, rationaleLabels.',
        'Use privacy-safe rationale labels only. Labels must describe the type of reasoning, not quote private user text.',
        'Use recent user messages to preserve corrections, cuisine direction, rejected suggestions, and whether the user is exploring or asking for durable work; encode them as softConstraints and rationaleLabels.',
        'Select preference context semantically. Choose every profile section needed to avoid a generic answer, especially when the user asks for practical ideas under time, effort, ingredient, household, skill, location, or equipment constraints. Hard safety/diet/religious constraints are always enforced by runtime policy.',
        '',
        'Recipe canvas planning rule:',
        '- Direct chat is right for ideation, comparing options, answering ingredient or technique questions, troubleshooting, explaining why a step matters, or helping the user choose a direction.',
        '- The full recipe itself belongs on the canvas. If satisfying the current turn means presenting one specific dish in detail with ingredients plus cookable method, choose create_document with promptProfile document_work when no active canvas exists.',
        '- Treat the user intent semantically rather than by surface wording: if they are asking for a complete cookable recipe, plan document work; if they are asking a narrow technique or decision-support question, plan chat.',
        '- If there is an active canvas and the user wants the same recipe changed, choose revise_document with promptProfile document_work; the response can still briefly explain the change in chat after the tool succeeds.',
        '- If the current request is too underspecified to make a useful durable recipe, choose ask_clarifying_question or direct_answer that helps them choose; do not plan a long formal recipe in chat.',
        '- A user-attached recipe image is a source, not inspiration. When the user asks for "this recipe" or asks to create its canvas, choose create_document or revise_document as appropriate and preserve the attached source instead of planning a generic recipe.',
        '- The response model can inspect attached images. You only need to plan source-faithful work; do not request web research merely because the source is an image.',
        '',
        'Stickiness & State-Aware Planning Rules:',
        '- Check the provided "previousPlanState" (which includes the previous turn\'s classified intent and action) to understand what the agent was just doing.',
        '- Maintain conversational continuity. If the user is giving a natural conversational follow-up to a cooking canvas (e.g. asking to change an ingredient, rewrite a step, or asking questions about the active recipe), do not abruptly switch the intent back to a general chat if they are still modifying/discussing the canvas. Maintain intents like "document_edit", "recipe_request", "document_question" and actions like "revise_document", "direct_answer" accordingly to prevent closing the canvas unexpectedly.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        currentUserText: input.text,
        recentUserMessages: recentUserMessages(input),
        previousPlanState,
        turnContext: {
          coarseLocaleCountry: input.turnContext.coarseLocaleCountry,
          likelyMealOccasion: input.turnContext.likelyMealOccasion,
          mealOccasionConfidence: input.turnContext.confidence,
        },
        activeCanvas: Boolean(input.activeDraft),
        documentCount: input.documents?.length ?? 0,
        linkedSource: {
          urlCount: input.linkedSourceState.urls.length,
          readRequired: input.linkedSourceState.readRequired,
          readSucceeded: input.linkedSourceState.readSucceeded,
        },
        attachedImageSource: input.attachedImageSourceState,
        preferenceSectionTitles: input.preferenceSectionTitles,
        availableCapabilities: input.availableCapabilities,
      }),
    },
  ];
}

export async function planCookingTurn(
  input: CookingPlannerInput,
  provider: CookingPlannerProvider,
): Promise<CookingTurnPlan> {
  try {
    const content = await provider(plannerPrompt(input));
    const raw = parsePlannerJson(content);
    if (!raw) {
      return fallbackPlan(input, 'malformed_json');
    }
    return normalizePlan(input, raw);
  } catch {
    return fallbackPlan(input, 'provider_error');
  }
}

export function fallbackCookingTurnPlan(input: CookingPlannerInput): CookingTurnPlan {
  return fallbackPlan(input);
}
