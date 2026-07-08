export const VIS_FFT_SIZE = 256;
const VIS_BAND_COUNT = 5;
const VIS_BAND_EDGES = [2, 5, 9, 16, 28, 52];
const VIS_ATTACK = 0.6; // weight for new sample on upswing (snappy)
const VIS_RELEASE = 0.18; // weight for new sample on decay (gentle fade)

export class OrbVisualiser {
  private _mic: AnalyserNode;
  private _out: AnalyserNode;
  private _isAiSpeaking: () => boolean;
  private _buf: Uint8Array;
  private _bands: Float32Array;
  private _aiLevel: number;
  private _frame: number | null = null;

  constructor(micAnalyser: AnalyserNode, outAnalyser: AnalyserNode, isAiSpeaking: () => boolean) {
    this._mic = micAnalyser;
    this._out = outAnalyser;
    this._isAiSpeaking = isAiSpeaking;
    this._buf = new Uint8Array(micAnalyser.frequencyBinCount);
    this._bands = new Float32Array(VIS_BAND_COUNT);
    this._aiLevel = 0;
  }

  start(element?: HTMLElement) {
    if (this._frame !== null) return;
    const root = element || document.documentElement;
    const tick = () => {
      this._frame = requestAnimationFrame(tick);
      this._update(root);
    };
    this._frame = requestAnimationFrame(tick);
  }

  stop(element?: HTMLElement) {
    if (this._frame !== null) {
      cancelAnimationFrame(this._frame);
      this._frame = null;
    }
    const root = element || document.documentElement;
    for (let i = 0; i < VIS_BAND_COUNT; i++) root.style.removeProperty(`--bar${i}`);
    root.style.removeProperty('--ai-audio-level');
  }

  private _update(root: HTMLElement) {
    const source = this._isAiSpeaking() ? this._out : this._mic;
    source.getByteFrequencyData(this._buf);

    for (let b = 0; b < VIS_BAND_COUNT; b++) {
      const lo = VIS_BAND_EDGES[b];
      const hi = VIS_BAND_EDGES[b + 1];
      let sum = 0;
      let n = 0;
      for (let i = lo; i < hi && i < this._buf.length; i++) {
        sum += this._buf[i];
        n += 1;
      }
      const target = n > 0 ? sum / (n * 255) : 0;
      const prev = this._bands[b];
      const k = target > prev ? VIS_ATTACK : VIS_RELEASE;
      const next = prev + (target - prev) * k;
      this._bands[b] = next;
      root.style.setProperty(`--bar${b}`, next.toFixed(3));
    }

    this._out.getByteFrequencyData(this._buf);
    let peak = 0;
    const limit = Math.min(this._buf.length, VIS_BAND_EDGES[VIS_BAND_COUNT]);
    for (let i = 0; i < limit; i++) {
      if (this._buf[i] > peak) peak = this._buf[i];
    }
    const aiTarget = peak / 255;
    const k = aiTarget > this._aiLevel ? VIS_ATTACK : VIS_RELEASE;
    this._aiLevel = this._aiLevel + (aiTarget - this._aiLevel) * k;
    root.style.setProperty('--ai-audio-level', this._aiLevel.toFixed(3));
  }
}
