import {
  canonicalRecipeFromContent,
  deriveRecipeFacts,
  hasUsableStructuredRecipe,
  recipeCompletenessIssues,
  structuredRecipeFromMarkdown,
  verifiedDietClaims,
} from './recipe-normalization';
import type { StructuredRecipe } from './types/cooking';

const placeholder: StructuredRecipe = {
  title: 'Scallion Meatballs',
  description: '',
  servings: 2,
  timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
  ingredients: [
    { id: 'ingredient-1', item: 'item', originalText: '1 item', quantityType: 'estimated' },
  ],
  steps: [
    {
      id: 'step-1',
      ingredientIds: ['ingredient-1'],
      order: 1,
      text: 'Prepare the recipe.',
      timers: [],
      tips: [],
      warnings: [],
    },
  ],
  notes: [],
  tags: [],
};

const groupedMarkdown = `# Scallion Meatballs With Soy-Ginger Glaze

A glossy, savory dinner.

## Recipe Data
| Field | Value |
| --- | --- |
| Servings | 4 |
| Prep time | 15 minutes |
| Cook time | 20 minutes |

## Ingredients
### For the Soy-Ginger Glaze
| Ingredient | Metric | Imperial | State/Form | Notes |
| --- | --- | --- | --- | --- |
| Soy sauce | 30 ml | 2 tbsp | liquid | |
### For the Meatballs
| Ingredient | Metric | Imperial | State/Form | Notes |
| --- | --- | --- | --- | --- |
| Ground chicken | 450 g | 1 lb | chilled | |

## Instructions
1. Mix the chicken in a mixing bowl.
2. Bake at 200°F for 10 minutes. [timer:600|Bake meatballs]
`;

describe('canonical recipe normalization', () => {
  it('recognizes placeholder structured recipes as unusable', () => {
    expect(hasUsableStructuredRecipe(placeholder)).toBe(false);
  });

  it('parses nested ingredient groups without ending the parent section', () => {
    const recipe = structuredRecipeFromMarkdown(groupedMarkdown, placeholder);
    expect(recipe).toMatchObject({
      title: 'Scallion Meatballs With Soy-Ginger Glaze',
      servings: 4,
      timing: { prepMinutes: 15, cookMinutes: 20, totalMinutes: 35 },
    });
    expect(recipe?.ingredients).toEqual([
      expect.objectContaining({ group: 'Soy-Ginger Glaze', item: 'Soy sauce', quantity: 30 }),
      expect.objectContaining({ group: 'Meatballs', item: 'Ground chicken', quantity: 450 }),
    ]);
    expect(recipe?.steps[1]).toEqual(
      expect.objectContaining({
        temperature: { unit: 'F', value: 200 },
        timers: [expect.objectContaining({ durationSeconds: 600, label: 'Bake meatballs' })],
      }),
    );
  });

  it('parses generated Recipe Data written as emphasized bullet rows', () => {
    const markdown = groupedMarkdown.replace(
      '| Field | Value |\n| --- | --- |\n| Servings | 4 |\n| Prep time | 15 minutes |\n| Cook time | 20 minutes |',
      '- **Servings:** 4\n- **Prep time:** 15 minutes\n- **Cook time:** 20 minutes\n- **Total time:** 35 minutes',
    );

    expect(structuredRecipeFromMarkdown(markdown, placeholder)?.timing).toEqual({
      prepMinutes: 15,
      cookMinutes: 20,
      totalMinutes: 35,
    });
  });

  it('keeps Markdown timer ids stable when an earlier instruction is inserted', () => {
    const original = structuredRecipeFromMarkdown(groupedMarkdown, placeholder)!;
    const withEarlierStep = structuredRecipeFromMarkdown(
      groupedMarkdown.replace(
        '1. Mix the chicken in a mixing bowl.',
        '1. Wash your hands.\n2. Mix the chicken in a mixing bowl.',
      ),
      placeholder,
    )!;

    expect(original.steps[1].timers[0].id).toBe(withEarlierStep.steps[2].timers[0].id);
  });

  it('replaces a placeholder with canonical Markdown content', () => {
    expect(
      canonicalRecipeFromContent({ markdown: groupedMarkdown, recipe: placeholder }),
    ).toMatchObject({ ingredients: [{ group: 'Soy-Ginger Glaze' }, { group: 'Meatballs' }] });
  });

  it('structures measured bullet ingredients used by simpler external sources', () => {
    const parsed = structuredRecipeFromMarkdown(
      '# Tea\n\n## Recipe Data\n| Total time | 5 minutes |\n\n## Ingredients\n- 2 cups water\n- Salt to taste\n\n## Instructions\n1. Boil the water.',
      placeholder,
    );
    expect(parsed?.ingredients).toEqual([
      expect.objectContaining({ item: 'water', quantity: 2, unit: 'cups' }),
      expect.objectContaining({ item: 'Salt to taste', quantityType: 'estimated' }),
    ]);
  });

  it('reports required recipe fields instead of silently accepting placeholders', () => {
    expect(recipeCompletenessIssues(placeholder)).toEqual([
      'ingredients and instructions',
      'timing',
    ]);
    expect(
      recipeCompletenessIssues(structuredRecipeFromMarkdown(groupedMarkdown, placeholder)!),
    ).toEqual([]);
  });

  it('derives caution metadata and rejects contradicted diet claims', () => {
    const recipe = structuredRecipeFromMarkdown(groupedMarkdown, placeholder)!;
    const facts = deriveRecipeFacts(recipe, groupedMarkdown);
    expect(facts.potentialAllergens.map((item) => item.value)).toEqual(['Soy']);
    expect(facts.equipment.map((item) => item.value)).toContain('Mixing bowl');
    expect(verifiedDietClaims(['vegan', 'gluten free'], recipe)).toEqual(['gluten free']);
  });
});
