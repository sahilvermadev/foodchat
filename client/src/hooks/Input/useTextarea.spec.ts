import { shouldUploadPastedFiles } from './useTextarea';

describe('useTextarea file paste policy', () => {
  test('allows pasted files only when uploads are enabled', () => {
    expect(shouldUploadPastedFiles(1, true)).toBe(true);
    expect(shouldUploadPastedFiles(1, false)).toBe(false);
    expect(shouldUploadPastedFiles(0, true)).toBe(false);
  });
});
