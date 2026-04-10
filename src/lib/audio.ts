export class NeuroReactorAudio {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.lfo = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();

    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 50;

    this.filter.type = 'lowpass';
    this.filter.frequency.value = 200;
    this.filter.Q.value = 5;

    this.lfo.type = 'sine';
    this.lfo.frequency.value = 2; // Alpha/Beta modulation

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);

    this.osc.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    this.osc.start();
    this.lfo.start();
    this.gain.gain.value = 0;
  }

  update(vx: number, vy: number, tq: number, persistence: number, pressure: Float32Array) {
    if (this.ctx.state === 'suspended') this.ctx.resume();

    let speed = Math.sqrt(vx * vx + vy * vy);
    let targetFreq = 50 + speed * 200 + Math.abs(tq) * 100;
    let targetVol = Math.min(0.5, speed * 0.5 + Math.abs(tq) * 0.5);

    this.osc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    this.gain.gain.setTargetAtTime(targetVol * persistence, this.ctx.currentTime, 0.1);

    let totalPressure = pressure.reduce((a, b) => a + b, 0) / 8;
    this.lfo.frequency.setTargetAtTime(2 + totalPressure * 10, this.ctx.currentTime, 0.2);
    this.lfoGain.gain.setTargetAtTime(100 + totalPressure * 500, this.ctx.currentTime, 0.2);
    this.filter.frequency.setTargetAtTime(200 + persistence * 800, this.ctx.currentTime, 0.2);
  }
}
