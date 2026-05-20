import type { SavedRecipe } from 'librechat-data-provider';

const requestTimeoutMs = 45000;

type ImageGenerationResponse = {
  choices?: Array<{
    message?: {
      images?: Array<{
        image_url?: { url?: string };
        imageUrl?: { url?: string };
      }>;
    };
  }>;
};

export class RecipeIllustrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeIllustrationError';
  }
}

function config() {
  const apiKey = process.env.RECIPE_ILLUSTRATION_API_KEY ?? process.env.OPENROUTER_KEY;
  return {
    apiKey,
    baseUrl: process.env.RECIPE_ILLUSTRATION_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: process.env.RECIPE_ILLUSTRATION_MODEL ?? 'google/gemini-2.5-flash-image',
  };
}

function promptFor(recipe: Pick<SavedRecipe, 'title' | 'shortDescription' | 'documentMarkdown'>) {
  return [
    `Create one editorial cookbook illustration for this saved recipe: ${recipe.title}.`,
    recipe.shortDescription ? `Dish description: ${recipe.shortDescription}.` : '',
    `Recipe excerpt: ${recipe.documentMarkdown.slice(0, 4000)}`,
    '',
    'Visual direction: warm hand-drawn cookbook illustration, loose black ink linework, rich watercolor and gouache washes, textured paper, ingredient-focused composition, charming imperfections, clear silhouette, appetizing but not photorealistic.',
    'Show the finished dish with a few key raw ingredients arranged neatly around it. No labels, no text, no logo, no people, no brand packaging.',
  ]
    .filter(Boolean)
    .join('\n');
}

function imageUrlFrom(body: ImageGenerationResponse): string {
  const image = body.choices?.[0]?.message?.images?.[0];
  const url = image?.image_url?.url ?? image?.imageUrl?.url;
  if (!url || !url.startsWith('data:image/')) {
    throw new RecipeIllustrationError('Recipe illustration returned no image data URL.');
  }
  return url;
}

export async function illustrateRecipe(
  recipe: Pick<SavedRecipe, 'title' | 'shortDescription' | 'documentMarkdown'>,
): Promise<{ illustrationUrl: string; model: string }> {
  const { apiKey, baseUrl, model } = config();
  if (!apiKey) {
    throw new RecipeIllustrationError('Recipe illustration API key is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '4:3',
        image_size: '1K',
      },
      messages: [{ role: 'user', content: promptFor(recipe) }],
      temperature: 0.7,
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new RecipeIllustrationError(`Recipe illustration failed with ${response.status}.`);
  }

  const body = (await response.json()) as ImageGenerationResponse;
  return { illustrationUrl: imageUrlFrom(body), model };
}
