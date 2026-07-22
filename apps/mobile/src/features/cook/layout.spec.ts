import { cookHomeLayout, exploreCardWidth } from './layout';

describe('Cook home responsive layout', () => {
  test.each([
    { frame: { fontScale: 1, height: 568, width: 320 }, compact: true },
    { frame: { fontScale: 1, height: 667, width: 375 }, compact: true },
    { frame: { fontScale: 1, height: 844, width: 390 }, compact: false },
    { frame: { fontScale: 1, height: 932, width: 430 }, compact: false },
  ])('selects the correct density for $frame.width × $frame.height', ({ frame, compact }) => {
    expect(cookHomeLayout(frame)).toEqual({ allowVerticalScroll: false, compact });
  });

  test('allows scrolling only when enlarged text needs an accessibility escape hatch', () => {
    expect(cookHomeLayout({ fontScale: 1.4, height: 844, width: 390 })).toEqual({
      allowVerticalScroll: true,
      compact: false,
    });
  });

  test.each([
    { width: 320, compact: true, expected: 230 },
    { width: 360, compact: true, expected: 244 },
    { width: 390, compact: false, expected: 281 },
    { width: 430, compact: false, expected: 300 },
  ])('keeps a useful next-card cue at $width points', ({ width, compact, expected }) => {
    expect(exploreCardWidth(width, compact)).toBe(expected);
  });
});
