export class AudioSyncController {
  private ctx: AudioContext;
  private delay: DelayNode;
  private gain: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private inputs: MediaStreamAudioSourceNode[] = [];
  private _delaySec = 0;

  constructor(ctx: AudioContext, maxDelaySec = 179.999) {
    this.ctx = ctx;
    this.delay = ctx.createDelay(maxDelaySec);
    this.delay.delayTime.value = 0;
    this.gain = ctx.createGain();
    this.gain.gain.value = 1.0;
    this.dest = ctx.createMediaStreamDestination();

    // chain: (mix) -> delay -> gain -> mediaStreamDestination
    this.delay.connect(this.gain).connect(this.dest);
  }

  /** add a remote audio MediaStream (one call per caster) */
  addStream(stream: MediaStream) {
    const src = this.ctx.createMediaStreamSource(stream);
    // simple mix: connect each source into the delay (WebAudio mixes sums)
    src.connect(this.delay);
    this.inputs.push(src);
  }

  /** the single stream you must assign to your <audio> element */
  get outputStream(): MediaStream {
    return this.dest.stream;
  }

  setDelay(sec: number) {
    const d = Math.max(0, Math.min(179.999, sec));
    if (d === this._delaySec) return;
    const t = this.ctx.currentTime;
    // popless: ramp down → set → ramp up
    this.gain.gain.setTargetAtTime(0.0, t, 0.02);
    this.delay.delayTime.setTargetAtTime(d, t + 0.03, 0.03);
    this.gain.gain.setTargetAtTime(1.0, t + 0.08, 0.02);
    this._delaySec = d;
  }

  get delaySec() { return this._delaySec; }
}