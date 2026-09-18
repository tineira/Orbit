import { WARP_BOOM_TIMES } from "./world";
import { airlockFadeAt, airlockFadeMs, airlockHatchAt } from "./adrift";
import { hullWeldInterval, type HullRepairKind } from "./hull";

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

/** Dense storm rattle — relentless hail on a car body, not a hiss. */
function makeGravelBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let left = 0;
    let amp = 0;
    for (let i = 0; i < length; i++) {
      if (left <= 0 && Math.random() < 34 / sr) {
        left = Math.floor(sr * (0.004 + Math.random() * 0.011));
        amp = 0.4 + Math.random() * 0.6;
        data[i] = (Math.random() < 0.5 ? 1 : -1) * amp;
        left--;
        continue;
      }
      if (left > 0) {
        const u = left / (sr * 0.015);
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

/** 5s stock alarm: repeating square beep, the YouTube "alarm sound effect" loop. */
function makeAlarmBuffer(ctx: AudioContext) {
  const sr = ctx.sampleRate;
  const seconds = 5;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const on = 0.16;
  const off = 0.11;
  const period = on + off;
  const f = 1174.7;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const phase = t % period;
    if (phase >= on) continue;
    const gate = Math.min(1, phase / 0.006, (on - phase) / 0.01);
    const sq = Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1;
    const sub = Math.sin(2 * Math.PI * (f * 0.5) * t) >= 0 ? 0.4 : -0.4;
    d[i] = (sq * 0.72 + sub * 0.28) * 0.16 * gate;
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
  const tail = 0.1 + size * 0.09;
  const f0 = (96 + (1 - size) * 42 + b * 10) * (0.94 + Math.random() * 0.12);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  const iceHp = push(ctx.createBiquadFilter());
  iceHp.type = "highpass";
  iceHp.frequency.value = 1500 + b * 700;
  const iceLp = push(ctx.createBiquadFilter());
  iceLp.type = "lowpass";
  iceLp.frequency.value = 5200 + b * 1600;
  const iceG = push(ctx.createGain());
  click.playbackRate.value = 0.6 + Math.random() * 0.3;
  iceG.gain.setValueAtTime(vol * (0.5 + (1 - roof) * 1.0 + b * 0.3), t);
  iceG.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
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
  crackBp.frequency.value = 620 + b * 520;
  crackBp.Q.value = 0.85;
  const crackG = push(ctx.createGain());
  crackG.gain.setValueAtTime(0.0001, t);
  crackG.gain.linearRampToValueAtTime(vol * 1.5, t + 0.002);
  crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
  src.connect(crackBp);
  crackBp.connect(crackG);
  crackG.connect(bus);

  const thunkHp = push(ctx.createBiquadFilter());
  thunkHp.type = "highpass";
  thunkHp.frequency.value = 58;
  const thunkLp = push(ctx.createBiquadFilter());
  thunkLp.type = "lowpass";
  thunkLp.frequency.value = 260 + size * 90;
  const thunkG = push(ctx.createGain());
  thunkG.gain.setValueAtTime(0.0001, t);
  thunkG.gain.linearRampToValueAtTime(vol * (1.6 + roof * 0.9), t + 0.0035);
  thunkG.gain.exponentialRampToValueAtTime(0.0001, t + 0.075 + size * 0.055);
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
  tone(f0, vol * (1.2 + roof * 0.7), tail);
  tone(f0 * 1.65, vol * 0.3 * roof, tail * 0.55);
  tone(f0 * 0.52, vol * (0.5 + size * 0.6), tail * 1.25);

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
  clickHp.frequency.value = micro ? 2600 : 1900;
  clickHp.Q.value = 0.75;
  const clickLp = push(ctx.createBiquadFilter());
  clickLp.type = "lowpass";
  clickLp.frequency.value = micro ? 7200 : 8600;
  const clickG = push(ctx.createGain());
  click.playbackRate.value = micro ? 0.9 + Math.random() * 0.45 : 0.75 + Math.random() * 0.35;
  clickG.gain.setValueAtTime(vol * (micro ? 1.75 : 2.5), t);
  clickG.gain.exponentialRampToValueAtTime(0.0001, t + (micro ? 0.006 : 0.009));
  click.connect(clickHp);
  clickHp.connect(clickLp);
  clickLp.connect(clickG);
  clickG.connect(pan);
  click.start(t);
  click.stop(t + 0.03);
  push(click);

  // Panel body: even small stones land with a dull knock, not just a tick.
  const knock = ctx.createOscillator();
  knock.type = "sine";
  const kf = (micro ? 300 : 210) * (0.9 + Math.random() * 0.2);
  knock.frequency.setValueAtTime(kf, t);
  knock.frequency.exponentialRampToValueAtTime(kf * 0.72, t + 0.045);
  const knockG = push(ctx.createGain());
  knockG.gain.setValueAtTime(0.0001, t);
  knockG.gain.linearRampToValueAtTime(vol * (micro ? 0.6 : 1.1), t + 0.003);
  knockG.gain.exponentialRampToValueAtTime(0.0001, t + (micro ? 0.035 : 0.055));
  knock.connect(knockG);
  knockG.connect(pan);
  knock.start(t);
  knock.stop(t + 0.08);
  push(knock);

  const src = ctx.createBufferSource();
  src.buffer = whiteBuf;
  const hp = push(ctx.createBiquadFilter());
  hp.type = "highpass";
  hp.frequency.value = micro ? 2200 + b * 1100 : 1700 + b * 1200;
  hp.Q.value = 0.7;
  const drive = push(ctx.createWaveShaper());
  drive.curve = makeDriveCurve();
  drive.oversample = "2x";
  src.connect(hp);
  hp.connect(drive);
  push(src);

  const jitter = 0.93 + Math.random() * 0.14;
  const f1 = (2300 + b * 1500) * jitter;
  const f2 = f1 * 1.72;
  const ring = 0.014 + b * 0.012;
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

/** Pad hose valve: a short thunk plus a filtered click. Opening sits higher. */
function fireValve(
  ctx: AudioContext,
  dest: AudioNode,
  clickBuf: AudioBuffer,
  opening: boolean,
  hush: number,
) {
  const t = ctx.currentTime;
  const nodes: AudioNode[] = [];
  const push = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };
  const g = push(ctx.createGain());
  g.connect(dest);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  click.playbackRate.value = opening ? 1.05 : 0.72;
  const bp = push(ctx.createBiquadFilter());
  bp.type = "bandpass";
  bp.frequency.value = opening ? 2100 : 1400;
  bp.Q.value = 1.6;
  const cg = push(ctx.createGain());
  cg.gain.setValueAtTime(0.055 * hush, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  click.connect(bp);
  bp.connect(cg);
  cg.connect(g);
  click.start(t);
  click.stop(t + 0.05);
  push(click);

  const thunk = push(ctx.createOscillator());
  thunk.type = "sine";
  const f0 = opening ? 118 : 86;
  thunk.frequency.setValueAtTime(f0, t);
  thunk.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.09);
  const tg = push(ctx.createGain());
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.045 * hush, t + 0.006);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  thunk.connect(tg);
  tg.connect(g);
  thunk.start(t);
  thunk.stop(t + 0.13);
  thunk.onended = () => tidyNodes(nodes);
}

/** Quiet autoweld: a high click and a 12 ms spark. Not a hull-stone hit. */
function fireWeldTick(
  ctx: AudioContext,
  dest: AudioNode,
  whiteBuf: AudioBuffer,
  clickBuf: AudioBuffer,
  hush: number,
) {
  const t = ctx.currentTime;
  const nodes: AudioNode[] = [];
  const push = <T extends AudioNode>(n: T) => {
    nodes.push(n);
    return n;
  };
  const pan = push(ctx.createStereoPanner());
  pan.pan.value = (Math.random() - 0.5) * 0.35;
  pan.connect(dest);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  click.playbackRate.value = 1.15 + Math.random() * 0.45;
  const hp = push(ctx.createBiquadFilter());
  hp.type = "highpass";
  hp.frequency.value = 2400;
  const bp = push(ctx.createBiquadFilter());
  bp.type = "bandpass";
  bp.frequency.value = 3200 + Math.random() * 900;
  bp.Q.value = 2.4;
  const cg = push(ctx.createGain());
  cg.gain.setValueAtTime(0.038 * hush, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
  click.connect(hp);
  hp.connect(bp);
  bp.connect(cg);
  cg.connect(pan);
  click.start(t);
  click.stop(t + 0.03);
  push(click);

  const spark = ctx.createBufferSource();
  spark.buffer = whiteBuf;
  const shp = push(ctx.createBiquadFilter());
  shp.type = "highpass";
  shp.frequency.value = 3800;
  const slp = push(ctx.createBiquadFilter());
  slp.type = "lowpass";
  slp.frequency.value = 7200;
  const sg = push(ctx.createGain());
  sg.gain.setValueAtTime(0.022 * hush, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
  spark.connect(shp);
  shp.connect(slp);
  slp.connect(sg);
  sg.connect(pan);
  spark.start(t, Math.random() * 0.4);
  spark.stop(t + 0.02);
  push(spark);
  spark.onended = () => tidyNodes(nodes);
}

function fireServicePing(
  ctx: AudioContext,
  dest: AudioNode,
  notes: readonly { freq: number; at: number; dur: number; peak: number; tail: number }[],
) {
  const t = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(n.freq, t + n.at);
    g.gain.setValueAtTime(0.0001, t + n.at);
    g.gain.exponentialRampToValueAtTime(n.peak, t + n.at + 0.006);
    g.gain.setValueAtTime(n.peak, t + n.at + n.dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.dur + n.tail);
    osc.connect(g);
    g.connect(dest);
    osc.start(t + n.at);
    osc.stop(t + n.at + n.dur + n.tail + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }
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
  spectroPower: (on: boolean) => void;
  setRefuel: (on: boolean, reduced?: boolean) => void;
  setRepair: (on: boolean, kind?: HullRepairKind, reduced?: boolean) => void;
  refuelDone: () => void;
  repairDone: () => void;
  warpJump: () => void;
  sonicBooms: (times?: readonly number[]) => void;
  bump: (amount: number) => void;
  land: () => void;
  crash: () => void;
  warn: () => void;
  cometEnter: () => void;
  clockBeep: () => void;
  airlockReady: () => void;
  setAdriftAlarm: (on: boolean) => void;
  airlockSequence: (reduced?: boolean) => void;
  cancelAirlockSequence: () => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
};

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let worldGain: GainNode | null = null;
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
  let beltRoarLp: BiquadFilterNode | null = null;
  let beltRoarGain: GainNode | null = null;
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
  let refuelHp: BiquadFilterNode | null = null;
  let refuelLp: BiquadFilterNode | null = null;
  let refuelGain: GainNode | null = null;
  let pumpOsc: OscillatorNode | null = null;
  let pumpOscGain: GainNode | null = null;
  let pumpLfo: OscillatorNode | null = null;
  let pumpLfoDepth: GainNode | null = null;
  let gravelSrc: AudioBufferSourceNode | null = null;
  let whiteBuf: AudioBuffer | null = null;
  let clickBuf: AudioBuffer | null = null;
  let voidIR: AudioBuffer | null = null;
  let muted = false;
  let thrustOn = false;
  let airlockNodes: AudioNode[] = [];
  // Adrift clock escapement: alternates so seconds read tick / tock.
  let clockTock = false;
  let alarmSrc: AudioBufferSourceNode | null = null;
  let alarmGain: GainNode | null = null;
  let adriftAlarmOn = false;
  let adriftAlarmWanted = false;
  let airlockSeqGen = 0;
  let refuelOn = false;
  let repairOn = false;
  let nextWeldAt = 0;
  const clipLoads = new Map<string, Promise<AudioBuffer>>();
  // CRT TV power on/off clip for the mass spec panel. On = the degauss
  // thunk at the head of the clip, off = the double pop at the tail.
  let tvLoad: Promise<AudioBuffer> | null = null;

  const decodeUrl = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await ctx!.decodeAudioData(await res.arrayBuffer());
  };

  const loadClip = (name: string) => {
    if (!ctx) return null;
    let p = clipLoads.get(name);
    if (!p) {
      p = decodeUrl(`/sounds/${name}.webm`).catch(() => decodeUrl(`/sounds/${name}.m4a`));
      p.catch(() => {
        clipLoads.delete(name);
      });
      clipLoads.set(name, p);
    }
    return p;
  };

  const loadTvClip = () => {
    if (!ctx) return null;
    if (!tvLoad) {
      tvLoad = decodeUrl("/sounds/tv-onoff.webm").catch(() => decodeUrl("/sounds/tv-onoff.m4a"));
      tvLoad.catch(() => {
        tvLoad = null;
      });
    }
    return tvLoad;
  };

  const prefetchClips = () => {
    void loadTvClip();
    void loadClip("airlock-alarm");
    void loadClip("airlock-hatch");
    void loadClip("airlock-leak");
  };

  const ensure = () => {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    worldGain = ctx.createGain();
    worldGain.gain.value = 1;
    sfx = ctx.createGain();
    sfx.gain.value = 0.7;
    sfx.connect(worldGain);
    worldGain.connect(master);
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
    // Hailstorm rattle: dense mid-band clatter on the hull...
    gritHp = ctx.createBiquadFilter();
    gritHp.type = "highpass";
    gritHp.frequency.value = 340;
    gritHp.Q.value = 0.6;
    gritBp = ctx.createBiquadFilter();
    gritBp.type = "bandpass";
    gritBp.frequency.value = 1200;
    gritBp.Q.value = 0.65;
    gritLp = ctx.createBiquadFilter();
    gritLp.type = "lowpass";
    gritLp.frequency.value = 4600;
    gritLp.Q.value = 0.55;
    gritGain = ctx.createGain();
    gritGain.gain.value = 0;
    gravelSrc.connect(gritHp);
    gritHp.connect(gritBp);
    gritBp.connect(gritLp);
    gritLp.connect(gritGain);
    gritGain.connect(sfx);

    // ...plus a low storm roar underneath, like sitting inside the car.
    beltRoarLp = ctx.createBiquadFilter();
    beltRoarLp.type = "lowpass";
    beltRoarLp.frequency.value = 380;
    beltRoarLp.Q.value = 0.6;
    beltRoarGain = ctx.createGain();
    beltRoarGain.gain.value = 0;
    gravelSrc.connect(beltRoarLp);
    beltRoarLp.connect(beltRoarGain);
    beltRoarGain.connect(sfx);

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

    // Pad pump: brown compressor bed + 46 Hz motor, AM'd at ~2.4 Hz.
    // Stays under spectro (128 Hz squares) and well below atmo hiss (320 Hz).
    refuelHp = ctx.createBiquadFilter();
    refuelHp.type = "highpass";
    refuelHp.frequency.value = 55;
    refuelHp.Q.value = 0.55;
    refuelLp = ctx.createBiquadFilter();
    refuelLp.type = "lowpass";
    refuelLp.frequency.value = 200;
    refuelLp.Q.value = 0.7;
    refuelGain = ctx.createGain();
    refuelGain.gain.value = 0;
    noiseSrc.connect(refuelHp);
    refuelHp.connect(refuelLp);
    refuelLp.connect(refuelGain);
    refuelGain.connect(sfx);

    pumpOsc = ctx.createOscillator();
    pumpOsc.type = "sine";
    pumpOsc.frequency.value = 46;
    pumpOscGain = ctx.createGain();
    pumpOscGain.gain.value = 0;
    pumpOsc.connect(pumpOscGain);
    pumpOscGain.connect(refuelGain);
    pumpOsc.start();

    pumpLfo = ctx.createOscillator();
    pumpLfo.type = "sine";
    pumpLfo.frequency.value = 2.4;
    pumpLfoDepth = ctx.createGain();
    pumpLfoDepth.gain.value = 0;
    pumpLfo.connect(pumpLfoDepth);
    pumpLfoDepth.connect(refuelGain.gain);
    pumpLfo.start();
  };

  const unlock = () => {
    ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    prefetchClips();
  };

  const onVis = () => {
    if (!document.hidden) unlock();
  };
  const onGesture = () => unlock();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);

  const stopAirlockNodes = () => {
    airlockSeqGen += 1;
    for (const n of airlockNodes) {
      try {
        if ("stop" in n && typeof (n as OscillatorNode).stop === "function") {
          (n as OscillatorNode).stop();
        }
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    airlockNodes = [];
  };

  const restoreWorldGain = () => {
    if (!ctx || !worldGain) return;
    const t = ctx.currentTime;
    worldGain.gain.cancelScheduledValues(t);
    worldGain.gain.setTargetAtTime(1, t, 0.04);
  };

  const stopAdriftAlarm = () => {
    if (alarmSrc) {
      try {
        alarmSrc.stop();
        alarmSrc.disconnect();
      } catch {
        /* already gone */
      }
      alarmSrc = null;
    }
    if (alarmGain) {
      try {
        alarmGain.disconnect();
      } catch {
        /* already gone */
      }
      alarmGain = null;
    }
    adriftAlarmOn = false;
  };

  const playAirlockSequence = (reduced: boolean) => {
    ensure();
    if (!ctx || !sfx || !worldGain || !master || !whiteBuf) return;
    stopAirlockNodes();
    stopAdriftAlarm();
    adriftAlarmWanted = false;
    const gen = airlockSeqGen;
    const hatchAt = airlockHatchAt(reduced) / 1000;
    const fadeAt = airlockFadeAt(reduced) / 1000;
    const fadeDur = airlockFadeMs(reduced) / 1000;
    const keep = <T extends AudioNode>(n: T) => {
      airlockNodes.push(n);
      return n;
    };
    const dest = keep(ctx.createGain());
    dest.gain.value = 1;
    dest.connect(master);

    const startNoise = (at: number, dur: number) => {
      const src = ctx!.createBufferSource();
      src.buffer = whiteBuf;
      src.loop = true;
      keep(src);
      src.start(at);
      src.stop(at + dur);
      return src;
    };

    const playClip = (
      buf: AudioBuffer,
      at: number,
      opts: { duration: number; loop?: boolean; gain?: number; fadeOut?: boolean },
    ) => {
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = !!opts.loop;
      keep(src);
      const g = keep(ctx!.createGain());
      const peak = opts.gain ?? 0.7;
      const dur = Math.max(0.05, opts.duration);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.03);
      if (opts.fadeOut) {
        g.gain.linearRampToValueAtTime(0.0001, at + dur);
      } else {
        g.gain.setValueAtTime(peak, at + Math.max(0.04, dur - 0.06));
        g.gain.linearRampToValueAtTime(0.0001, at + dur);
      }
      src.connect(g);
      g.connect(dest);
      if (opts.loop) src.start(at);
      else src.start(at, 0, Math.min(dur + 0.05, buf.duration));
      src.stop(at + dur + 0.02);
    };

    const playLoopingAlarm = (buf: AudioBuffer, at: number, hold: number, fade: number, gain: number) => {
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      keep(src);
      const g = keep(ctx!.createGain());
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.03);
      g.gain.setValueAtTime(gain, at + hold);
      g.gain.linearRampToValueAtTime(0.0001, at + hold + fade);
      src.connect(g);
      g.connect(dest);
      src.start(at);
      src.stop(at + hold + fade + 0.04);
    };

    const playHatch = (hatch: number) => {
      if (reduced) {
        const kn = keep(ctx!.createOscillator());
        kn.type = "sine";
        kn.frequency.setValueAtTime(88, hatch);
        kn.frequency.exponentialRampToValueAtTime(36, hatch + 0.18);
        const kg = keep(ctx!.createGain());
        kg.gain.setValueAtTime(0.0001, hatch);
        kg.gain.exponentialRampToValueAtTime(0.18, hatch + 0.008);
        kg.gain.exponentialRampToValueAtTime(0.0001, hatch + 0.2);
        kn.connect(kg);
        kg.connect(dest);
        kn.start(hatch);
        kn.stop(hatch + 0.22);
        const hiss = startNoise(hatch, 0.22);
        const hp = keep(ctx!.createBiquadFilter());
        hp.type = "highpass";
        hp.frequency.value = 1400;
        const hg = keep(ctx!.createGain());
        hg.gain.setValueAtTime(0.1, hatch);
        hg.gain.exponentialRampToValueAtTime(0.0001, hatch + 0.2);
        hiss.connect(hp);
        hp.connect(hg);
        hg.connect(dest);
        return;
      }

      const dump = startNoise(hatch, 0.55);
      const dumpHp = keep(ctx!.createBiquadFilter());
      dumpHp.type = "highpass";
      dumpHp.frequency.value = 1100;
      const dumpG = keep(ctx!.createGain());
      dumpG.gain.setValueAtTime(0.0001, hatch);
      dumpG.gain.exponentialRampToValueAtTime(0.16, hatch + 0.03);
      dumpG.gain.exponentialRampToValueAtTime(0.0001, hatch + 0.5);
      dump.connect(dumpHp);
      dumpHp.connect(dumpG);
      dumpG.connect(dest);

      for (const d of [0.16, 0.34, 0.54]) {
        const at = hatch + d;
        const kn = keep(ctx!.createOscillator());
        kn.type = "sine";
        kn.frequency.setValueAtTime(155, at);
        kn.frequency.exponentialRampToValueAtTime(46, at + 0.13);
        const kg = keep(ctx!.createGain());
        kg.gain.setValueAtTime(0.0001, at);
        kg.gain.exponentialRampToValueAtTime(0.2, at + 0.006);
        kg.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
        kn.connect(kg);
        kg.connect(dest);
        kn.start(at);
        kn.stop(at + 0.17);
        if (clickBuf) {
          const c = ctx!.createBufferSource();
          c.buffer = clickBuf;
          keep(c);
          const cg = keep(ctx!.createGain());
          cg.gain.value = 0.3;
          c.connect(cg);
          cg.connect(dest);
          c.start(at);
          c.stop(at + 0.05);
        }
      }

      const motor = keep(ctx!.createOscillator());
      motor.type = "sawtooth";
      motor.frequency.setValueAtTime(205, hatch + 0.58);
      motor.frequency.exponentialRampToValueAtTime(68, hatch + 3.7);
      const motorLp = keep(ctx!.createBiquadFilter());
      motorLp.type = "lowpass";
      motorLp.frequency.setValueAtTime(920, hatch + 0.58);
      motorLp.frequency.exponentialRampToValueAtTime(260, hatch + 3.7);
      const motorG = keep(ctx!.createGain());
      motorG.gain.setValueAtTime(0.0001, hatch + 0.58);
      motorG.gain.linearRampToValueAtTime(0.065, hatch + 0.82);
      motorG.gain.setValueAtTime(0.055, hatch + 3.25);
      motorG.gain.exponentialRampToValueAtTime(0.0001, hatch + 3.95);
      motor.connect(motorLp);
      motorLp.connect(motorG);
      motorG.connect(dest);
      motor.start(hatch + 0.58);
      motor.stop(hatch + 4.05);

      const scrape = startNoise(hatch + 0.62, 3.5);
      const scrapeBp = keep(ctx!.createBiquadFilter());
      scrapeBp.type = "bandpass";
      scrapeBp.frequency.setValueAtTime(1550, hatch + 0.62);
      scrapeBp.frequency.exponentialRampToValueAtTime(620, hatch + 3.9);
      scrapeBp.Q.value = 1.05;
      const scrapeG = keep(ctx!.createGain());
      scrapeG.gain.setValueAtTime(0.0001, hatch + 0.62);
      scrapeG.gain.linearRampToValueAtTime(0.085, hatch + 0.95);
      scrapeG.gain.exponentialRampToValueAtTime(0.0001, hatch + 4.05);
      scrape.connect(scrapeBp);
      scrapeBp.connect(scrapeG);
      scrapeG.connect(dest);

      const stopAt = hatch + 4.08;
      const thunk = keep(ctx!.createOscillator());
      thunk.type = "sine";
      thunk.frequency.setValueAtTime(72, stopAt);
      thunk.frequency.exponentialRampToValueAtTime(26, stopAt + 0.36);
      const thunkG = keep(ctx!.createGain());
      thunkG.gain.setValueAtTime(0.0001, stopAt);
      thunkG.gain.exponentialRampToValueAtTime(0.24, stopAt + 0.01);
      thunkG.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.4);
      thunk.connect(thunkG);
      thunkG.connect(dest);
      thunk.start(stopAt);
      thunk.stop(stopAt + 0.42);
    };

    const playLeak = (at: number, dur: number) => {
      const rush = startNoise(at, dur + 0.05);
      const hp = keep(ctx!.createBiquadFilter());
      hp.type = "highpass";
      hp.frequency.setValueAtTime(reduced ? 1600 : 2400, at);
      hp.frequency.exponentialRampToValueAtTime(220, at + dur);
      const bp = keep(ctx!.createBiquadFilter());
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(reduced ? 2200 : 3600, at);
      bp.frequency.exponentialRampToValueAtTime(700, at + dur);
      bp.Q.value = 0.8;
      const lp = keep(ctx!.createBiquadFilter());
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(reduced ? 5000 : 9500, at);
      lp.frequency.exponentialRampToValueAtTime(1100, at + dur);
      const g = keep(ctx!.createGain());
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(reduced ? 0.14 : 0.24, at + 0.07);
      g.gain.linearRampToValueAtTime(0.0001, at + dur);
      rush.connect(hp);
      hp.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(dest);

      const whistle = keep(ctx!.createOscillator());
      whistle.type = "sine";
      whistle.frequency.setValueAtTime(reduced ? 1800 : 2680, at);
      whistle.frequency.exponentialRampToValueAtTime(380, at + dur);
      const wg = keep(ctx!.createGain());
      wg.gain.setValueAtTime(0.0001, at);
      wg.gain.linearRampToValueAtTime(reduced ? 0.02 : 0.038, at + 0.1);
      wg.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.9);
      whistle.connect(wg);
      wg.connect(dest);
      whistle.start(at);
      whistle.stop(at + dur);
    };

    const playSynthAlarm = (t0: number, dur: number) => {
      if (!ctx) return;
      const osc = keep(ctx.createOscillator());
      osc.type = "square";
      const g = keep(ctx.createGain());
      const step = 0.27;
      osc.frequency.setValueAtTime(1174.7, t0);
      for (let i = 0, at = t0; at < t0 + dur; i++, at += step) {
        osc.frequency.setValueAtTime(i % 2 === 0 ? 1174.7 : 0.001, at);
      }
      g.gain.setValueAtTime(0.09, t0);
      g.gain.setValueAtTime(0.09, t0 + Math.max(0.05, dur - 0.04));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(t0);
      osc.stop(t0 + dur);
    };

    const schedule = (
      alarm: AudioBuffer | null,
      hatch: AudioBuffer | null,
      leak: AudioBuffer | null,
    ) => {
      if (gen !== airlockSeqGen || !ctx || !worldGain) return;
      const start = ctx.currentTime;
      const leakDur = leak ? leak.duration : Math.max(0.35, fadeDur);
      if (!reduced && alarm) playLoopingAlarm(alarm, start, fadeAt, leakDur, 0.72);
      else if (!reduced) playSynthAlarm(start, fadeAt + leakDur);

      if (!reduced && hatch) playClip(hatch, start + hatchAt, { duration: hatch.duration, gain: 0.78 });
      else playHatch(start + hatchAt);

      if (!reduced && leak) {
        playClip(leak, start + fadeAt, { duration: leak.duration, gain: 0.8, fadeOut: true });
      } else {
        playLeak(start + fadeAt, leakDur);
      }

      worldGain.gain.cancelScheduledValues(start);
      worldGain.gain.setValueAtTime(1, start);
      worldGain.gain.setValueAtTime(1, start + fadeAt);
      worldGain.gain.linearRampToValueAtTime(0.0001, start + fadeAt + fadeDur);
    };

    if (reduced) {
      schedule(null, null, null);
      return;
    }

    const missing = () => Promise.resolve(null as AudioBuffer | null);
    void Promise.all([
      loadClip("airlock-alarm")?.catch(() => null) ?? missing(),
      loadClip("airlock-hatch")?.catch(() => null) ?? missing(),
      loadClip("airlock-leak")?.catch(() => null) ?? missing(),
    ]).then(([alarm, hatch, leak]) => {
      schedule(alarm, hatch, leak);
    });
  };

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
      if (!ctx || !gritHp || !gritBp || !gritLp || !gritGain || !beltRoarGain) return;
      const t = ctx.currentTime;
      const u = Math.max(0, Math.min(1, amount));
      const b = Math.max(0, Math.min(1, bright ?? 0.4));
      gritGain.gain.setTargetAtTime(u > 0.02 ? 0.05 + u * 0.13 : 0, t, 0.045);
      beltRoarGain.gain.setTargetAtTime(u > 0.02 ? u * (0.06 + u * 0.1) : 0, t, 0.06);
      if (u > 0.02) {
        gritHp.frequency.setTargetAtTime(300 + b * 260, t, 0.1);
        gritBp.frequency.setTargetAtTime(950 + b * 750, t, 0.1);
        gritLp.frequency.setTargetAtTime(3800 + b * 2200, t, 0.1);
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
      // 8-bit coin: a short square-wave blip that jumps up a fourth
      // (B5 -> E6) and lets the second note ring out with a soft decay.
      const note = (freq: number, at: number, dur: number, peak: number, tail: number) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, t + at);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(peak, t + at + 0.004);
        g.gain.setValueAtTime(peak, t + at + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur + tail);
        osc.connect(g);
        g.connect(sfx!);
        osc.start(t + at);
        osc.stop(t + at + dur + tail + 0.02);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      };
      note(987.77, 0, 0.075, 0.05, 0.01); // B5 pickup
      note(1318.51, 0.075, 0.06, 0.05, 0.45); // E6 ring-out
    },
    setRefuel(on, reduced = false) {
      if (!ctx || !sfx || !refuelGain || !pumpOscGain || !pumpLfoDepth || !clickBuf) return;
      const t = ctx.currentTime;
      const hush = reduced ? 0.55 : 1;
      if (on !== refuelOn) fireValve(ctx, sfx, clickBuf, on, hush);
      refuelOn = on;
      refuelGain.gain.setTargetAtTime(on ? 0.026 * hush : 0, t, 0.08);
      pumpOscGain.gain.setTargetAtTime(on ? 0.011 * hush : 0, t, 0.1);
      pumpLfoDepth.gain.setTargetAtTime(on && !reduced ? 0.012 * hush : 0, t, 0.12);
    },
    setRepair(on, kind: HullRepairKind = "landed", reduced = false) {
      if (!ctx || !sfx || !whiteBuf || !clickBuf) return;
      const t = ctx.currentTime;
      const hush = reduced ? 0.55 : 1;
      if (on && !repairOn) nextWeldAt = t + 0.12;
      repairOn = on;
      if (!on) return;
      if (t < nextWeldAt) return;
      fireWeldTick(ctx, sfx, whiteBuf, clickBuf, hush);
      const gap = hullWeldInterval(kind) * (0.82 + Math.random() * 0.36);
      nextWeldAt = t + gap;
    },
    refuelDone() {
      if (!ctx || !sfx) return;
      fireServicePing(ctx, sfx, [
        { freq: 392, at: 0, dur: 0.05, peak: 0.034, tail: 0.04 },
        { freq: 523.25, at: 0.07, dur: 0.08, peak: 0.038, tail: 0.22 },
      ]);
    },
    repairDone() {
      if (!ctx || !sfx) return;
      fireServicePing(ctx, sfx, [
        { freq: 659.25, at: 0, dur: 0.04, peak: 0.032, tail: 0.03 },
        { freq: 880, at: 0.05, dur: 0.07, peak: 0.04, tail: 0.28 },
      ]);
    },
    spectroPower(on) {
      ensure();
      if (!ctx || !sfx) return;
      void ctx.resume();
      const load = loadTvClip();
      if (!load) return;
      void load.then((buf) => {
        if (!ctx || !sfx) return;
        const t = ctx.currentTime;
        // On: head of the clip (CRT switch + degauss thunk). Off: the
        // double power-down pop near the tail, before the silence.
        const dur = on ? 0.6 : 0.75;
        const offset = on ? 0 : Math.max(0, Math.min(2.88, buf.duration - dur));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        const peak = 0.62;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
        g.gain.setValueAtTime(peak, t + dur - 0.12);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(g);
        g.connect(sfx);
        src.start(t, offset, dur);
        src.onended = () => {
          src.disconnect();
          g.disconnect();
        };
      }).catch(() => {
        /* clip unavailable — stay silent */
      });
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
    cometEnter() {
      ensure();
      if (!ctx || !sfx) return;
      void ctx.resume();
      const t = ctx.currentTime;
      // Icy sighting sting: rising sine + glassy triangle. Not the 880/520 square chirp.
      const tone = (
        type: OscillatorType,
        freq0: number,
        freq1: number,
        at: number,
        dur: number,
        peak: number,
      ) => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq0, t + at);
        osc.frequency.exponentialRampToValueAtTime(freq1, t + at + dur);
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(peak, t + at + 0.016);
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
      tone("sine", 1244, 1865, 0, 0.24, 0.085);
      tone("triangle", 622, 933, 0.05, 0.3, 0.06);
      tone("sine", 2488, 1662, 0.14, 0.2, 0.03);
    },
    clockBeep() {
      if (!ctx || !sfx || !clickBuf) return;
      const t = ctx.currentTime;
      clockTock = !clockTock;
      const tock = clockTock;

      // Mechanical escapement, not an alarm: a filtered click (the pawl)
      // plus a tiny resonant knock (the case). Tick sits higher, tock lower,
      // like a wall clock — quiet enough to live under for a long wait.
      const click = ctx.createBufferSource();
      click.buffer = clickBuf;
      click.playbackRate.value = (tock ? 0.8 : 1) * (0.97 + Math.random() * 0.06);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = tock ? 1900 : 2900;
      bp.Q.value = 1.8;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.075, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      click.connect(bp);
      bp.connect(cg);
      cg.connect(sfx);
      click.start(t);
      click.stop(t + 0.05);

      const knock = ctx.createOscillator();
      knock.type = "sine";
      knock.frequency.setValueAtTime(tock ? 440 : 620, t);
      knock.frequency.exponentialRampToValueAtTime(tock ? 300 : 420, t + 0.05);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.0001, t);
      kg.gain.exponentialRampToValueAtTime(0.02, t + 0.004);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      knock.connect(kg);
      kg.connect(sfx);
      knock.start(t);
      knock.stop(t + 0.09);
      knock.onended = () => {
        click.disconnect();
        bp.disconnect();
        cg.disconnect();
        knock.disconnect();
        kg.disconnect();
      };
    },
    airlockReady() {
      // Kept for the API; the looping adrift alarm is the cue now.
    },
    setAdriftAlarm(on) {
      if (on === adriftAlarmWanted) return;
      adriftAlarmWanted = on;
      if (!on) {
        stopAdriftAlarm();
        return;
      }
      ensure();
      if (!ctx || !sfx) return;
      const startLoop = (buf: AudioBuffer) => {
        if (!adriftAlarmWanted || !ctx || !sfx) return;
        stopAdriftAlarm();
        adriftAlarmOn = true;
        alarmGain = ctx.createGain();
        alarmGain.gain.value = 0.0001;
        alarmGain.connect(sfx);
        alarmSrc = ctx.createBufferSource();
        alarmSrc.buffer = buf;
        alarmSrc.loop = true;
        alarmSrc.connect(alarmGain);
        alarmSrc.start();
        alarmGain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.06);
      };
      const load = loadClip("airlock-alarm");
      if (load) {
        void load.then(startLoop).catch(() => {
          if (!ctx) return;
          startLoop(makeAlarmBuffer(ctx));
        });
        return;
      }
      startLoop(makeAlarmBuffer(ctx));
    },
    airlockSequence(reduced = false) {
      playAirlockSequence(reduced);
    },
    cancelAirlockSequence() {
      stopAirlockNodes();
      restoreWorldGain();
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
      stopAirlockNodes();
      stopAdriftAlarm();
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
        pumpOsc?.stop();
        pumpLfo?.stop();
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
