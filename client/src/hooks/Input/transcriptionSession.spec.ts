import { composeBrowserTranscript, createTranscriptionSession } from './transcriptionSession';

describe('transcription session', () => {
  test('keeps finalized words visible while a new interim phrase arrives', () => {
    expect(composeBrowserTranscript('I need dinner today', '')).toBe('I need dinner today');
    expect(composeBrowserTranscript('I need dinner today', 'with mushrooms')).toBe(
      'I need dinner today with mushrooms',
    );
  });

  test('preserves text that existed before recording began', () => {
    const session = createTranscriptionSession('Make it vegetarian');

    expect(session.display('and spicy')).toBe('Make it vegetarian and spicy');
    expect(session.complete('and spicy')).toBe('Make it vegetarian and spicy');
  });

  test('normalizes boundaries without changing words inside the transcription', () => {
    const session = createTranscriptionSession('  Existing request  ');

    expect(session.display('  plus this phrase  ')).toBe('Existing request plus this phrase');
  });
});
