import { splitTimerText, timerTextToMarkdownNodes } from './timerMarkdown';

describe('remarkCookingTimers', () => {
  test('splits timer tokens from ordinary text', () => {
    expect(splitTimerText('Sear for [timer:180] until browned.')).toEqual([
      { type: 'text', value: 'Sear for ' },
      { type: 'timer', seconds: 180 },
      { type: 'text', value: ' until browned.' },
    ]);
  });

  test('supports optional timer labels', () => {
    expect(splitTimerText('Wait [timer:90|Bloom spices].')).toEqual([
      { type: 'text', value: 'Wait ' },
      { type: 'timer', seconds: 90, label: 'Bloom spices' },
      { type: 'text', value: '.' },
    ]);
  });

  test('creates a dedicated markdown node for timer tokens', () => {
    expect(timerTextToMarkdownNodes('Sear for [timer:180] until browned.')).toEqual([
      { type: 'text', value: 'Sear for ' },
      {
        type: 'rekkyTimer',
        data: {
          hName: 'rekky-timer',
          hProperties: { seconds: 180 },
        },
        children: [],
      },
      { type: 'text', value: ' until browned.' },
    ]);
  });
});
