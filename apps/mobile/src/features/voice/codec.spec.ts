import {
  audioLevel,
  extractResponseTranscript,
  float32ToPcm16Base64,
  isSilentResponse,
} from './codec';

describe('voice codec', () => {
  it('encodes clamped float samples as little-endian PCM16', () => {
    expect(float32ToPcm16Base64(new Float32Array([-1, 0, 1]))).toBe('AIAAAP9/');
  });

  it('calculates a normalized input level', () => {
    expect(audioLevel(new Float32Array([0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([1, 1]))).toBe(1);
  });

  it('extracts completed response transcripts', () => {
    expect(
      extractResponseTranscript({
        output: [{ content: [{ transcript: 'Keep stirring.' }, { text: 'Then taste.' }] }],
      }),
    ).toBe('Keep stirring. Then taste.');
  });

  it('recognizes deliberately silent responses', () => {
    expect(isSilentResponse('<silent/>')).toBe(true);
    expect(isSilentResponse('Add a pinch of salt.')).toBe(false);
  });
});
