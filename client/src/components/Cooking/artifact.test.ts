import {
  applyRecipeArtifactAction,
  extractTimerTokenSeconds,
  getCookingCanvasMarkdown,
  getCookingChatDisplayText,
  getCookingConversationPath,
  getCookingNewChatPath,
  isRecipeDocumentMarkdown,
  parseCookingAssistantResponse,
  stripCookingTimerTokens,
} from './artifact';

describe('cooking artifact helpers', () => {
  it('recognizes recipe documents with markdown headings', () => {
    const markdown = `# Juicy Chicken Dim Sum

## Ingredients
- ground chicken thighs
- soy sauce
- dumpling wrappers

## Instructions
1. Mix the filling thoroughly with stock and seasonings.
2. Fill the wrappers and steam until cooked through.

This recipe keeps the filling juicy by using chicken thighs and binder liquid.`;

    expect(isRecipeDocumentMarkdown(markdown)).toBe(true);
  });

  it('recognizes recipe documents with plain or bold section labels from chat models', () => {
    const markdown = `Here is a reliable recipe for chicken dim sum.

**Ingredients**
- ground chicken thighs
- shiitake mushrooms
- soy sauce
- dumpling wrappers

**Instructions**
1. Combine the filling ingredients until tacky and hydrated.
2. Fill each wrapper with a spoonful of filling.
3. Steam until the chicken is cooked and the wrapper is tender.

The key is enough liquid in the filling so the dumplings stay juicy.`;

    expect(isRecipeDocumentMarkdown(markdown)).toBe(true);
  });

  it('recognizes recipe documents when instruction steps are numbered instead of headed', () => {
    const markdown = `"Jahangiri Chicken" is a rich and aromatic dish.

The Karim's Style Jahangiri Chicken

- Prep time: 20 mins
- Cook time: 45 mins
- Serves: 4

Ingredients
For the Chicken & Marinade:
- 750g chicken
- 1 cup thick yogurt
- 1 tbsp ginger-garlic paste

For the Gravy:
- ghee
- onions
- cashews
- saffron

1. Marinate the chicken with yogurt, spices, and ginger-garlic paste.
2. Heat ghee, fry onions, and cook the chicken until browned.
3. Blend cashews into a paste and simmer the gravy until rich.
4. Serve hot with naan.`;

    expect(isRecipeDocumentMarkdown(markdown)).toBe(true);
  });

  it('does not treat a short follow-up answer as the canvas artifact', () => {
    expect(isRecipeDocumentMarkdown('Use chicken thighs and add a splash of stock.')).toBe(false);
  });

  it('parses standardized timer tokens for active Kitchen Mode', () => {
    expect(extractTimerTokenSeconds('Sear until browned. [timer:180]')).toBe(180);
    expect(stripCookingTimerTokens('Sear [timer:180] until deeply browned.')).toBe(
      'Sear until deeply browned.',
    );
  });

  it('parses a create action from the cooking assistant artifact protocol', () => {
    const response = `\`\`\`json
{
  "artifact_action": {
    "type": "create",
    "markdown": "# Butter Chicken\\n\\n## Ingredients\\n- chicken\\n- tomatoes\\n\\n## Instructions\\n1. Marinate the chicken.\\n2. Simmer the sauce."
  },
  "chat_response": "I added the butter chicken recipe to the canvas."
}
\`\`\``;

    const parts = parseCookingAssistantResponse(response);
    expect(parts.artifactAction).toEqual({
      type: 'create',
      markdown:
        '# Butter Chicken\n\n## Ingredients\n- chicken\n- tomatoes\n\n## Instructions\n1. Marinate the chicken.\n2. Simmer the sauce.',
    });
    expect(parts.chatResponse).toBe('I added the butter chicken recipe to the canvas.');
  });

  it('uses persisted draft markdown as the canvas source of truth', () => {
    expect(
      getCookingCanvasMarkdown({
        assistantMarkdown: '# Refreshing Iced Coffee',
        draftMarkdown: '# Garlic Lemon Skillet Dinner',
      }),
    ).toBe('# Garlic Lemon Skillet Dinner');
  });

  it('collapses artifact protocol to only the chat response for the sidebar', () => {
    const response = `\`\`\`json
{
  "artifact_action": {
    "type": "create",
    "markdown": "# Refreshing Iced Coffee\\n\\n## Ingredients\\n- coffee\\n\\n## Instructions\\n1. Brew coffee.\\n2. Serve over ice."
  },
  "chat_response": "I added the iced coffee recipe to the canvas."
}
\`\`\``;

    expect(getCookingChatDisplayText(response, 'Added to canvas.')).toBe(
      'I added the iced coffee recipe to the canvas.',
    );
  });

  it('collapses answer-only artifact protocol without changing the canvas', () => {
    const response = `\`\`\`json
{
  "artifact_action": { "type": "none" },
  "chat_response": "The distinct flavor comes from browned onions and warm spices."
}
\`\`\``;

    expect(parseCookingAssistantResponse(response).artifactAction).toEqual({ type: 'none' });
    expect(getCookingChatDisplayText(response, 'Added to canvas.')).toBe(
      'The distinct flavor comes from browned onions and warm spices.',
    );
  });

  it('falls back to a short sidebar message when malformed protocol would otherwise leak', () => {
    const response = `\`\`\`json
{ "artifact_action": { "type": "patch" },
\`\`\``;
    expect(getCookingChatDisplayText(response, 'Added to canvas.')).toBe('Added to canvas.');
  });

  it('applies targeted artifact patches without requiring full recipe markdown', () => {
    const markdown = `# Changezi Chicken

## Ingredients
- chicken
- yogurt

## Instructions
1. Marinate the chicken.
2. Cook the gravy.

## Notes
- Keep it balanced.`;

    const result = applyRecipeArtifactAction(markdown, {
      type: 'patch',
      operations: [
        { op: 'append_to_section', heading: 'Ingredients', markdown: '- 2 tsp Kashmiri chili' },
        { op: 'replace_step', step: 2, markdown: '2. Cook the gravy until spicy and glossy.' },
        { op: 'append_note', markdown: '- Add green chilies for extra heat.' },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.markdown).toContain('- 2 tsp Kashmiri chili');
    expect(result.markdown).toContain('2. Cook the gravy until spicy and glossy.');
    expect(result.markdown).toContain('- Add green chilies for extra heat.');
  });

  it('preserves the artifact when a patch target is missing', () => {
    const markdown = `# Iced Coffee

## Ingredients
- coffee

## Instructions
1. Pour over ice.`;

    const result = applyRecipeArtifactAction(markdown, {
      type: 'patch',
      operations: [{ op: 'replace_section', heading: 'Sauce', markdown: '- chili oil' }],
    });

    expect(result.changed).toBe(false);
    expect(result.markdown).toBe(markdown);
    expect(result.warnings).toEqual(['Section not found: Sauce']);
  });

  it('keeps new chat and conversation navigation inside the cooking workspace', () => {
    expect(getCookingNewChatPath('/cook/abc')).toBe('/cook');
    expect(getCookingConversationPath('/cook', 'abc')).toBe('/cook/abc');
    expect(getCookingConversationPath('/cook/abc', 'new')).toBe('/cook');
  });

  it('normalizes legacy chat navigation into the cooking workspace', () => {
    expect(getCookingNewChatPath('/c/abc')).toBe('/cook');
    expect(getCookingConversationPath('/c/new', 'abc')).toBe('/cook/abc');
  });
});
