import { WARP_BOOM_TIMES } from "./world";

type AudioApi = {
  unlock: () => void;
  setThrust: (on: boolean, intensity: number) => void;
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
  let thrustFilter: BiquadFilterNode | null = null;
  let noiseSrc: AudioBufferSourceNode | null = null;
  let warpSub: OscillatorNode | null = null;
  let warpSubGain: GainNode | null = null;
  let warpSpool: OscillatorNode | null = null;
  let warpSpoolGain: GainNode | null = null;
  let warpScream: OscillatorNode | null = null;
  let warpScreamGain: GainNode | null = null;
  let warpAirFilter: BiquadFilterNode | null = null;
  let warpAirGain: GainNode | null = null;
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
    thrustFilter = ctx.createBiquadFilter();
    thrustFilter.type = "lowpass";
    thrustFilter.frequency.value = 420;
    thrustFilter.Q.value = 0.7;
    thrustGain = ctx.createGain();
    thrustGain.gain.value = 0;
    noiseSrc.connect(thrustFilter);
    thrustFilter.connect(thrustGain);
    thrustGain.connect(sfx);
    noiseSrc.start();

    whiteBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    const white = whiteBuf.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;

    // Film hyperspace spool: sub pressure, rising tone, airy tunnel whoosh.
    // No hull-rattle LFO — that reads as a car, not a jump.
    warpSub = ctx.createOscillator();
    warpSub.type = "sine";
    warpSub.frequency.value = 32;
    warpSubGain = ctx.createGain();
    warpSubGain.gain.value = 0;
    warpSub.connect(warpSubGain);
    warpSubGain.connect(sfx);
    warpSub.start();

    warpSpool = ctx.createOscillator();
    warpSpool.type = "sine";
    warpSpool.frequency.value = 78;
    warpSpoolGain = ctx.createGain();
    warpSpoolGain.gain.value = 0;
    warpSpool.connect(warpSpoolGain);
    warpSpoolGain.connect(sfx);
    warpSpool.start();

    warpScream = ctx.createOscillator();
    warpScream.type = "triangle";
    warpScream.frequency.value = 420;
    warpScreamGain = ctx.createGain();
    warpScreamGain.gain.value = 0;
    warpScream.connect(warpScreamGain);
    warpScreamGain.connect(sfx);
    warpScream.start();

    warpAirFilter = ctx.createBiquadFilter();
    warpAirFilter.type = "bandpass";
    warpAirFilter.frequency.value = 480;
    warpAirFilter.Q.value = 0.85;
    warpAirGain = ctx.createGain();
    warpAirGain.gain.value = 0;
    noiseSrc.connect(warpAirFilter);
    warpAirFilter.connect(warpAirGain);
    warpAirGain.connect(sfx);
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
      if (!ctx || !thrustGain || !thrustFilter) return;
      thrustOn = on;
      const g = on ? 0.045 + intensity * 0.06 : 0;
      thrustGain.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      thrustFilter.frequency.setTargetAtTime(on ? 380 + intensity * 420 : 220, ctx.currentTime, 0.08);
      void thrustOn;
    },
    setWarp(on, intensity, pitch) {
      if (
        !ctx ||
        !warpSub ||
        !warpSubGain ||
        !warpSpool ||
        !warpSpoolGain ||
        !warpScream ||
        !warpScreamGain ||
        !warpAirFilter ||
        !warpAirGain
      )
        return;
      const t = ctx.currentTime;
      const vol = on ? Math.max(0, Math.min(1, intensity)) : 0;
      const c = Math.max(0, Math.min(1, pitch ?? intensity));
      const late = Math.max(0, (c - 0.62) / 0.38);
      warpSubGain.gain.setTargetAtTime(vol > 0 ? (0.028 + c * 0.055) * vol : 0, t, 0.07);
      warpSpoolGain.gain.setTargetAtTime(vol > 0 ? (0.014 + c * 0.042) * vol : 0, t, 0.07);
      warpScreamGain.gain.setTargetAtTime(vol > 0 ? late * late * 0.034 * vol : 0, t, 0.06);
      warpAirGain.gain.setTargetAtTime(vol > 0 ? (0.01 + c * 0.08) * vol : 0, t, 0.07);
      if (vol > 0.001) {
        warpSub.frequency.setTargetAtTime(28 + c * 22, t, 0.08);
        warpSpool.frequency.setTargetAtTime(72 * Math.pow(2, c * 3.15), t, 0.08);
        warpScream.frequency.setTargetAtTime(420 + late * 1280, t, 0.07);
        warpAirFilter.frequency.setTargetAtTime(380 + c * 3200, t, 0.08);
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
      } catch {
        /* ignore */
      }
      try {
        warpSub?.stop();
        warpSpool?.stop();
        warpScream?.stop();
      } catch {
        /* ignore */
      }
      void ctx?.close();
      ctx = null;
    },
  };
}
