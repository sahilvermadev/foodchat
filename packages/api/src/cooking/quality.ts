import type { CookingTurnPlan } from './planner';
import type { CookingWebSource } from './web';

export type CookingQualityFailureLabel =
  | 'empty_response'
  | 'missing_time_constraint'
  | 'not_actionable'
  | 'needless_clarification'
  | 'unnecessary_restriction_disclosure'
  | 'canvas_claim_without_mutation'
  | 'source_only_response'
  | 'private_context_leak'
  | 'overlong_for_delivery_mode'
  | 'buried_primary_action'
  | 'repeats_canvas_content'
  | 'excessive_preamble';

export type CookingSemanticQualityFailureLabel = Extract<
  CookingQualityFailureLabel,
  | 'missing_time_constraint'
  | 'not_actionable'
  | 'needless_clarification'
  | 'unnecessary_restriction_disclosure'
  | 'canvas_claim_without_mutation'
  | 'source_only_response'
  | 'private_context_leak'
  | 'overlong_for_delivery_mode'
  | 'buried_primary_action'
  | 'repeats_canvas_content'
  | 'excessive_preamble'
>;

export type CookingQualityJudgeFallbackReason = 'provider_error' | 'malformed_json';

export type CookingQualityResult = {
  ok: boolean;
  failureLabels: CookingQualityFailureLabel[];
  repairInstruction?: string;
  qualityJudgeUsed?: boolean;
  qualityJudgeFallbackReason?: CookingQualityJudgeFallbackReason;
  qualityJudgeRationaleLabels?: string[];
};

export type CookingQualityInput = {
  text: string;
  userText?: string;
  recentUserMessages?: string[];
  turnPlan: CookingTurnPlan;
  draftChanged: boolean;
  webSources: CookingWebSource[];
  preferencesMarkdown?: string;
  timeZone?: string;
  conversationCreatedAt?: string | number | Date;
};

const advisoryFailureLabels = new Set<CookingQualityFailureLabel>([
  'overlong_for_delivery_mode',
  'buried_primary_action',
  'repeats_canvas_content',
  'excessive_preamble',
]);

type QualityJudgeMessage = {
  role: 'system' | 'user';
  content: string;
};

export type CookingQualityJudgeProvider = (messages: QualityJudgeMessage[]) => Promise<string>;

type RawQualityJudgment = {
  passes?: boolean;
  failureLabels?: string[];
  repairPlanLabels?: string[];
  rationaleLabels?: string[];
};

const semanticFailureLabels = new Set<CookingSemanticQualityFailureLabel>([
  'missing_time_constraint',
  'not_actionable',
  'needless_clarification',
  'unnecessary_restriction_disclosure',
  'canvas_claim_without_mutation',
  'source_only_response',
  'private_context_leak',
  'overlong_for_delivery_mode',
  'buried_primary_action',
  'repeats_canvas_content',
  'excessive_preamble',
]);

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function privacySafeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((label) =>
        label
          .toLowerCase()
          .replace(/[^a-z0-9_ -]+/g, '')
          .replace(/\s+/g, '_')
          .trim(),
      )
      .filter((label) => label.length >= 3 && label.length <= 48),
  ).slice(0, 8);
}

function repairInstruction(labels: CookingQualityFailureLabel[]): string | undefined {
  if (labels.length === 0) {
    return undefined;
  }

  return [
    'Rewrite the previous cooking reply so it satisfies the validated turn plan.',
    labels.includes('missing_time_constraint')
      ? '- Preserve the explicit time limit and give only options or steps that fit it.'
      : '',
    labels.includes('not_actionable') || labels.includes('needless_clarification')
      ? '- Give an immediately usable answer first; ask at most one short follow-up after useful guidance.'
      : '',
    labels.includes('unnecessary_restriction_disclosure')
      ? '- CRITICAL: You must completely remove any mention, announcement, or conversational framing that volunteers or discloses saved/private restrictions (such as avoiding beef, pork, peanuts, allergies, or religious rules). Apply saved restrictions silently. Do not say "since you avoid...", "skipping...", or mention these restrictions in any way.'
      : '',
    labels.includes('canvas_claim_without_mutation')
      ? '- Do not claim a canvas or document was created or changed.'
      : '',
    labels.includes('source_only_response')
      ? "- CRITICAL: The reply must not consist only of source names, URLs, citations, or references. You must provide a full, substantive, helpful cooking response that actually answers the user's cooking request. Use the sources only as citations/references supporting your text."
      : '',
    labels.includes('private_context_leak')
      ? '- Remove granular private context such as exact location, timezone, timestamp, and withheld pantry inventory.'
      : '',
    labels.includes('overlong_for_delivery_mode')
      ? '- Match the planned delivery mode length: glance is 40-90 words, standard is 100-180 words, deep_dive is longer only when requested, and canvas_confirmation is one short sentence.'
      : '',
    labels.includes('buried_primary_action') || labels.includes('excessive_preamble')
      ? '- Put the immediate answer or next cooking action in the first sentence. Remove preamble, throat-clearing, and setup before the useful part.'
      : '',
    labels.includes('repeats_canvas_content')
      ? '- Do not repeat full recipe/canvas contents in chat. Summarize what changed or answer the narrow question only.'
      : '',
    'Return only the corrected user-facing answer.',
  ]
    .filter(Boolean)
    .join('\n');
}

function hardFailureLabels(input: CookingQualityInput): CookingQualityFailureLabel[] {
  const labels: CookingQualityFailureLabel[] = [];
  const text = input.text.trim();
  if (!text) {
    labels.push('empty_response');
  }

  return unique(labels);
}

function parseQualityJudgeJson(content: string): RawQualityJudgment | undefined {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as RawQualityJudgment;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function semanticLabelsFromJudgment(raw: RawQualityJudgment): CookingQualityFailureLabel[] {
  const labels = unique(
    (Array.isArray(raw.failureLabels) ? raw.failureLabels : [])
      .filter((label): label is CookingSemanticQualityFailureLabel =>
        semanticFailureLabels.has(label as CookingSemanticQualityFailureLabel),
      )
      .map((label) => label as CookingQualityFailureLabel),
  );
  if (labels.length > 0 || raw.passes !== false) {
    return labels;
  }
  return ['not_actionable'];
}

function qualityOk(labels: CookingQualityFailureLabel[]): boolean {
  return labels.every((label) => advisoryFailureLabels.has(label));
}

function qualityJudgePrompt(input: CookingQualityInput): QualityJudgeMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are the private JSON-only semantic quality judge for Samwise cooking replies.',
        'Judge whether the assistant reply semantically satisfies the validated turn plan and user request.',
        'Use judgment, not keyword matching. Decide whether the reply would feel helpful, privacy-respecting, and truthful to the user.',
        'Return exactly one JSON object. No markdown, no prose.',
        '',
        'Allowed failureLabels: missing_time_constraint, not_actionable, needless_clarification, unnecessary_restriction_disclosure, canvas_claim_without_mutation, source_only_response, private_context_leak, overlong_for_delivery_mode, buried_primary_action, repeats_canvas_content, excessive_preamble.',
        'Use missing_time_constraint only when an explicit time limit is materially ignored.',
        'Use not_actionable when the user needed usable cooking guidance but got no concrete option, dish, adjustment, or next step.',
        'Use needless_clarification when the plan does not need clarification and the reply delays useful guidance with questions.',
        'Use unnecessary_restriction_disclosure when the reply volunteers saved/private restrictions as conversational framing even though the user did not ask about them and there is no direct conflict to explain.',
        'Use canvas_claim_without_mutation when responseState.draftChanged is false but the reply tells the user a canvas/document was created, revised, changed, or saved.',
        'Use source_only_response when the reply is only source names, URLs, citations, or attribution and does not answer the cooking request.',
        'Use private_context_leak when the reply exposes exact saved location, timezone, timestamp, saved inventory/profile contents, or other private profile facts in user-visible prose without a direct user need.',
        'Use overlong_for_delivery_mode when the reply is materially longer than the planned deliveryMode calls for.',
        'Use buried_primary_action when the reply eventually answers but makes the user read setup before the useful cooking action.',
        'Use repeats_canvas_content when the chat reply restates a full recipe or canvas content after a document mutation instead of a short confirmation.',
        'Use excessive_preamble when the reply starts with generic acknowledgement, reassurance, or commentary instead of the answer.',
        'A concise list of concrete options can pass even without imperative verbs.',
        'The privacyReviewContext is for judging only; do not copy its values into rationaleLabels.',
        'Output keys: passes, failureLabels, repairPlanLabels, rationaleLabels.',
        'rationaleLabels must be short privacy-safe labels, not quotes from the user or private profile.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        currentUserText: input.userText,
        recentUserMessages: input.recentUserMessages?.slice(-4),
        turnPlan: {
          intent: input.turnPlan.intent,
          action: input.turnPlan.action,
          confidence: input.turnPlan.confidence,
          hardConstraints: input.turnPlan.constraints.hard,
          softConstraints: input.turnPlan.constraints.soft,
          promptProfile: input.turnPlan.promptProfile,
          deliveryMode: input.turnPlan.deliveryMode,
          clarification: input.turnPlan.clarification,
        },
        responseState: {
          draftChanged: input.draftChanged,
          webSourceCount: input.webSources.length,
        },
        privacyReviewContext: {
          preferencesMarkdown: input.preferencesMarkdown,
          timeZone: input.timeZone,
          conversationCreatedAt: input.conversationCreatedAt,
        },
        assistantReply: input.text,
      }),
    },
  ];
}

function qualityResult(input: {
  labels: CookingQualityFailureLabel[];
  qualityJudgeUsed?: boolean;
  qualityJudgeFallbackReason?: CookingQualityJudgeFallbackReason;
  qualityJudgeRationaleLabels?: string[];
}): CookingQualityResult {
  const failureLabels = unique(input.labels);
  return {
    ok: qualityOk(failureLabels),
    failureLabels,
    repairInstruction: repairInstruction(failureLabels),
    qualityJudgeUsed: input.qualityJudgeUsed,
    qualityJudgeFallbackReason: input.qualityJudgeFallbackReason,
    qualityJudgeRationaleLabels: input.qualityJudgeRationaleLabels,
  };
}

export function validateCookingResponse(input: CookingQualityInput): CookingQualityResult {
  return qualityResult({
    labels: hardFailureLabels(input),
    qualityJudgeUsed: false,
  });
}

export async function validateCookingResponseWithJudge(
  input: CookingQualityInput,
  provider: CookingQualityJudgeProvider,
): Promise<CookingQualityResult> {
  const hardLabels = hardFailureLabels(input);
  if (hardLabels.includes('empty_response')) {
    return qualityResult({
      labels: hardLabels,
      qualityJudgeUsed: false,
    });
  }

  try {
    const content = await provider(qualityJudgePrompt(input));
    const raw = parseQualityJudgeJson(content);
    if (!raw) {
      return qualityResult({
        labels: hardLabels,
        qualityJudgeUsed: false,
        qualityJudgeFallbackReason: 'malformed_json',
      });
    }
    return qualityResult({
      labels: [...hardLabels, ...semanticLabelsFromJudgment(raw)],
      qualityJudgeUsed: true,
      qualityJudgeRationaleLabels: privacySafeLabels(raw.rationaleLabels),
    });
  } catch {
    return qualityResult({
      labels: hardLabels,
      qualityJudgeUsed: false,
      qualityJudgeFallbackReason: 'provider_error',
    });
  }
}

export function validateCookingResponseHardBoundaries(
  input: CookingQualityInput,
): CookingQualityResult {
  return qualityResult({
    labels: hardFailureLabels(input),
    qualityJudgeUsed: false,
  });
}
