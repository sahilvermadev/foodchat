import { parseCaptionTranscript } from './transcript';

describe('social transcript helpers', () => {
  test('parses VTT caption text into a compact transcript', () => {
    const transcript = parseCaptionTranscript(`WEBVTT

00:00:01.000 --> 00:00:03.000
<c>Today we make crispy potatoes</c>

00:00:03.000 --> 00:00:05.000
Today we make crispy potatoes

00:00:05.000 --> 00:00:07.000
Add oil &amp; salt.
`);

    expect(transcript).toBe('Today we make crispy potatoes\nAdd oil & salt.');
  });
});
