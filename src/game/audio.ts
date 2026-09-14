import { WARP_BOOM_TIMES } from "./world";

function fillPink(data: Float32Array) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

function makePinkBuffer(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  fillPink(buf.getChannelData(0));
  fillPink(buf.getChannelData(1));
  return buf;
}

/** Sparse dry grains — gravel on a windshield, not a hiss. */
function makeGravelBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let left = 0;
    let amp = 0;
    for (let i = 0; i < length; i++) {
      if (left <= 0 && Math.random() < 8 / sr) {
        left = Math.floor(sr * (0.003 + Math.random() * 0.006));
        amp = 0.55 + Math.random() * 0.45;
        data[i] = (Math.random() < 0.5 ? 1 : -1) * amp;
        left--;
        continue;
      }
      if (left > 0) {
        const u = left / (sr * 0.01);
        data[i] = (Math.random() * 2 - 1) * amp * u * u;
        left--;
      }
    }
  }
  return buf;
}

/** Contact spike: the first few samples of a stone hitting glass. */
function makeContactClick(ctx: AudioContext) {
  const n = 96;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  d[0] = 1;
  d[1] = -0.88;
  d[2] = 0.42;
  d[3] = -0.2;
  for (let i = 4; i < n; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i * 0.16);
  }
  return buf;
}

type HullTickSpec = {
  kind: "dust" | "chip" | "pebble";
  volume: number;
  bright: number;
  ring: number;
  pan: number;
  delay?: number;
};

function tidyNodes(nodes: AudioNode[]) {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already gone */
    }
  }
}

/** Large hail on a car roof: ice crack + short damped thunk. Not a ringing plate. */
function fireHullPlate(
  ctx: AudioContext,
  dest: AudioNode,
  whiteBuf: AudioBuffer,
  clickBuf: AudioBuffer,
  tick: HullTickSpec,
) {
  const t = ctx.currentTime + Math.max(0, tick.delay ?? 0);
  const vol = Math.max(0.0001, Math.min(1, tick.volume));
  const b = Math.max(0, Math.min(1, tick.bright));
  const size = Math.max(0, Math.min(1, tick.ring));
  const nodes: AudioNode[] = [];
  const push = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };

  const pan = push(ctx.createStereoPanner());
  pan.pan.value = Math.max(-1, Math.min(1, tick.pan));
  pan.connect(dest);

  const bus = push(ctx.createGain());
  const fat = push(ctx.createWaveShaper());
  fat.curve = makeDriveCurve();
  fat.oversample = "2x";
  bus.connect(fat);
  fat.connect(pan);

  // Roof vs windshield: bigger stones land heavier on the panel.
  const roof = 0.48 + size * 0.4 + Math.random() * 0.12;
  const tail = 0.065 + size * 0.055;
  const f0 = (118 + (1 - size) * 50 + b * 12) * (0.94 + Math.random() * 0.12);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  const iceHp = push(ctx.createBiquadFilter());
  iceHp.type = "highpass";
  iceHp.frequency.value = 2200 + b * 900;
  const iceLp = push(ctx.createBiquadFilter());
  iceLp.type = "lowpass";
  iceLp.frequency.value = 6200 + b * 1800;
  const iceG = push(ctx.createGain());
  click.playbackRate.value = 0.75 + Math.random() * 0.35;
  iceG.gain.setValueAtTime(vol * (0.45 + (1 - roof) * 1.15 + b * 0.35), t);
  iceG.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
  click.connect(iceHp);
  iceHp.connect(iceLp);
  iceLp.connect(iceG);
  iceG.connect(bus);
  click.start(t);
  click.stop(t + 0.03);
  push(click);

  const src = ctx.createBufferSource();
  src.buffer = whiteBuf;
  push(src);

  const crackBp = push(ctx.createBiquadFilter());
  crackBp.type = "bandpass";
  crackBp.frequency.value = 900 + b * 700;
  crackBp.Q.value = 1.15;
  const crackG = push(ctx.createGain());
  crackG.gain.setValueAtTime(0.0001, t);
  crackG.gain.linearRampToValueAtTime(vol * 1.05, t + 0.002);
  crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
  src.connect(crackBp);
  crackBp.connect(crackG);
  crackG.connect(bus);

  const thunkHp = push(ctx.createBiquadFilter());
  thunkHp.type = "highpass";
  thunkHp.frequency.value = 70;
  const thunkLp = push(ctx.createBiquadFilter());
  thunkLp.type = "lowpass";
  thunkLp.frequency.value = 210 + size * 40;
  const thunkG = push(ctx.createGain());
  thunkG.gain.setValueAtTime(0.0001, t);
  thunkG.gain.linearRampToValueAtTime(vol * (1.15 + roof * 0.7), t + 0.004);
  thunkG.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + size * 0.03);
  src.connect(thunkHp);
  thunkHp.connect(thunkLp);
  thunkLp.connect(thunkG);
  thunkG.connect(bus);

  const tone = (freq: number, peak: number, life: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.88), t + 0.05);
    const g = push(ctx.createGain());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.28), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + life);
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + life + 0.02);
    push(osc);
  };
  tone(f0, vol * (0.85 + roof * 0.55), tail);
  tone(f0 * 1.65, vol * 0.22 * roof, tail * 0.55);

  src.start(t, Math.random() * 0.5);
  src.stop(t + tail + 0.04);
  src.onended = () => tidyNodes(nodes);
}

/** Stone on laminated glass (chip) or sheet metal (pebble). */
function fireHullStone(
  ctx: AudioContext,
  dest: AudioNode,
  whiteBuf: AudioBuffer,
  clickBuf: AudioBuffer,
  tick: HullTickSpec,
) {
  if (tick.kind === "pebble") {
    fireHullPlate(ctx, dest, whiteBuf, clickBuf, tick);
    return;
  }

  const t = ctx.currentTime + Math.max(0, tick.delay ?? 0);
  const micro = tick.kind === "dust";
  const vol = Math.max(0.0001, Math.min(1, tick.volume));
  const b = Math.max(0, Math.min(1, tick.bright));
  const nodes: AudioNode[] = [];
  const push = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };

  const pan = push(ctx.createStereoPanner());
  pan.pan.value = Math.max(-1, Math.min(1, tick.pan));
  pan.connect(dest);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  const clickHp = push(ctx.createBiquadFilter());
  clickHp.type = "highpass";
  clickHp.frequency.value = micro ? 4300 : 3600;
  clickHp.Q.value = 0.75;
  const clickLp = push(ctx.createBiquadFilter());
  clickLp.type = "lowpass";
  clickLp.frequency.value = micro ? 9800 : 12000;
  const clickG = push(ctx.createGain());
  click.playbackRate.value = micro ? 1.05 + Math.random() * 0.55 : 0.92 + Math.random() * 0.4;
  clickG.gain.setValueAtTime(vol * (micro ? 1.65 : 2.35), t);
  clickG.gain.exponentialRampToValueAtTime(0.0001, t + (micro ? 0.0046 : 0.0065));
  click.connect(clickHp);
  clickHp.connect(clickLp);
  clickLp.connect(clickG);
  clickG.connect(pan);
  click.start(t);
  click.stop(t + 0.03);
  push(click);

  const src = ctx.createBufferSource();
  src.buffer = whiteBuf;
  const hp = push(ctx.createBiquadFilter());
  hp.type = "highpass";
  hp.frequency.value = micro ? 3400 + b * 1400 : 2800 + b * 1600;
  hp.Q.value = 0.7;
  const drive = push(ctx.createWaveShaper());
  drive.curve = makeDriveCurve();
  drive.oversample = "2x";
  src.connect(hp);
  hp.connect(drive);
  push(src);

  const jitter = 0.93 + Math.random() * 0.14;
  const f1 = (3200 + b * 2000) * jitter;
  const f2 = f1 * 1.72;
  const ring = 0.012 + b * 0.01;
  const mode = (freq: number, q: number, peak: number, life: number) => {
    const bp = push(ctx.createBiquadFilter());
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = push(ctx.createGain());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.0016);
    g.gain.exponentialRampToValueAtTime(0.0001, t + life);
    drive.connect(bp);
    bp.connect(g);
    g.connect(pan);
  };
  mode(f1, 14, vol * (micro ? 0.1 : 0.18), ring + 0.012);
  mode(f2, 11, vol * (micro ? 0.05 : 0.1), ring * 0.65);

  src.start(t, Math.random() * 0.5);
  src.stop(t + (micro ? 0.032 : 0.05));
  src.onended = () => tidyNodes(nodes);
}

/** Soft wet clacks — river stones, not a shaker. */
function makePebbleBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let stone = 0;
    let grit = 0;
    for (let i = 0; i < length; i++) {
      if (Math.random() < 5 / sr) stone = 0.28 + Math.random() * 0.38;
      if (Math.random() < 8 / sr) grit = 0.04 + Math.random() * 0.08;
      stone *= 0.9995;
      grit *= 0.9988;
      data[i] = (Math.random() * 2 - 1) * (stone + grit);
    }
  }
  return buf;
}

/** Sparse plume pops — Raptor crackle, not pebbles or hiss. */
function makeEngineCrackleBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let pop = 0;
    let thump = 0;
    for (let i = 0; i < length; i++) {
      if (Math.random() < 16 / sr) pop = 0.55 + Math.random() * 0.45;
      if (Math.random() < 3.5 / sr) thump = 0.3 + Math.random() * 0.4;
      pop *= 0.991;
      thump *= 0.9965;
      data[i] = (Math.random() * 2 - 1) * (pop * 0.9 + thump * 0.6);
    }
  }
  return buf;
}

function makeDriveCurve() {
  const n = 257;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.15);
  }
  return curve;
}

function startLoop(ctx: AudioContext, buffer: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

type BlastSpec = {
  at?: number;
  /** Mid crack peak. */
  crack: number;
  /** Crack bandpass Hz. */
  band: number;
  /** Body oscillator start Hz. */
  thump: number;
  /** Sub sine start Hz. */
  sub: number;
  /** Low noise body peak. */
  body: number;
  /** Sub-100 Hz tail peak. */
  rumble: number;
  /** How long the rumble stays audible, seconds. */
  tail: number;
};

let thunderIR: AudioBuffer | null = null;

function getThunderIR(ctx: AudioContext) {
  if (thunderIR && thunderIR.sampleRate === ctx.sampleRate) return thunderIR;
  const sec = 3.6;
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const env = Math.pow(1 - u, 1.12);
      const white = Math.random() * 2 - 1;
      b = (b + 0.028 * white) / 1.028;
      d[i] = b * env * (ch === 0 ? 2.1 : 1.85);
    }
  }
  thunderIR = buf;
  return buf;
}

/** Hang, then a slow fade. Exponential-to-zero dies in a fraction of the tail. */
function hangThenFade(g: AudioParam, t: number, peak: number, hang: number, tail: number) {
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + 0.045);
  g.linearRampToValueAtTime(peak * 0.7, t + hang);
  g.setTargetAtTime(0.0001, t + hang, tail * 0.34);
}

/** Chest bomb — short slam, then a rolling thunder that actually hangs. */
function fireBlast(
  ctx: AudioContext,
  dest: AudioNode,
  whiteBuf: AudioBuffer,
  spec: BlastSpec,
  nodes: AudioNode[],
) {
  const t = ctx.currentTime + (spec.at ?? 0);
  const push = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };
  const tail = spec.tail;
  const hang = Math.min(0.85, tail * 0.22);
  const play = tail + 0.35;
  const subEnd = Math.max(13, spec.sub * 0.28);

  const dry = push(ctx.createGain());
  dry.gain.value = 1;
  dry.connect(dest);

  const conv = push(ctx.createConvolver());
  conv.buffer = getThunderIR(ctx);
  const wetLp = push(ctx.createBiquadFilter());
  wetLp.type = "lowpass";
  wetLp.frequency.value = 220;
  wetLp.Q.value = 0.6;
  const wet = push(ctx.createGain());
  wet.gain.value = 0.72;
  conv.connect(wetLp);
  wetLp.connect(wet);
  wet.connect(dest);

  const thunder = push(ctx.createGain());
  thunder.gain.value = 1;
  thunder.connect(dry);
  thunder.connect(conv);

  const sub = ctx.createOscillator();
  const subG = push(ctx.createGain());
  sub.type = "sine";
  sub.frequency.setValueAtTime(spec.sub, t);
  sub.frequency.exponentialRampToValueAtTime(subEnd, t + tail * 0.92);
  hangThenFade(subG.gain, t, spec.body * 1.05, hang, tail);
  sub.connect(subG);
  subG.connect(thunder);
  sub.start(t);
  sub.stop(t + play);
  push(sub);

  const shock = 0.07;
  const sub2 = ctx.createOscillator();
  const sub2G = push(ctx.createGain());
  sub2.type = "sine";
  sub2.frequency.setValueAtTime(spec.sub * 0.68, t + shock);
  sub2.frequency.exponentialRampToValueAtTime(subEnd * 0.85, t + shock + tail * 0.85);
  hangThenFade(sub2G.gain, t + shock, spec.body * 0.62, hang * 0.9, tail * 0.9);
  sub2.connect(sub2G);
  sub2G.connect(thunder);
  sub2.start(t + shock);
  sub2.stop(t + shock + play);
  push(sub2);

  const thump = ctx.createOscillator();
  const thG = push(ctx.createGain());
  thump.type = "triangle";
  thump.frequency.setValueAtTime(spec.thump, t);
  thump.frequency.exponentialRampToValueAtTime(spec.thump * 0.24, t + 0.9);
  thG.gain.setValueAtTime(spec.crack * 0.9, t);
  thG.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  thump.connect(thG);
  thG.connect(dry);
  thump.start(t);
  thump.stop(t + 0.9);
  push(thump);

  const crack = ctx.createBufferSource();
  crack.buffer = whiteBuf;
  const bp = push(ctx.createBiquadFilter());
  bp.type = "bandpass";
  bp.frequency.value = spec.band;
  bp.Q.value = 0.5;
  const cg = push(ctx.createGain());
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(spec.crack, t + 0.005);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  crack.connect(bp);
  bp.connect(cg);
  cg.connect(dry);
  crack.start(t);
  crack.stop(t + 0.2);
  push(crack);

  const body = ctx.createBufferSource();
  body.buffer = whiteBuf;
  body.loop = true;
  const bodyLp = push(ctx.createBiquadFilter());
  bodyLp.type = "lowpass";
  bodyLp.frequency.value = 210;
  bodyLp.Q.value = 0.7;
  const bg = push(ctx.createGain());
  hangThenFade(bg.gain, t, spec.body * 0.85, hang * 0.75, tail * 0.7);
  body.connect(bodyLp);
  bodyLp.connect(bg);
  bg.connect(thunder);
  body.start(t);
  body.stop(t + play);
  push(body);

  const rumble = ctx.createBufferSource();
  rumble.buffer = whiteBuf;
  rumble.loop = true;
  const lp = push(ctx.createBiquadFilter());
  lp.type = "lowpass";
  lp.frequency.value = 72;
  lp.Q.value = 0.95;
  const rg = push(ctx.createGain());
  hangThenFade(rg.gain, t, spec.rumble, hang, tail);
  rumble.connect(lp);
  lp.connect(rg);
  rg.connect(thunder);
  rumble.start(t);
  rumble.stop(t + play);
  push(rumble);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(4.6, t);
  lfo.frequency.linearRampToValueAtTime(2.4, t + tail);
  const lfoG = push(ctx.createGain());
  lfoG.gain.setValueAtTime(spec.rumble * 0.42, t);
  lfoG.gain.setTargetAtTime(0.0001, t + hang, tail * 0.4);
  lfo.connect(lfoG);
  lfoG.connect(rg.gain);
  lfo.start(t);
  lfo.stop(t + play);
  push(lfo);

  const floor = ctx.createBufferSource();
  floor.buffer = whiteBuf;
  floor.loop = true;
  const floorLp = push(ctx.createBiquadFilter());
  floorLp.type = "lowpass";
  floorLp.frequency.value = 42;
  floorLp.Q.value = 1.05;
  const fg = push(ctx.createGain());
  hangThenFade(fg.gain, t, spec.rumble * 0.7, hang * 1.15, tail * 1.08);
  floor.connect(floorLp);
  floorLp.connect(fg);
  fg.connect(thunder);
  floor.start(t);
  floor.stop(t + play);
  push(floor);
}

type AudioApi = {
  unlock: () => void;
  setThrust: (on: boolean, intensity: number) => void;
  setAtmo: (drag: number) => void;
  setWarp: (on: boolean, intensity: number, pitch?: number) => void;
  setBeltDust: (amount: number, bright?: number) => void;
  hullTick: (tick: {
    kind: "dust" | "chip" | "pebble";
    volume: number;
    bright: number;
    ring: number;
    pan: number;
    delay?: number;
  }) => void;
  setSpectro: (mode: "off" | "idle" | "scan" | "done", scanProgress?: number, reduced?: boolean) => void;
  spectroPing: () => void;
  warpJump: () => void;
  sonicBooms: (times?: readonly number[]) => void;
  bump: (amount: number) => void;
  land: () => void;
  crash: () => void;
  warn: () => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
};

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let thrustGain: GainNode | null = null;
  let rumbleHp: BiquadFilterNode | null = null;
  let rumbleLp: BiquadFilterNode | null = null;
  let rumbleGain: GainNode | null = null;
  let roarHp: BiquadFilterNode | null = null;
  let roarLp: BiquadFilterNode | null = null;
  let roarGain: GainNode | null = null;
  let thrustSub: OscillatorNode | null = null;
  let thrustSubGain: GainNode | null = null;
  let crackleSrc: AudioBufferSourceNode | null = null;
  let crackleFilter: BiquadFilterNode | null = null;
  let crackleDull: BiquadFilterNode | null = null;
  let crackleGain: GainNode | null = null;
  let noiseSrc: AudioBufferSourceNode | null = null;
  let warpSub: OscillatorNode | null = null;
  let warpSubGain: GainNode | null = null;
  let pinkSrc: AudioBufferSourceNode | null = null;
  let pebbleSrc: AudioBufferSourceNode | null = null;
  let spraySrc: AudioBufferSourceNode | null = null;
  let swellLp: BiquadFilterNode | null = null;
  let swellGain: GainNode | null = null;
  let swellLp2: BiquadFilterNode | null = null;
  let swellGain2: GainNode | null = null;
  let sprayLp: BiquadFilterNode | null = null;
  let sprayGain: GainNode | null = null;
  let pebbleFilter: BiquadFilterNode | null = null;
  let pebbleGain: GainNode | null = null;
  let atmoHp: BiquadFilterNode | null = null;
  let atmoLp: BiquadFilterNode | null = null;
  let atmoGain: GainNode | null = null;
  let atmoSprayLp: BiquadFilterNode | null = null;
  let atmoSprayGain: GainNode | null = null;
  let gritHp: BiquadFilterNode | null = null;
  let gritBp: BiquadFilterNode | null = null;
  let gritLp: BiquadFilterNode | null = null;
  let gritGain: GainNode | null = null;
  let specStaticHp: BiquadFilterNode | null = null;
  let specStaticLp: BiquadFilterNode | null = null;
  let specStaticGain: GainNode | null = null;
  let specScanGain: GainNode | null = null;
  let specRf: OscillatorNode | null = null;
  let specRf2: OscillatorNode | null = null;
  let specRfHp: BiquadFilterNode | null = null;
  let specRfLp: BiquadFilterNode | null = null;
  let specRfGain: GainNode | null = null;
  let specMod: OscillatorNode | null = null;
  let specModDepth: GainNode | null = null;
  let specScanHp: BiquadFilterNode | null = null;
  let specScanBp: BiquadFilterNode | null = null;
  let specScanHiss: GainNode | null = null;
  let gravelSrc: AudioBufferSourceNode | null = null;
  let whiteBuf: AudioBuffer | null = null;
  let clickBuf: AudioBuffer | null = null;
  let voidIR: AudioBuffer | null = null;
  let muted = false;
  let thrustOn = false;

  const ensure = () => {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    sfx.gain.value = 0.7;
    sfx.connect(master);
    master.connect(ctx.destination);
    master.gain.value = muted ? 0 : 0.9;

    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;
    // Super Heavy: chest rumble + methane roar + plume crackle.
    // Stays below the atmo hiss (~320 Hz) so they don't blend.
    thrustGain = ctx.createGain();
    thrustGain.gain.value = 0;
    thrustGain.connect(sfx);

    rumbleHp = ctx.createBiquadFilter();
    rumbleHp.type = "highpass";
    rumbleHp.frequency.value = 22;
    rumbleHp.Q.value = 0.5;
    rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = "lowpass";
    rumbleLp.frequency.value = 78;
    rumbleLp.Q.value = 0.9;
    const rumbleDrive = ctx.createWaveShaper();
    rumbleDrive.curve = makeDriveCurve();
    rumbleDrive.oversample = "2x";
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.14;
    noiseSrc.connect(rumbleHp);
    rumbleHp.connect(rumbleLp);
    rumbleLp.connect(rumbleDrive);
    rumbleDrive.connect(rumbleGain);
    rumbleGain.connect(thrustGain);

    roarHp = ctx.createBiquadFilter();
    roarHp.type = "highpass";
    roarHp.frequency.value = 55;
    roarHp.Q.value = 0.55;
    roarLp = ctx.createBiquadFilter();
    roarLp.type = "lowpass";
    roarLp.frequency.value = 210;
    roarLp.Q.value = 0.75;
    roarGain = ctx.createGain();
    roarGain.gain.value = 0.1;
    noiseSrc.connect(roarHp);
    roarHp.connect(roarLp);
    roarLp.connect(roarGain);
    roarGain.connect(thrustGain);

    thrustSub = ctx.createOscillator();
    thrustSub.type = "sine";
    thrustSub.frequency.value = 28;
    thrustSubGain = ctx.createGain();
    thrustSubGain.gain.value = 0.022;
    thrustSub.connect(thrustSubGain);
    thrustSubGain.connect(thrustGain);
    thrustSub.start();

    crackleSrc = startLoop(ctx, makeEngineCrackleBuffer(ctx, 3.4));
    crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "bandpass";
    crackleFilter.frequency.value = 240;
    crackleFilter.Q.value = 0.55;
    crackleDull = ctx.createBiquadFilter();
    crackleDull.type = "lowpass";
    crackleDull.frequency.value = 520;
    crackleDull.Q.value = 0.5;
    crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.04;
    crackleSrc.connect(crackleFilter);
    crackleFilter.connect(crackleDull);
    crackleDull.connect(crackleGain);
    crackleGain.connect(thrustGain);

    noiseSrc.start();

    whiteBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    const white = whiteBuf.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;

    // High-speed rush: ocean swell + river stones. No bandpass sweep, no
    // rising tone — those two were the vacuum / hair-dryer.
    warpSub = ctx.createOscillator();
    warpSub.type = "sine";
    warpSub.frequency.value = 36;
    warpSubGain = ctx.createGain();
    warpSubGain.gain.value = 0;
    warpSub.connect(warpSubGain);
    warpSubGain.connect(sfx);
    warpSub.start();

    pinkSrc = startLoop(ctx, makePinkBuffer(ctx, 2.8));
    pebbleSrc = startLoop(ctx, makePebbleBuffer(ctx, 3.6));
    spraySrc = startLoop(ctx, whiteBuf);

    const swellHp = ctx.createBiquadFilter();
    swellHp.type = "highpass";
    swellHp.frequency.value = 55;
    swellHp.Q.value = 0.5;
    swellLp = ctx.createBiquadFilter();
    swellLp.type = "lowpass";
    swellLp.frequency.value = 260;
    swellLp.Q.value = 0.5;
    const swellGate = ctx.createBiquadFilter();
    swellGate.type = "lowpass";
    swellGate.frequency.value = 520;
    swellGate.Q.value = 0.55;
    swellGain = ctx.createGain();
    swellGain.gain.value = 0;
    pinkSrc.connect(swellHp);
    swellHp.connect(swellLp);
    swellLp.connect(swellGate);
    swellGate.connect(swellGain);
    swellGain.connect(sfx);

    const swellHp2 = ctx.createBiquadFilter();
    swellHp2.type = "highpass";
    swellHp2.frequency.value = 48;
    swellHp2.Q.value = 0.5;
    swellLp2 = ctx.createBiquadFilter();
    swellLp2.type = "lowpass";
    swellLp2.frequency.value = 200;
    swellLp2.Q.value = 0.5;
    swellGain2 = ctx.createGain();
    swellGain2.gain.value = 0;
    pinkSrc.connect(swellHp2);
    swellHp2.connect(swellLp2);
    swellLp2.connect(swellGain2);
    swellGain2.connect(sfx);

    const sprayHp = ctx.createBiquadFilter();
    sprayHp.type = "highpass";
    sprayHp.frequency.value = 420;
    sprayHp.Q.value = 0.5;
    sprayLp = ctx.createBiquadFilter();
    sprayLp.type = "lowpass";
    sprayLp.frequency.value = 900;
    sprayLp.Q.value = 0.5;
    sprayGain = ctx.createGain();
    sprayGain.gain.value = 0;
    spraySrc.connect(sprayHp);
    sprayHp.connect(sprayLp);
    sprayLp.connect(sprayGain);
    sprayGain.connect(sfx);

    pebbleFilter = ctx.createBiquadFilter();
    pebbleFilter.type = "bandpass";
    pebbleFilter.frequency.value = 420;
    pebbleFilter.Q.value = 0.4;
    const pebbleDull = ctx.createBiquadFilter();
    pebbleDull.type = "lowpass";
    pebbleDull.frequency.value = 800;
    pebbleDull.Q.value = 0.5;
    pebbleGain = ctx.createGain();
    pebbleGain.gain.value = 0;
    pebbleSrc.connect(pebbleFilter);
    pebbleFilter.connect(pebbleDull);
    pebbleDull.connect(pebbleGain);
    pebbleGain.connect(sfx);

    // Hull wind: mid hiss + buffeting. Starts ~drag 0.1, dense near 0.4.
    // Highpass keeps it out of the warp bass swell.
    atmoHp = ctx.createBiquadFilter();
    atmoHp.type = "highpass";
    atmoHp.frequency.value = 320;
    atmoHp.Q.value = 0.5;
    atmoLp = ctx.createBiquadFilter();
    atmoLp.type = "lowpass";
    atmoLp.frequency.value = 1680;
    atmoLp.Q.value = 0.5;
    atmoGain = ctx.createGain();
    atmoGain.gain.value = 0;
    pinkSrc.connect(atmoHp);
    atmoHp.connect(atmoLp);
    atmoLp.connect(atmoGain);
    atmoGain.connect(sfx);

    const atmoSprayHp = ctx.createBiquadFilter();
    atmoSprayHp.type = "highpass";
    atmoSprayHp.frequency.value = 1800;
    atmoSprayHp.Q.value = 0.5;
    atmoSprayLp = ctx.createBiquadFilter();
    atmoSprayLp.type = "lowpass";
    atmoSprayLp.frequency.value = 3400;
    atmoSprayLp.Q.value = 0.45;
    atmoSprayGain = ctx.createGain();
    atmoSprayGain.gain.value = 0;
    spraySrc.connect(atmoSprayHp);
    atmoSprayHp.connect(atmoSprayLp);
    atmoSprayLp.connect(atmoSprayGain);
    atmoSprayGain.connect(sfx);

    clickBuf = makeContactClick(ctx);
    gravelSrc = startLoop(ctx, makeGravelBuffer(ctx, 2.6));
    gritHp = ctx.createBiquadFilter();
    gritHp.type = "highpass";
    gritHp.frequency.value = 2200;
    gritHp.Q.value = 0.65;
    gritBp = ctx.createBiquadFilter();
    gritBp.type = "bandpass";
    gritBp.frequency.value = 3400;
    gritBp.Q.value = 1.7;
    gritLp = ctx.createBiquadFilter();
    gritLp.type = "lowpass";
    gritLp.frequency.value = 7800;
    gritLp.Q.value = 0.55;
    gritGain = ctx.createGain();
    gritGain.gain.value = 0;
    gravelSrc.connect(gritHp);
    gritHp.connect(gritBp);
    gritBp.connect(gritLp);
    gritLp.connect(gritGain);
    gritGain.connect(sfx);

    // Mass spec: high hiss when the panel is on. A lock reads as a low
    // motor vibration (detuned squares + AM), not a flute sweep.
    specStaticHp = ctx.createBiquadFilter();
    specStaticHp.type = "highpass";
    specStaticHp.frequency.value = 2200;
    specStaticHp.Q.value = 0.55;
    specStaticLp = ctx.createBiquadFilter();
    specStaticLp.type = "lowpass";
    specStaticLp.frequency.value = 6400;
    specStaticLp.Q.value = 0.5;
    specStaticGain = ctx.createGain();
    specStaticGain.gain.value = 0;
    pinkSrc.connect(specStaticHp);
    specStaticHp.connect(specStaticLp);
    specStaticLp.connect(specStaticGain);
    specStaticGain.connect(sfx);

    specScanGain = ctx.createGain();
    specScanGain.gain.value = 0;
    specScanGain.connect(sfx);
    specRfHp = ctx.createBiquadFilter();
    specRfHp.type = "highpass";
    specRfHp.frequency.value = 70;
    specRfHp.Q.value = 0.7;
    specRfLp = ctx.createBiquadFilter();
    specRfLp.type = "lowpass";
    specRfLp.frequency.value = 720;
    specRfLp.Q.value = 0.85;
    specRfGain = ctx.createGain();
    specRfGain.gain.value = 0.2;
    specRf = ctx.createOscillator();
    specRf.type = "square";
    specRf.frequency.value = 128;
    specRf2 = ctx.createOscillator();
    specRf2.type = "square";
    specRf2.frequency.value = 136;
    specRf.connect(specRfHp);
    specRf2.connect(specRfHp);
    specRfHp.connect(specRfLp);
    specRfLp.connect(specRfGain);
    specRfGain.connect(specScanGain);
    specMod = ctx.createOscillator();
    specMod.type = "triangle";
    specMod.frequency.value = 18;
    specModDepth = ctx.createGain();
    specModDepth.gain.value = 0.12;
    specMod.connect(specModDepth);
    specModDepth.connect(specRfGain.gain);
    specRf.start();
    specRf2.start();
    specMod.start();
    specScanHp = ctx.createBiquadFilter();
    specScanHp.type = "highpass";
    specScanHp.frequency.value = 900;
    specScanHp.Q.value = 0.5;
    specScanBp = ctx.createBiquadFilter();
    specScanBp.type = "bandpass";
    specScanBp.frequency.value = 1800;
    specScanBp.Q.value = 1.4;
    specScanHiss = ctx.createGain();
    specScanHiss.gain.value = 0.28;
    pinkSrc.connect(specScanHp);
    specScanHp.connect(specScanBp);
    specScanBp.connect(specScanHiss);
    specScanHiss.connect(specScanGain);
  };

  const unlock = () => {
    ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  };

  const onVis = () => {
    if (!document.hidden) unlock();
  };
  const onGesture = () => unlock();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);

  return {
    unlock,
    setMuted(next) {
      muted = next;
      if (master && ctx) {
        master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.04);
      }
    },
    setThrust(on, intensity) {
      if (!ctx || !thrustGain || !rumbleLp || !roarLp || !crackleFilter || !thrustSub) return;
      if (!rumbleGain || !roarGain || !thrustSubGain || !crackleGain) return;
      thrustOn = on;
      const t = ctx.currentTime;
      const u = Math.max(0, Math.min(1, intensity));
      thrustGain.gain.setTargetAtTime(on ? 0.72 + u * 0.28 : 0, t, 0.05);
      if (on) {
        rumbleLp.frequency.setTargetAtTime(68 + u * 42, t, 0.1);
        rumbleGain.gain.setTargetAtTime(0.16 + u * 0.06, t, 0.08);
        roarLp.frequency.setTargetAtTime(180 + u * 90, t, 0.1);
        roarGain.gain.setTargetAtTime(0.08 + u * 0.055, t, 0.08);
        thrustSub.frequency.setTargetAtTime(26 + u * 6, t, 0.12);
        thrustSubGain.gain.setTargetAtTime(0.02 + u * 0.014, t, 0.1);
        crackleFilter.frequency.setTargetAtTime(210 + u * 80, t, 0.12);
        crackleGain.gain.setTargetAtTime(0.045 + u * 0.05, t, 0.1);
      }
      void thrustOn;
    },
    setAtmo(drag) {
      if (!ctx || !atmoHp || !atmoLp || !atmoGain || !atmoSprayLp || !atmoSprayGain) return;
      const t = ctx.currentTime;
      const d = Math.max(0, drag);
      const u = d <= 0.1 ? 0 : Math.min(1, (d - 0.1) / 0.32);
      if (u <= 0.001) {
        atmoGain.gain.setTargetAtTime(0, t, 0.08);
        atmoSprayGain.gain.setTargetAtTime(0, t, 0.08);
        return;
      }
      const buffetAmt = 0.08 + u * 0.16;
      const b1 = 0.5 + 0.5 * Math.sin(t * 22.4);
      const b2 = 0.5 + 0.5 * Math.sin(t * 41.7 + 1.3);
      const buffet = 1 - buffetAmt + buffetAmt * (0.35 + 0.65 * b1 * b2);
      const spray = Math.max(0, (u - 0.45) / 0.55);
      atmoGain.gain.setTargetAtTime((0.03 + u * 0.05) * buffet, t, 0.06);
      atmoSprayGain.gain.setTargetAtTime(spray * spray * 0.02 * buffet, t, 0.08);
      atmoHp.frequency.setTargetAtTime(320 - u * 140, t, 0.12);
      atmoLp.frequency.setTargetAtTime(1680 - u * 1080, t, 0.1);
      atmoSprayLp.frequency.setTargetAtTime(3200 - spray * 1400, t, 0.12);
    },
    setBeltDust(amount, bright) {
      if (!ctx || !gritHp || !gritBp || !gritLp || !gritGain) return;
      const t = ctx.currentTime;
      const u = Math.max(0, Math.min(1, amount));
      const b = Math.max(0, Math.min(1, bright ?? 0.4));
      gritGain.gain.setTargetAtTime(u > 0.02 ? 0.03 + u * 0.08 : 0, t, 0.045);
      if (u > 0.02) {
        gritHp.frequency.setTargetAtTime(1800 + b * 1400, t, 0.1);
        gritBp.frequency.setTargetAtTime(3000 + b * 1600, t, 0.1);
        gritLp.frequency.setTargetAtTime(6200 + b * 2800, t, 0.1);
      }
    },
    hullTick(tick) {
      if (!ctx || !sfx || !whiteBuf || !clickBuf) return;
      fireHullStone(ctx, sfx, whiteBuf, clickBuf, tick);
    },
    setSpectro(mode, scanProgress = 0, reduced = false) {
      if (!ctx || !specStaticGain || !specScanGain || !specRf || !specRf2 || !specScanBp) return;
      if (!specMod || !specRfLp) return;
      const t = ctx.currentTime;
      const hush = (reduced ? 0.55 : 1) * (2 / 3);
      const idle = 0.012 * hush;
      const done = 0.0045 * hush;
      const scanBed = (0.028 + Math.max(0, Math.min(1, scanProgress)) * 0.01) * hush;
      const p = Math.max(0, Math.min(1, scanProgress));
      if (mode === "off") {
        specStaticGain.gain.setTargetAtTime(0, t, 0.08);
        specScanGain.gain.setTargetAtTime(0, t, 0.08);
        specRf.frequency.setTargetAtTime(128, t, 0.2);
        specRf2.frequency.setTargetAtTime(136, t, 0.2);
        specMod.frequency.setTargetAtTime(18, t, 0.2);
        return;
      }
      if (mode === "scan") {
        specStaticGain.gain.setTargetAtTime(0.0008 * hush, t, 0.07);
        specScanGain.gain.setTargetAtTime(scanBed, t, 0.1);
        specRf.frequency.setTargetAtTime(118 + p * 92, t, 0.14);
        specRf2.frequency.setTargetAtTime(126 + p * 92, t, 0.14);
        specMod.frequency.setTargetAtTime(16.5 + p * 10, t, 0.12);
        specRfLp.frequency.setTargetAtTime(560 + p * 380, t, 0.14);
        specScanBp.frequency.setTargetAtTime(1400 + p * 1400, t, 0.16);
        return;
      }
      specScanGain.gain.setTargetAtTime(0, t, 0.1);
      specStaticGain.gain.setTargetAtTime(mode === "done" ? done : idle, t, 0.12);
      specRf.frequency.setTargetAtTime(128, t, 0.2);
      specRf2.frequency.setTargetAtTime(136, t, 0.2);
      specMod.frequency.setTargetAtTime(18, t, 0.2);
    },
    spectroPing() {
      ensure();
      if (!ctx || !sfx) return;
      void ctx.resume();
      const t = ctx.currentTime;
      const chirp = (type: OscillatorType, freq: number, at: number, dur: number, gain: number) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t + at);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.78, t + at + dur);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(gain, t + at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        osc.connect(g);
        g.connect(sfx!);
        osc.start(t + at);
        osc.stop(t + at + dur + 0.02);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      };
      chirp("square", 1680, 0, 0.05, 0.032);
      chirp("square", 920, 0.04, 0.09, 0.024);
    },
    setWarp(on, intensity, pitch) {
      if (
        !ctx ||
        !warpSub ||
        !warpSubGain ||
        !swellLp ||
        !swellGain ||
        !swellLp2 ||
        !swellGain2 ||
        !sprayLp ||
        !sprayGain ||
        !pebbleFilter ||
        !pebbleGain
      )
        return;
      const t = ctx.currentTime;
      const vol = on ? Math.max(0, Math.min(1, intensity)) : 0;
      const c = Math.max(0, Math.min(1, pitch ?? intensity));
      // Slow overlapping swells. Depth falls with speed so a full rush
      // reads as a river, not a pulsing beach.
      const motion = 0.36 * (1 - c * 0.55);
      const w1 = 0.5 + 0.5 * Math.sin(t * (0.82 + c * 0.28));
      const w2 = 0.5 + 0.5 * Math.sin(t * (0.53 + c * 0.18) + 2.05);
      const w3 = 0.5 + 0.5 * Math.sin(t * (1.14 + c * 0.22) + 0.7);
      const swellA = 1 - motion + motion * (0.45 + 0.55 * w1 * w2);
      const swellB = 1 - motion + motion * (0.42 + 0.58 * w3 * (0.35 + 0.65 * w1));
      const foam = Math.max(0.15, swellA * 1.12 - 0.12);
      warpSubGain.gain.setTargetAtTime(vol > 0 ? (0.028 + c * 0.04) * vol : 0, t, 0.08);
      swellGain.gain.setTargetAtTime(vol > 0 ? (0.18 + c * 0.22) * vol * swellA : 0, t, 0.1);
      swellGain2.gain.setTargetAtTime(vol > 0 ? (0.12 + c * 0.16) * vol * swellB : 0, t, 0.11);
      sprayGain.gain.setTargetAtTime(vol > 0 ? (0.012 + c * 0.028) * vol * foam : 0, t, 0.12);
      pebbleGain.gain.setTargetAtTime(vol > 0 ? (0.01 + c * c * 0.028) * vol : 0, t, 0.1);
      if (vol > 0.001) {
        warpSub.frequency.setTargetAtTime(34 + c * 12, t, 0.1);
        swellLp.frequency.setTargetAtTime(180 + c * 120 + w1 * (40 + c * 50), t, 0.14);
        swellLp2.frequency.setTargetAtTime(140 + c * 90 + w3 * (30 + c * 40), t, 0.16);
        sprayLp.frequency.setTargetAtTime(720 + c * 220 + foam * 80, t, 0.14);
        pebbleFilter.frequency.setTargetAtTime(360 + c * 220, t, 0.16);
      }
    },
    warpJump() {
      ensure();
      if (!ctx || !sfx || !whiteBuf) return;
      void ctx.resume();
      const nodes: AudioNode[] = [];
      const tidy = () => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* already gone */
          }
        }
      };

      if (!voidIR) {
        const sec = 3.8;
        const len = Math.floor(ctx.sampleRate * sec);
        voidIR = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = voidIR.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            const u = i / len;
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 1.2) * (ch === 0 ? 1 : 0.88);
          }
        }
      }

      const hit = ctx.createGain();
      hit.gain.value = 1;
      const dry = ctx.createGain();
      dry.gain.value = 1;
      hit.connect(dry);
      dry.connect(sfx);
      nodes.push(hit, dry);

      const conv = ctx.createConvolver();
      conv.buffer = voidIR;
      const wetLp = ctx.createBiquadFilter();
      wetLp.type = "lowpass";
      wetLp.frequency.value = 900;
      wetLp.Q.value = 0.5;
      const wet = ctx.createGain();
      wet.gain.value = 0.48;
      hit.connect(conv);
      conv.connect(wetLp);
      wetLp.connect(wet);
      wet.connect(sfx);
      nodes.push(conv, wetLp, wet);

      fireBlast(ctx, hit, whiteBuf, {
        crack: 0.88,
        band: 520,
        thump: 68,
        sub: 46,
        body: 0.62,
        rumble: 0.55,
        tail: 3.4,
      }, nodes);

      window.setTimeout(tidy, 7800);
    },
    sonicBooms(times: readonly number[] = WARP_BOOM_TIMES) {
      ensure();
      if (!ctx || !sfx || !whiteBuf) return;
      void ctx.resume();
      const nodes: AudioNode[] = [];
      const hits: BlastSpec[] = [
        { crack: 0.82, band: 480, thump: 64, sub: 44, body: 0.58, rumble: 0.5, tail: 3.0 },
        { crack: 0.74, band: 620, thump: 56, sub: 38, body: 0.5, rumble: 0.44, tail: 2.7 },
        { crack: 0.95, band: 420, thump: 72, sub: 50, body: 0.68, rumble: 0.6, tail: 3.6 },
      ];
      let longest = 0;
      for (let i = 0; i < times.length; i++) {
        const spec = hits[i] ?? hits[hits.length - 1]!;
        const at = times[i]!;
        fireBlast(ctx, sfx, whiteBuf, { ...spec, at }, nodes);
        longest = Math.max(longest, at + spec.tail);
      }
      window.setTimeout(() => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* already gone */
          }
        }
      }, (longest + 4.2) * 1000);
    },
    bump(amount) {
      if (!ctx || !sfx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(90 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      g.gain.setValueAtTime(Math.min(0.28, 0.08 + amount * 0.2), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g);
      g.connect(sfx);
      osc.start(t);
      osc.stop(t + 0.22);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    },
    land() {
      if (!ctx || !sfx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(52, t + 0.32);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g);
      g.connect(sfx);
      osc.start(t);
      osc.stop(t + 0.36);
    },
    warn() {
      if (!ctx || !sfx) return;
      const t = ctx.currentTime;
      const chirp = (freq: number, at: number, dur: number, gain: number) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, t + at);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(gain, t + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        osc.connect(g);
        g.connect(sfx!);
        osc.start(t + at);
        osc.stop(t + at + dur + 0.02);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      };
      chirp(880, 0, 0.11, 0.09);
      chirp(520, 0.14, 0.16, 0.11);
    },
    crash() {
      if (!ctx || !sfx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(70, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.55);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
      osc.connect(g);
      g.connect(sfx);
      osc.start(t);
      osc.stop(t + 0.6);
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(180, t);
      osc2.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc2.connect(g2);
      g2.connect(sfx);
      osc2.start(t);
      osc2.stop(t + 0.22);
    },
    destroy() {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      try {
        noiseSrc?.stop();
        pinkSrc?.stop();
        pebbleSrc?.stop();
        spraySrc?.stop();
        crackleSrc?.stop();
        gravelSrc?.stop();
        specRf?.stop();
        specRf2?.stop();
        specMod?.stop();
      } catch {
        /* ignore */
      }
      try {
        warpSub?.stop();
        thrustSub?.stop();
      } catch {
        /* ignore */
      }
      void ctx?.close();
      ctx = null;
    },
  };
}
