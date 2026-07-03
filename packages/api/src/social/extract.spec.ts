import { extractRecipeFromHtml, recipeLinksFromText } from './extract';

describe('social web recipe extraction', () => {
  test('extracts recipe text from JSON-LD Recipe data', () => {
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <script type="application/ld+json">
            ${JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Recipe',
              name: 'Lemon Rice',
              recipeYield: '4 servings',
              recipeIngredient: ['2 cups cooked rice', '1 lemon, juiced', '1 tsp mustard seeds'],
              recipeInstructions: [
                { '@type': 'HowToStep', text: 'Toast the mustard seeds in oil.' },
                { '@type': 'HowToStep', text: 'Fold in rice and lemon juice.' },
              ],
            })}
          </script>
        </head>
      </html>
    `;

    expect(extractRecipeFromHtml(html)).toEqual({
      title: 'Lemon Rice',
      ingredientCount: 3,
      instructionCount: 2,
      text: [
        'Title: Lemon Rice',
        'Yield: 4 servings',
        'Ingredients:',
        '- 2 cups cooked rice',
        '- 1 lemon, juiced',
        '- 1 tsp mustard seeds',
        '',
        'Instructions:',
        '1. Toast the mustard seeds in oil.',
        '2. Fold in rice and lemon juice.',
      ].join('\n'),
    });
  });

  test('ignores malformed or incomplete recipe blocks', () => {
    const html = `
      <script type="application/ld+json">{bad json</script>
      <script type="application/ld+json">
        {"@type":"Recipe","name":"Idea","recipeIngredient":["salt"],"recipeInstructions":[]}
      </script>
    `;

    expect(extractRecipeFromHtml(html)).toBeUndefined();
  });

  test('prioritizes likely recipe links from social descriptions', () => {
    const links = recipeLinksFromText(`
      COOK the full recipe on https://nickskitchen.com/chipotle-chicken-quesadillas
      SIGN UP at https://www.nickskitchen.com/subscribe
      SHOP at https://www.osmokitchen.com
      Follow me https://www.instagram.com/nickskitchen
    `);

    expect(links[0]).toBe('https://nickskitchen.com/chipotle-chicken-quesadillas');
    expect(links).not.toContain('https://www.instagram.com/nickskitchen');
  });
});
