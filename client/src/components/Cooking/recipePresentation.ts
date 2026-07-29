import type { SavedRecipe } from 'librechat-data-provider';
import {
  canonicalEquipmentName,
  deriveRecipeFacts,
  verifiedDietClaims,
} from 'librechat-data-provider';

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function uniqueRecipeValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function displayRecipeTag(value: string): string {
  return value.replace(/_/g, ' ');
}

export function recipeSourceLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    if (hostname === 'youtube.com' || hostname === 'youtu.be') return 'YouTube';
    if (hostname === 'cooking.nytimes.com') return 'NYT Cooking';
    if (hostname === 'nytimes.com') return 'New York Times';
    if (hostname === 'instagram.com') return 'Instagram';
    if (hostname === 'tiktok.com') return 'TikTok';
    return hostname;
  } catch {
    return 'Source';
  }
}

export type SavedRecipePresentation = {
  allergens: string[];
  detailTags: string[];
  diets: string[];
  equipment: string[];
  primaryTags: string[];
};

export function savedRecipePresentation(recipe?: SavedRecipe | null): SavedRecipePresentation {
  if (!recipe) {
    return { allergens: [], detailTags: [], diets: [], equipment: [], primaryTags: [] };
  }

  const categorization = recipe.categorization;
  const facts = recipe.recipe
    ? deriveRecipeFacts(recipe.recipe, recipe.documentMarkdown)
    : undefined;
  const diets = recipe.recipe
    ? verifiedDietClaims(categorization?.diet ?? recipe.recipe.tags, recipe.recipe)
    : [];
  const primaryTags = uniqueRecipeValues([
    ...stringValues(categorization?.cuisine),
    ...stringValues(categorization?.mealType),
    ...stringValues(categorization?.dishType),
  ]).slice(0, 4);
  const primaryTagSet = new Set([...primaryTags, ...diets]);
  const detailTags = uniqueRecipeValues([
    ...stringValues(categorization?.occasion),
    ...stringValues(categorization?.mainIngredients),
    ...stringValues(categorization?.techniques),
    ...stringValues(categorization?.flavorProfile),
    categorization?.difficulty ?? '',
    categorization?.timeBucket ?? '',
  ])
    .filter((tag) => !primaryTagSet.has(tag))
    .slice(0, 8);

  return {
    allergens: uniqueRecipeValues([
      ...stringValues(categorization?.potentialAllergens),
      ...(facts?.potentialAllergens.map((item) => item.value) ?? []),
    ]),
    detailTags,
    diets,
    equipment: uniqueRecipeValues(
      [
        ...stringValues(categorization?.equipment),
        ...(recipe.recipe?.equipment ?? []),
        ...(facts?.equipment.map((item) => item.value) ?? []),
      ].map(canonicalEquipmentName),
    ).slice(0, 10),
    primaryTags,
  };
}
