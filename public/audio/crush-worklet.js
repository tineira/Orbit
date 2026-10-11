/**
 * Digital distortion for Halley's voice (docs/art/README.md, fase 2).
 * One k-rate knob, `amount` 0..1: bit depth 2^(16 - 12a), sample-and-hold of
 * 1 + floor(a²·14) samples, and every 256 samples a chance a·0.004 of a
 * dropout and a·0.004 of a stutter (repeats ~600 samples back) for 20–80 ms.
 */
class OrbitCrushProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "amount", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" }];
  }

  constructor() {
    super();
    this.held = 0;
    this.count = 0;
    this.mode = 0;
    this.left = 0;
    this.writeIdx = 0;
    this.readIdx = 0;
    this.ring = new Float32Array(2048);
    this.dead = false;
    this.port.onmessage = (e) => {
      if (e.data === "stop") this.dead = true;
    };
  }

  process(inputs, outputs, params) {
    if (this.dead) return false;
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }
    const a = params.amount[0];
    if (a <= 0.001) {
      output.set(input);
      return true;
    }
    const levels = Math.pow(2, 16 - a * 12);
    const hold = 1 + Math.floor(a * a * 14);
    const ring = this.ring;
    for (let n = 0; n < input.length; n++) {
      ring[this.writeIdx] = input[n];
      this.writeIdx = (this.writeIdx + 1) & 2047;
      if (this.left <= 0) {
        const r = Math.random();
        this.mode = r < a * 0.004 ? 1 : r < a * 0.008 ? 2 : 0;
        this.left = this.mode ? Math.floor(sampleRate * (0.02 + Math.random() * 0.06)) : 256;
        if (this.mode === 2) this.readIdx = (this.writeIdx - 600) & 2047;
      }
      this.left--;
      let x = input[n];
      if (this.mode === 1) {
        x = 0;
      } else if (this.mode === 2) {
        x = ring[this.readIdx];
        this.readIdx = (this.readIdx + 1) & 2047;
        const back = (this.writeIdx - 600) & 2047;
        if (((this.readIdx - back) & 2047) > 500) this.readIdx = back;
      }
      if (this.count++ % hold === 0) this.held = Math.round(x * levels) / levels;
      output[n] = this.held;
    }
    return true;
  }
}

registerProcessor("orbit-crush", OrbitCrushProcessor);
