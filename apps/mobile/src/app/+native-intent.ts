export function redirectSystemPath({ path }: { initial: boolean; path: string }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/sources';
    return path;
  } catch {
    return '/';
  }
}
