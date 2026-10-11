import { HULL_MAX } from "./hull.ts";

/** Perihelion hauler sprite (Tomás). Nose up, alpha-cut, 114×240. */
export const SHIP_SPRITE_URL = "/sprites/perihelion-hauler.png";
export const SHIP_SPRITE_NATIVE_W = 114;
export const SHIP_SPRITE_NATIVE_H = 240;

/** Visual height in world units. The old kite was ~24; `SHIP_HULL` (collision) stays apart. */
export const SHIP_SPRITE_H = 24;
export const SHIP_SPRITE_W = (SHIP_SPRITE_H * SHIP_SPRITE_NATIVE_W) / SHIP_SPRITE_NATIVE_H;

/** Hull lift chosen by Tomás (Estética, 11 oct 2026). Applied once when the image loads. */
export const SHIP_SPRITE_FILTER = "brightness(1.75) contrast(1.15)";

/** Below this integrity the ship reads "as found": notch, spark, starboard light out. */
export const SHIP_DAMAGED_HULL = HULL_MAX / 2;

/** Engine nozzles as a fraction of the sprite width, from the tail. */
export const SHIP_ENGINE_X = 0.2;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function shipDamaged(hull: number) {
  return hull < SHIP_DAMAGED_HULL;
}

/** Same darkening the vector ship used in a body's shadow. 1 = lit, 0.28 = full umbra. */
export function shipShadowDim(umbra: number) {
  return 1 - 0.72 * clamp01(umbra);
}

/** Slow nav-light blink, 0.1..1. Steady under reduced motion. */
export function navBlink(nowMs: number, reducedMotion: boolean) {
  if (reducedMotion) return 1;
  return 0.55 + 0.45 * Math.sin(nowMs * 0.004);
}

/** Intermittent spark on the damaged flank. Never under reduced motion. */
export function damageSparkOn(nowMs: number, reducedMotion: boolean) {
  if (reducedMotion) return false;
  return Math.sin(nowMs * 0.013) > 0.55;
}

/**
 * Pixels per world unit for the offscreen ship render: follow zoom × dpr so
 * the sprite stays crisp, but never above the PNG's native resolution.
 */
export function spriteRenderScale(zoom: number, dpr: number) {
  const wanted = Math.max(0.5, zoom) * Math.max(1, dpr);
  const nativeMax = SHIP_SPRITE_NATIVE_H / SHIP_SPRITE_H;
  return Math.min(wanted, nativeMax);
}
