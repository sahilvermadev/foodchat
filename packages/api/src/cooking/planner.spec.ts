import type { CookingDraft } from 'librechat-data-provider';

import type { CookingPlannerInput } from './planner';
import { planCookingTurn } from './planner';
import { buildTurnContext } from './context';
import { understandCookingTurn } from './understanding';

function activeDraft(): CookingDraft {
  return {
    _id: 'draft-1',
    user: 'user-1',
    conversationId: 'conversation-1',
    prompt: 'Masala Chhach',
    status: 'active',
    documentType: 'recipe',
    selected: true,
    recipe: {
      title: 'Masala Chhach',
      description: '',
      servings: 2,
      timing: { prepMinutes: 5, cookMinutes: 0, totalMinutes: 5 },
      ingredients: [],
      steps: [],
      notes: [],
      tags: [],
    },
    documentMarkdown: '# Masala Chhach\n\n## Ingredients\n\n- Dahi\n\n## Instructions\n\n1. Whisk.',
    expiresAt: '2026-05-19T00:00:00.000Z',
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
  };
}

function input(overrides: Partial<CookingPlannerInput> = {}): CookingPlannerInput {
  const base = {
    conversationId: 'conversation-1',
    text: 'suggest me something to eat fast under 15 mins',
    turnContext: buildTurnContext({
      conversationCreatedAt: '2026-05-27T07:00:00.000Z',
      timeZone: 'Asia/Calcutta',
      locale: 'en-IN',
    }),
    linkedSourceState: {
      urls: [],
      readRequired: false,
      readSucceeded: false,
    },
    attachedImageSourceState: {
      currentImageCount: 0,
      historicalImageCount: 0,
      available: false,
    },
    preferenceSectionTitles: ['Safety', 'Taste', 'Specialty Ingredients'],
    availableCapabilities: {
      documentTools: true,
      activeCanvas: false,
      webConfigured: true,
    },
  };
  const fullInput = { ...base, ...overrides };
  return {
    ...fullInput,
    runtimeUnderstanding:
      overrides.runtimeUnderstanding ??
      understandCookingTurn({
        conversationId: fullInput.conversationId,
        text: fullInput.text,
        messages: fullInput.messages,
        hasActiveDraft: Boolean(fullInput.activeDraft),
        turnContext: fullInput.turnContext,
      }),
  };
}

function provider(plan: object): () => Promise<string> {
  return async () => JSON.stringify(plan);
}

describe('cooking planner', () => {
  test('accepts valid structured JSON and normalizes it', async () => {
    const plan = await planCookingTurn(
      input(),
      provider({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'locale', 'meal_occasion'],
        withheldContextCategories: ['specialty_ingredients'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['quick everyday food'],
      }),
    );

    expect(plan).toMatchObject({
      plannerUsed: true,
      intent: 'quick_recommendation',
      action: 'direct_answer',
      promptProfile: 'routine_direct',
      deliveryMode: 'glance',
      confidence: 'high',
    });
    expect(plan.selectedContextCategories).toEqual(['hard_constraints', 'locale', 'meal_occasion']);
    expect(plan.privacySafeRationaleLabels).toContain('quick_everyday_food');
  });

  test('malformed JSON falls back to runtime context without semantic word matching', async () => {
    const plan = await planCookingTurn(input(), async () => 'not json');

    expect(plan.plannerUsed).toBe(false);
    expect(plan.fallbackReason).toBe('malformed_json');
    expect(plan.intent).toBe('general_cooking_question');
    expect(plan.action).toBe('direct_answer');
    expect(plan.deliveryMode).toBe('glance');
    expect(plan.toolPolicy.allowDocumentTools).toBe(true);
    expect(plan.privacySafeRationaleLabels).toEqual(['planner_unavailable']);
  });

  test('uses deep_dive only when the user asks for explanation', async () => {
    const plan = await planCookingTurn(
      input({ text: 'Explain why resting meat helps before slicing' }),
      provider({
        intent: 'general_cooking_question',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints'],
        withheldContextCategories: [],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
      }),
    );

    expect(plan.deliveryMode).toBe('deep_dive');
  });

  test('attached recipe screenshot falls back to source-faithful canvas work', async () => {
    const plan = await planCookingTurn(
      input({
        text: 'Create the pizza recipe canvas',
        attachedImageSourceState: {
          currentImageCount: 0,
          historicalImageCount: 1,
          available: true,
        },
      }),
      async () => 'not json',
    );

    expect(plan).toMatchObject({
      plannerUsed: false,
      intent: 'source_driven_request',
      action: 'create_document',
      promptProfile: 'document_work',
      deliveryMode: 'canvas_confirmation',
    });
    expect(plan.selectedContextCategories).toEqual(expect.arrayContaining(['source', 'document']));
    expect(plan.privacySafeRationaleLabels).toEqual(['attached_image_recipe_source']);
  });

  test('attached recipe screenshot creates a distinct document when another canvas is active', async () => {
    const plan = await planCookingTurn(
      input({
        text: 'Create the pizza recipe canvas',
        activeDraft: activeDraft(),
        availableCapabilities: {
          documentTools: true,
          activeCanvas: true,
          webConfigured: true,
        },
        attachedImageSourceState: {
          currentImageCount: 1,
          historicalImageCount: 0,
          available: true,
        },
      }),
      async () => 'not json',
    );

    expect(plan.action).toBe('create_document');
  });

  test('quick normal meal selects routine_direct, withholds specialty, and withholds document tools', async () => {
    const plan = await planCookingTurn(
      input(),
      provider({
        intent: 'quick_recommendation',
        action: 'direct_answer',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'locale', 'meal_occasion', 'taste'],
        withheldContextCategories: ['specialty_ingredients', 'document'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['ordinary_request'],
      }),
    );

    expect(plan.promptProfile).toBe('routine_direct');
    expect(plan.selectedContextCategories).toEqual([
      'hard_constraints',
      'locale',
      'meal_occasion',
      'taste',
    ]);
    expect(plan.selectedContextCategories).not.toContain('specialty_ingredients');
    expect(plan.withheldContextCategories).toContain('document');
    expect(plan.toolPolicy.allowDocumentTools).toBe(false);
  });

  test('creative specialty request may select specialty context', async () => {
    const plan = await planCookingTurn(
      input({ text: 'give me a creative way to use chili oil' }),
      provider({
        intent: 'general_cooking_question',
        action: 'direct_answer',
        confidence: 'medium',
        selectedContextCategories: ['hard_constraints', 'specialty_ingredients'],
        withheldContextCategories: [],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['specialty_requested'],
      }),
    );

    expect(plan.selectedContextCategories).toContain('specialty_ingredients');
  });

  test('explicit durable recipe request selects document_work', async () => {
    const plan = await planCookingTurn(
      input({ text: 'create a recipe canvas for egg bhurji' }),
      provider({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['explicit_canvas_request'],
      }),
    );

    expect(plan.action).toBe('create_document');
    expect(plan.promptProfile).toBe('document_work');
    expect(plan.toolPolicy.allowDocumentTools).toBe(true);
  });

  test('planner can semantically classify add-to-canvas follow-ups as document work', async () => {
    const plan = await planCookingTurn(
      input({
        text: 'can you add the exact recipe to our canvas',
        messages: [
          {
            messageId: 'm1',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: "can you give me chef john from food wishes.com's patatas bravas recipe?",
          },
        ],
      }),
      provider({
        intent: 'recipe_request',
        action: 'create_document',
        confidence: 'high',
        selectedContextCategories: ['hard_constraints', 'document', 'source'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['explicit_canvas_request', 'source_faithful_recipe'],
      }),
    );

    expect(plan.action).toBe('create_document');
    expect(plan.promptProfile).toBe('document_work');
    expect(plan.toolPolicy.allowDocumentTools).toBe(true);
    expect(plan.selectedContextCategories).toContain('document');
  });

  test('full recipe follow-up after discussion selects document work', async () => {
    let plannerMessages: Parameters<NonNullable<Parameters<typeof planCookingTurn>[1]>>[0] = [];
    const plan = await planCookingTurn(
      input({
        text: 'alright give me the full recipe',
        messages: [
          {
            messageId: 'm1',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: 'How do I make chocolate mousse?',
          },
          {
            messageId: 'm2',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: 'i had heard you could make a mousse with just water and chocolate',
          },
        ],
      }),
      async (messages) => {
        plannerMessages = messages;
        return JSON.stringify({
          intent: 'recipe_request',
          action: 'create_document',
          confidence: 'high',
          selectedContextCategories: ['hard_constraints', 'document'],
          withheldContextCategories: ['specialty_ingredients', 'research'],
          promptProfile: 'document_work',
          clarificationNeeded: false,
          rationaleLabels: ['full_recipe_requested', 'committed_after_discussion'],
        });
      },
    );

    expect(plannerMessages[0]?.content).toContain('Recipe canvas planning rule');
    expect(plannerMessages[0]?.content).toContain('The full recipe itself belongs on the canvas');
    expect(plan.intent).toBe('recipe_request');
    expect(plan.action).toBe('create_document');
    expect(plan.promptProfile).toBe('document_work');
    expect(plan.toolPolicy.allowDocumentTools).toBe(true);
    expect(plan.selectedContextCategories).toContain('document');
  });

  test('planner can semantically route a specific recipe request to canvas work', async () => {
    let plannerMessages: Parameters<NonNullable<Parameters<typeof planCookingTurn>[1]>>[0] = [];
    const plan = await planCookingTurn(
      input({ text: 'How do I make chocolate mousse?' }),
      async (messages) => {
        plannerMessages = messages;
        return JSON.stringify({
          intent: 'recipe_request',
          action: 'create_document',
          confidence: 'high',
          selectedContextCategories: ['hard_constraints', 'document', 'cooking_level'],
          withheldContextCategories: ['research'],
          promptProfile: 'document_work',
          clarificationNeeded: false,
          rationaleLabels: ['specific_recipe_requested'],
        });
      },
    );

    expect(plannerMessages[0]?.content).toContain('The full recipe itself belongs on the canvas');
    expect(plan.intent).toBe('recipe_request');
    expect(plan.action).toBe('create_document');
    expect(plan.promptProfile).toBe('document_work');
    expect(plan.toolPolicy.allowDocumentTools).toBe(true);
  });

  test('active canvas edit selects document revision only when a draft exists', async () => {
    const withDraft = await planCookingTurn(
      input({
        text: 'make this spicier',
        activeDraft: activeDraft(),
        availableCapabilities: { documentTools: true, activeCanvas: true, webConfigured: false },
      }),
      provider({
        intent: 'document_edit',
        action: 'revise_document',
        confidence: 'high',
        selectedContextCategories: ['document'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['active_canvas_edit'],
      }),
    );
    const withoutDraft = await planCookingTurn(
      input({ text: 'make this spicier' }),
      provider({
        intent: 'document_edit',
        action: 'revise_document',
        confidence: 'high',
        selectedContextCategories: ['document'],
        withheldContextCategories: [],
        promptProfile: 'document_work',
        clarificationNeeded: false,
        rationaleLabels: ['active_canvas_edit'],
      }),
    );

    expect(withDraft.action).toBe('revise_document');
    expect(withDraft.toolPolicy.allowDocumentTools).toBe(true);
    expect(withoutDraft.action).toBe('direct_answer');
    expect(withoutDraft.toolPolicy.allowDocumentTools).toBe(false);
  });

  test('routine recipe inspiration does not unlock web planning', async () => {
    const plan = await planCookingTurn(
      input({ text: 'blueberry cheesecake ideas' }),
      provider({
        intent: 'general_cooking_question',
        action: 'direct_answer',
        confidence: 'medium',
        selectedContextCategories: ['hard_constraints', 'taste'],
        withheldContextCategories: ['research'],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['ordinary_request'],
      }),
    );

    expect(plan.action).toBe('direct_answer');
    expect(plan.promptProfile).toBe('routine_direct');
    expect(plan.toolPolicy.allowResearchRequestTool).toBe(false);
  });

  test('URL/source request requires source path', async () => {
    const plan = await planCookingTurn(
      input({
        text: 'use this exact recipe https://example.com/recipe',
        linkedSourceState: {
          urls: ['https://example.com/recipe'],
          readRequired: true,
          readSucceeded: false,
        },
      }),
      provider({
        intent: 'source_driven_request',
        action: 'direct_answer',
        confidence: 'medium',
        selectedContextCategories: ['hard_constraints'],
        withheldContextCategories: [],
        promptProfile: 'routine_direct',
        clarificationNeeded: false,
        rationaleLabels: ['source_url_present'],
      }),
    );

    expect(plan.selectedContextCategories).toContain('source');
    expect(plan.promptProfile).toBe('source_or_research');
    expect(plan.toolPolicy.allowResearchRequestTool).toBe(true);
  });

  test('extracts previous plan state from assistant message metadata and injects it', async () => {
    let plannerMessages: Parameters<NonNullable<Parameters<typeof planCookingTurn>[1]>>[0] = [];
    const plan = await planCookingTurn(
      input({
        text: 'can you make it spicier?',
        activeDraft: activeDraft(),
        messages: [
          {
            messageId: 'm1',
            conversationId: 'conversation-1',
            isCreatedByUser: true,
            text: 'create a recipe canvas for egg bhurji',
          },
          {
            messageId: 'm2',
            conversationId: 'conversation-1',
            isCreatedByUser: false,
            text: 'I have created the egg bhurji canvas for you!',
            metadata: {
              cookingActiveIntent: 'recipe_request',
              cookingActiveAction: 'create_document',
            },
          },
        ],
      }),
      async (messages) => {
        plannerMessages = messages;
        return JSON.stringify({
          intent: 'document_edit',
          action: 'revise_document',
          confidence: 'high',
          selectedContextCategories: ['document'],
          withheldContextCategories: [],
          promptProfile: 'document_work',
          clarificationNeeded: false,
          rationaleLabels: ['spicier_modification'],
        });
      },
    );

    expect(plan.intent).toBe('document_edit');
    expect(plan.action).toBe('revise_document');
    expect(plannerMessages[1]?.content).toContain(
      '"previousPlanState":{"intent":"recipe_request","action":"create_document"}',
    );
  });
});
