import { Image } from 'expo-image';
import type { SocialImport } from 'librechat-data-provider';

import type { RecipeDetail } from '@/features/recipes/types';
import { apiUrl } from '@/lib/api/client';
import { tokenVault } from '@/lib/auth/token-vault';
import { offlineDatabase } from './database';

const MAX_OFFLINE_MEDIA = 400;

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

async function markMedia(userId: string, url: string, status: 'available' | 'failed') {
  const db = await offlineDatabase();
  await db.runAsync(
    `INSERT INTO offline_media (user_id, url, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, url) DO UPDATE SET
       status = excluded.status,
       updated_at = excluded.updated_at`,
    userId,
    url,
    status,
    new Date().toISOString(),
  );
}

async function enforceMediaBudget(userId: string) {
  const db = await offlineDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM offline_media WHERE user_id = ?',
    userId,
  );
  if ((row?.count ?? 0) <= MAX_OFFLINE_MEDIA * 1.5) return;
  await Image.clearDiskCache();
  await db.runAsync('DELETE FROM offline_media WHERE user_id = ?', userId);
}

export async function cacheOfflineMedia(
  userId: string,
  recipes: RecipeDetail[],
  imports: SocialImport[],
) {
  const recipeUrls = recipes.flatMap((recipe) =>
    recipe.illustrationUrl
      ? [absoluteUrl(recipe.illustrationUrl), thumbnailUrl(recipe.illustrationUrl)]
      : [],
  );
  const importUrls = imports.map(importThumbnailUrl).filter((url): url is string => Boolean(url));
  const token = tokenVault.getAccessToken();
  await enforceMediaBudget(userId);
  const urls = [...new Set([...recipeUrls, ...importUrls])].slice(0, MAX_OFFLINE_MEDIA);
  const protectedUrls = new Set(recipeUrls);
  const cache = async (url: string) => {
    try {
      const recipeUrl = protectedUrls.has(url);
      const available = await Image.prefetch(url, {
        cachePolicy: 'disk',
        ...(recipeUrl && token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
      await markMedia(userId, url, available ? 'available' : 'failed');
    } catch {
      await markMedia(userId, url, 'failed');
    }
  };
  for (let index = 0; index < urls.length; index += 8) {
    await Promise.all(urls.slice(index, index + 8).map(cache));
  }
}

export async function clearOfflineMedia() {
  await Image.clearDiskCache();
}
