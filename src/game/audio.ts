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

type AudioApi = {
  unlock: () => void;
  setThrust: (on: boolean, intensity: number) => void;
  setAtmo: (drag: number) => void;
  setWarp: (on: boolean, intensity: number, pitch?: number) => void;
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
  let whiteBuf: AudioBuffer | null = null;
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
      const t = ctx.currentTime;
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
        const sec = 2.7;
        const len = Math.floor(ctx.sampleRate * sec);
        voidIR = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = voidIR.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            const u = i / len;
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 2.6) * (ch === 0 ? 1 : 0.88);
          }
        }
      }

      const hit = ctx.createGain();
      hit.gain.value = 1;
      const dry = ctx.createGain();
      dry.gain.value = 0.95;
      hit.connect(dry);
      dry.connect(sfx);
      nodes.push(hit, dry);

      const conv = ctx.createConvolver();
      conv.buffer = voidIR;
      const wetLp = ctx.createBiquadFilter();
      wetLp.type = "lowpass";
      wetLp.frequency.value = 1700;
      wetLp.Q.value = 0.5;
      const wet = ctx.createGain();
      wet.gain.value = 0.82;
      hit.connect(conv);
      conv.connect(wetLp);
      wetLp.connect(wet);
      wet.connect(sfx);
      nodes.push(conv, wetLp, wet);

      const sub = ctx.createOscillator();
      const subG = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(46, t);
      sub.frequency.exponentialRampToValueAtTime(16, t + 0.7);
      subG.gain.setValueAtTime(0.48, t);
      subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
      sub.connect(subG);
      subG.connect(hit);
      sub.start(t);
      sub.stop(t + 0.8);
      nodes.push(sub, subG);

      const crack = ctx.createBufferSource();
      crack.buffer = whiteBuf;
      const crackBp = ctx.createBiquadFilter();
      crackBp.type = "bandpass";
      crackBp.frequency.value = 780;
      crackBp.Q.value = 0.55;
      const crackG = ctx.createGain();
      crackG.gain.setValueAtTime(0.0001, t);
      crackG.gain.exponentialRampToValueAtTime(0.62, t + 0.008);
      crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      crack.connect(crackBp);
      crackBp.connect(crackG);
      crackG.connect(hit);
      crack.start(t);
      crack.stop(t + 0.24);
      nodes.push(crack, crackBp, crackG);

      const snap = ctx.createOscillator();
      const snapG = ctx.createGain();
      snap.type = "triangle";
      snap.frequency.setValueAtTime(520, t);
      snap.frequency.exponentialRampToValueAtTime(90, t + 0.35);
      snapG.gain.setValueAtTime(0.16, t);
      snapG.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      snap.connect(snapG);
      snapG.connect(hit);
      snap.start(t);
      snap.stop(t + 0.42);
      nodes.push(snap, snapG);

      window.setTimeout(tidy, 2900);
    },
    sonicBooms(times: readonly number[] = WARP_BOOM_TIMES) {
      ensure();
      if (!ctx || !sfx || !whiteBuf) return;
      void ctx.resume();
      const t = ctx.currentTime;
      const boom = (at: number, crackGain: number, band: number, thump: number) => {
        const src = ctx!.createBufferSource();
        src.buffer = whiteBuf;
        const bp = ctx!.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = band;
        bp.Q.value = 0.5;
        const ng = ctx!.createGain();
        ng.gain.setValueAtTime(0.0001, t + at);
        ng.gain.exponentialRampToValueAtTime(crackGain, t + at + 0.008);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.28);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(sfx!);
        src.start(t + at);
        src.stop(t + at + 0.3);

        const osc = ctx!.createOscillator();
        const og = ctx!.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(thump, t + at);
        osc.frequency.exponentialRampToValueAtTime(thump * 0.38, t + at + 0.45);
        og.gain.setValueAtTime(crackGain * 1.05, t + at);
        og.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.52);
        osc.connect(og);
        og.connect(sfx!);
        osc.start(t + at);
        osc.stop(t + at + 0.55);

        const rumble = ctx!.createBufferSource();
        rumble.buffer = whiteBuf;
        const lp = ctx!.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 160;
        lp.Q.value = 0.7;
        const rg = ctx!.createGain();
        rg.gain.setValueAtTime(0.0001, t + at);
        rg.gain.exponentialRampToValueAtTime(crackGain * 0.7, t + at + 0.03);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.78);
        rumble.connect(lp);
        lp.connect(rg);
        rg.connect(sfx!);
        rumble.start(t + at);
        rumble.stop(t + at + 0.82);

        osc.onended = () => {
          src.disconnect();
          bp.disconnect();
          ng.disconnect();
          osc.disconnect();
          og.disconnect();
          rumble.disconnect();
          lp.disconnect();
          rg.disconnect();
        };
      };
      const hits: [number, number, number][] = [
        [0.78, 820, 118],
        [0.64, 1100, 96],
        [0.88, 700, 132],
      ];
      for (let i = 0; i < times.length; i++) {
        const spec = hits[i] ?? hits[hits.length - 1]!;
        boom(times[i]!, spec[0], spec[1], spec[2]);
      }
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
