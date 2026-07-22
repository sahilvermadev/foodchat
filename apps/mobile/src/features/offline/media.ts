import { Image } from 'expo-image';
import type { SocialImport } from 'librechat-data-provider';

import type { RecipeDetail } from '@/features/recipes/types';
import { apiUrl } from '@/lib/api/client';
import { tokenVault } from '@/lib/auth/token-vault';

const absoluteUrl = (path: string) =>
  path.startsWith('http://') || path.startsWith('https://') ? path : `${apiUrl}${path}`;

const thumbnailUrl = (path: string) => {
  const url = absoluteUrl(path);
  if (!url.includes('/illustration')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return url.includes('variant=') ? url : `${url}${separator}variant=thumbnail`;
};

const importThumbnailUrl = (item: SocialImport) => {
  if (!item.thumbnailUrl) return undefined;
  if (item.thumbnailUrl.includes('ytimg.com') || item.thumbnailUrl.includes('youtube.com')) {
    return item.thumbnailUrl;
  }
  return `${apiUrl}/api/social-imports/image-proxy?url=${encodeURIComponent(item.thumbnailUrl)}`;
};

export async function cacheOfflineMedia(recipes: RecipeDetail[], imports: SocialImport[]) {
  const recipeUrls = recipes.flatMap((recipe) =>
    recipe.illustrationUrl
      ? [absoluteUrl(recipe.illustrationUrl), thumbnailUrl(recipe.illustrationUrl)]
      : [],
  );
  const importUrls = imports.map(importThumbnailUrl).filter((url): url is string => Boolean(url));
  const token = tokenVault.getAccessToken();
  await Promise.allSettled([
    recipeUrls.length
      ? Image.prefetch(recipeUrls, {
          cachePolicy: 'disk',
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        })
      : Promise.resolve(true),
    importUrls.length ? Image.prefetch(importUrls, { cachePolicy: 'disk' }) : Promise.resolve(true),
  ]);
}

export async function clearOfflineMedia() {
  await Image.clearDiskCache();
}
