const sharedUrlPattern = /https?:\/\/[^\s<>"']+/gi;
const trailingPunctuation = /[),.;!?\]}]+$/;

export function extractSharedUrl(values: Array<string | undefined>) {
  for (const value of values) {
    const candidates = value?.match(sharedUrlPattern) ?? [];
    for (const candidate of candidates) {
      const url = candidate.replace(trailingPunctuation, '');
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
      } catch {
        continue;
      }
    }
  }
  return '';
}
