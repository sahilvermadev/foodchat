type BrowserAudioContext = typeof AudioContext;
let preparedAudioContext: AudioContext | undefined;

function timerAudioContext(): AudioContext | undefined {
  if (preparedAudioContext) return preparedAudioContext;
  const AudioContextCtor = (window.AudioContext ||
    (window as Window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext) as
    | BrowserAudioContext
    | undefined;
  if (!AudioContextCtor) return undefined;
  preparedAudioContext = new AudioContextCtor();
  return preparedAudioContext;
}

export function prepareTimerAlarm() {
  const audioContext = timerAudioContext();
  void audioContext?.resume?.();
}

export function playTimerCompleteAlarm() {
  const audioCtx = timerAudioContext();
  if (!audioCtx) return;
  void audioCtx.resume?.();
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
  compressor.knee.setValueAtTime(16, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0.004, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.18, audioCtx.currentTime);
  compressor.connect(audioCtx.destination);

  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.72, audioCtx.currentTime);
  masterGain.connect(compressor);

  const playTone = (startTime: number, frequency: number, duration: number, peakGain: number) => {
    const oscillator = audioCtx.createOscillator();
    const harmonic = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const harmonicGain = audioCtx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.012, startTime + duration);
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(frequency * 2, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    harmonicGain.gain.setValueAtTime(0.0001, startTime);
    harmonicGain.gain.linearRampToValueAtTime(peakGain * 0.18, startTime + 0.016);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.72);
    oscillator.connect(gain);
    gain.connect(masterGain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.04);
    harmonic.start(startTime);
    harmonic.stop(startTime + duration + 0.04);
  };

  const start = audioCtx.currentTime + 0.04;
  [
    [0, 659.25, 0.16, 0.34],
    [0.18, 880, 0.18, 0.42],
    [0.4, 1174.66, 0.26, 0.36],
    [0.86, 659.25, 0.16, 0.32],
    [1.04, 880, 0.18, 0.4],
    [1.26, 1318.51, 0.32, 0.36],
  ].forEach(([offset, frequency, duration, peakGain]) =>
    playTone(start + offset, frequency, duration, peakGain),
  );

  navigator.vibrate?.([70, 40, 90]);
  window.setTimeout(() => {
    void audioCtx.close();
    if (preparedAudioContext === audioCtx) preparedAudioContext = undefined;
  }, 2200);
}
