import { canAcceptFileDrop } from './useDragHelpers';

describe('guest file drop policy', () => {
  test('accepts file drops only for authenticated sessions', () => {
    expect(canAcceptFileDrop(true)).toBe(true);
    expect(canAcceptFileDrop(false)).toBe(false);
  });
});
