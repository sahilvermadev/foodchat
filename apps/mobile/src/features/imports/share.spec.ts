import { extractSharedUrl } from './share';

describe('extractSharedUrl', () => {
  it.each([
    ['YouTube', 'Watch this\nhttps://youtu.be/abc123?t=14', 'https://youtu.be/abc123?t=14'],
    [
      'Instagram',
      'https://www.instagram.com/reel/ABC123/?igsh=share',
      'https://www.instagram.com/reel/ABC123/?igsh=share',
    ],
    ['TikTok', 'Try this: https://vm.tiktok.com/ZM123/.', 'https://vm.tiktok.com/ZM123/'],
    [
      'recipe website',
      'A useful recipe (https://cooking.example.com/tacos).',
      'https://cooking.example.com/tacos',
    ],
  ])('extracts a URL shared from %s', (_, sharedText, expected) => {
    expect(extractSharedUrl([sharedText])).toBe(expected);
  });

  it('uses the first valid URL across payloads', () => {
    expect(extractSharedUrl(['No link here', 'https://example.com/recipe'])).toBe(
      'https://example.com/recipe',
    );
  });

  it('returns an empty string when no web URL is present', () => {
    expect(extractSharedUrl(['Dinner idea', 'rekky://sources'])).toBe('');
  });
});
