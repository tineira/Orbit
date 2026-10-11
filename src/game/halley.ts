import { HULL_MAX } from "./hull.ts";

/**
 * Halley: the cabin CRT above the mass spec (docs/art/README.md, fase 2).
 * Pure helpers: damage → signal, corrupt-memory rolls, the CRT power envelope.
 * The clips themselves stay out of the repo until their lines are closed in
 * Historia; `public/halley/manifest.json` (gitignored) names them by id.
 */

export const HALLEY_LABEL = "HAL-E 07";
export const HALLEY_BASE_URL = "/halley/halley-base.jpg";
export const HALLEY_MANIFEST_URL = "/halley/manifest.json";
export const HALLEY_CLIP_IDS = ["halley-01", "halley-02", "halley-03", "halley-04"] as const;
export type HalleyClipId = (typeof HALLEY_CLIP_IDS)[number];

/** `{ "halley-01": { "text": "…" } }`. Files are `/halley/<id>.mp4` and `.webm`. */
export type HalleyManifest = Record<string, { text: string }>;

export function isHalleyClipId(value: string): value is HalleyClipId {
  return (HALLEY_CLIP_IDS as readonly string[]).includes(value);
}

export function halleyClipUrls(id: string) {
  return { mp4: `/halley/${id}.mp4`, webm: `/halley/${id}.webm` };
}

/** Fixed framing (Tomás): zoom 1, horizontal 0.5, vertical 0.35, noise 1. */
export const HALLEY_VIEW = { zoom: 1, fx: 0.5, fy: 0.35, noise: 1 } as const;

/** Power on, then the clip 600 ms later. Clip ends, then power off 250 ms later. */
export const HALLEY_POWER_ON_MS = 600;
export const HALLEY_POWER_OFF_MS = 250;
/** How long the off animation keeps the panel on screen (matches the mass spec). */
export const HALLEY_OFF_ANIM_MS = 700;

export const HALLEY_LOST_WINDOW_MS = 140;
export const HALLEY_CORRUPT_CHECK_MS = 280;
export const HALLEY_GLITCH_MS = 160;

export type HalleySignal = {
  /** Horizontal picture distortion, 0..1. */
  hdist: number;
  /** Static bed under the voice, 0..1. */
  static: number;
  /** Digital crush on the voice, 0..1. */
  dig: number;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** 0 = full hull, 1 = breached. */
export function halleyDamage(hull: number) {
  return clamp01(1 - hull / HULL_MAX);
}

/** Tomás's worst settings at d = 1 (11 oct 2026); a healthy ship still crackles a little. */
export function halleySignal(d: number): HalleySignal {
  const t = clamp01(d);
  return {
    hdist: lerp(0.13, 1, t),
    static: lerp(0.06, 0.16, t),
    dig: lerp(0.1, 0.89, t),
  };
}

/** Past half damage the picture drops out for 140 ms windows; `hash01` is a 0..1 hash of the window. */
export function halleyLost(d: number, hash01: number, reducedMotion: boolean) {
  if (reducedMotion || d <= 0.5) return false;
  return hash01 < (d - 0.5) * 0.5;
}

export type HalleyCorruptStep =
  | { kind: "freeze"; ms: number }
  | { kind: "rewind"; seconds: number }
  | null;

/** Most rewinds a clip gets at damage `d`. */
export function halleyMaxSkips(d: number) {
  return 1 + Math.round((d - 0.6) * 7.5);
}

/**
 * Corrupt memory, checked every 280 ms from the clip's first second.
 * Freeze the picture (audio runs on) or jump the clip back and repeat a piece.
 */
export function halleyCorruptStep(
  d: number,
  clipSeconds: number,
  skips: number,
  frozen: boolean,
  rnd: () => number,
): HalleyCorruptStep {
  if (d < 0.6) return null;
  if (skips >= halleyMaxSkips(d) || clipSeconds < 1) return null;
  if (!frozen && rnd() < (d - 0.55) * 0.3) {
    return { kind: "freeze", ms: 600 + rnd() * 700 };
  }
  if (rnd() < (d - 0.55) * 0.35) {
    return { kind: "rewind", seconds: 0.4 + rnd() * 0.9 };
  }
  return null;
}

export type CrtEnvelope = {
  /** Nothing to draw: off and the beam has died. */
  dark: boolean;
  vx: number;
  vy: number;
  flash: number;
  dotA: number;
  fade: number;
  lineA: number;
};

const ENV_ON: CrtEnvelope = { dark: false, vx: 1, vy: 1, flash: 0, dotA: 0, fade: 1, lineA: 0 };
const ENV_DARK: CrtEnvelope = { dark: true, vx: 1, vy: 1, flash: 0, dotA: 0, fade: 0, lineA: 0 };

const easeOut = (u: number) => 1 - (1 - u) ** 3;

/**
 * The mass spec's CRT power envelope, as a function. On = dot → line → raster
 * with a flash; off = raster → line → lingering dot → dark. Reduced motion
 * snaps between on and dark.
 */
export function crtPowerEnvelope(
  now: number,
  on: boolean,
  onAt: number,
  offAt: number,
  reducedMotion: boolean,
): CrtEnvelope {
  if (!on) {
    if (reducedMotion) return ENV_DARK;
    const a = now - offAt;
    if (a < 0) return ENV_DARK;
    const vy = Math.max(0.03, 1 - clamp01(a / 140) ** 2);
    const vx = a <= 140 ? 1 : Math.max(0.02, 1 - clamp01((a - 140) / 170) ** 2);
    const dotA = clamp01((a - 230) / 60) * clamp01(1 - (a - 300) / 340);
    const fade = a < 360 ? 1 : clamp01(1 - (a - 360) / 290);
    if (fade <= 0.01 && dotA <= 0.01) return ENV_DARK;
    const lineA = clamp01((0.4 - vy) / 0.37) * clamp01((vx - 0.02) * 3);
    return { dark: false, vx, vy, flash: 0, dotA, fade, lineA };
  }
  if (reducedMotion) return ENV_ON;
  const a = now - onAt;
  if (a < 0 || a >= 480) return ENV_ON;
  const vx = a < 60 ? 0.02 : Math.max(0.02, easeOut(clamp01((a - 60) / 140)));
  const vy = a < 190 ? 0.03 : Math.max(0.03, easeOut(clamp01((a - 190) / 250)));
  const flash = a < 90 ? clamp01(a / 90) : clamp01(1 - (a - 90) / 320);
  const dotA = a < 130 ? clamp01(1 - a / 130) * 0.9 : 0;
  const lineA = clamp01((0.4 - vy) / 0.37) * clamp01((vx - 0.02) * 3);
  return { dark: false, vx, vy, flash, dotA, fade: 1, lineA };
}

export type HalleyTear = { y: number; h: number; off: number };

/**
 * Tear bands for one 260 ms epoch: 1 to 3 cuts, each a fraction of the panel
 * height, shifted by a fraction of the width. `hash01(n)` is a 0..1 hash.
 */
export function halleyTears(hdist: number, epoch: number, hash01: (n: number) => number): HalleyTear[] {
  const tears: HalleyTear[] = [];
  if (hdist <= 0) return tears;
  for (let k = 0; k < 4; k++) {
    if (k < 1 + Math.round(hdist * 2) || hash01(epoch * 7.1 + k) < hdist * 0.4) {
      tears.push({
        y: hash01(epoch * 3.3 + k * 1.9),
        h: 0.015 + hash01(epoch * 5.7 + k) * 0.09,
        off: (hash01(epoch * 9.1 + k) < 0.5 ? -1 : 1) * (0.03 + hash01(epoch * 4.3 + k) * 0.12) * hdist,
      });
    }
  }
  return tears;
}

/** Per-strip horizontal offset as a fraction of the panel width (slow wave + ripple). */
export function halleyStripOffset(hdist: number, y: number, t: number) {
  return hdist * (Math.sin(y * 0.03 + t * 0.0021) * 0.012 + Math.sin(y * 0.21 + t * 0.019) * 0.004);
}

/** What the runtime hands the renderer each frame. */
export type HalleyView = {
  on: boolean;
  onAt: number;
  offAt: number;
  /** What the tube shows: the clip, the base image, or nothing (noise). */
  frame: CanvasImageSource | null;
  /** Corrupt memory: a captured frame held while the audio runs on. */
  frozen: CanvasImageSource | null;
  freezeUntil: number;
  /** Last rewind / unfreeze; drives a big tear for `HALLEY_GLITCH_MS`. */
  glitchAt: number;
};

export function createHalleyView(): HalleyView {
  return { on: false, onAt: -1e9, offAt: -1e9, frame: null, frozen: null, freezeUntil: 0, glitchAt: 0 };
}
