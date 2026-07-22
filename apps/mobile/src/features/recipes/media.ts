import { apiUrl } from '@/lib/api/client';
import { tokenVault } from '@/lib/auth/token-vault';

export function authenticatedImageSource(path?: string) {
  if (!path) return undefined;
  const uri = path.startsWith('http://') || path.startsWith('https://') ? path : `${apiUrl}${path}`;
  const token = tokenVault.getAccessToken();
  const cacheKey = uri;
  return token
    ? {
        uri,
        cacheKey,
        headers: { Authorization: `Bearer ${token}` },
      }
    : { uri, cacheKey };
}
