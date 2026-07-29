import { mutationFailureDisposition } from './conflict';

describe('offline mutation failure handling', () => {
  test('retains rejected edits for reconciliation', () => {
    expect(mutationFailureDisposition(400, false)).toBe('conflict');
    expect(mutationFailureDisposition(404, false)).toBe('conflict');
    expect(mutationFailureDisposition(409, false)).toBe('conflict');
  });

  test('treats an already missing delete as resolved', () => {
    expect(mutationFailureDisposition(404, true)).toBe('resolved');
  });

  test('retries transport and server failures', () => {
    expect(mutationFailureDisposition(undefined, false)).toBe('retry');
    expect(mutationFailureDisposition(503, false)).toBe('retry');
  });
});
