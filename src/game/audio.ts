import { WARP_BOOM_TIMES } from "./world";

type AudioApi = {
  unlock: () => void;
  setThrust: (on: boolean, intensity: number) => void;
  setWarp: (on: boolean, intensity: number) => void;
  warpJump: () => void;
  sonicBooms: () => void;
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
  document.addEventListener("visibilitychange", onVis);

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
    setWarp(on, intensity) {
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
      const c = on ? Math.max(0, Math.min(1, intensity)) : 0;
      const late = Math.max(0, (c - 0.62) / 0.38);
      warpSubGain.gain.setTargetAtTime(c > 0 ? 0.028 + c * 0.055 : 0, t, 0.07);
      warpSub.frequency.setTargetAtTime(28 + c * 22, t, 0.08);
      warpSpoolGain.gain.setTargetAtTime(c > 0 ? 0.014 + c * 0.042 : 0, t, 0.07);
      warpSpool.frequency.setTargetAtTime(72 * Math.pow(2, c * 3.15), t, 0.08);
      warpScreamGain.gain.setTargetAtTime(late * late * 0.034, t, 0.06);
      warpScream.frequency.setTargetAtTime(420 + late * 1280, t, 0.07);
      warpAirGain.gain.setTargetAtTime(c > 0 ? 0.01 + c * 0.08 : 0, t, 0.07);
      warpAirFilter.frequency.setTargetAtTime(380 + c * 3200, t, 0.08);
    },
    warpJump() {
      if (!ctx || !sfx || !noiseSrc) return;
      const t = ctx.currentTime;
      const rise = ctx.createOscillator();
      const riseG = ctx.createGain();
      rise.type = "sine";
      rise.frequency.setValueAtTime(240, t);
      rise.frequency.exponentialRampToValueAtTime(1680, t + 0.2);
      riseG.gain.setValueAtTime(0.1, t);
      riseG.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      rise.connect(riseG);
      riseG.connect(sfx);
      rise.start(t);
      rise.stop(t + 0.34);

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
      const airG = ctx.createGain();
      airG.gain.setValueAtTime(0.16, t);
      airG.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      noiseSrc.connect(bp);
      bp.connect(airG);
      airG.connect(sfx);

      const thump = ctx.createOscillator();
      const thumpG = ctx.createGain();
      thump.type = "sine";
      thump.frequency.setValueAtTime(78, t);
      thump.frequency.exponentialRampToValueAtTime(28, t + 0.3);
      thumpG.gain.setValueAtTime(0.14, t);
      thumpG.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      thump.connect(thumpG);
      thumpG.connect(sfx);
      thump.start(t);
      thump.stop(t + 0.36);

      const stopAt = t + 0.45;
      const tidy = () => {
        try {
          noiseSrc?.disconnect(bp);
        } catch {
          /* already gone */
        }
        bp.disconnect();
        airG.disconnect();
        rise.disconnect();
        riseG.disconnect();
        thump.disconnect();
        thumpG.disconnect();
      };
      rise.onended = tidy;
      window.setTimeout(tidy, (stopAt - t) * 1000 + 40);
    },
    sonicBooms() {
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
      boom(WARP_BOOM_TIMES[0], 0.78, 820, 118);
      boom(WARP_BOOM_TIMES[1], 0.64, 1100, 96);
      boom(WARP_BOOM_TIMES[2], 0.88, 700, 132);
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
