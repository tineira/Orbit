import type { Planet } from "./types.ts";

/** Flatten on one side so the silhouette is not a circle. */
const ASTEROID_PAD_HALF = 0.55;

export type AsteroidShape = Pick<Planet, "kind" | "radius" | "rotate" | "shapeSeed" | "padAngle">;

function frac(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function wrapPi(a: number) {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
}

/** World polar angle (from +X) for a craft at `landedAngle` (0 is up). */
export function worldAngleFromLanded(landedAngle: number) {
  return Math.atan2(-Math.cos(landedAngle), Math.sin(landedAngle));
}

export function surfaceRadius(p: AsteroidShape, worldAngle: number) {
  if (p.kind !== "asteroid" || p.shapeSeed == null) return p.radius;
  const local = worldAngle - p.rotate;
  const seed = p.shapeSeed;
  let u = 1;
  for (let k = 1; k <= 3; k++) {
    const amp = 0.07 + frac(seed * 13.1 + k) * 0.14;
    const phase = frac(seed * 7.7 + k * 3) * Math.PI * 2;
    u += amp * Math.cos(local * (k + 1) + phase);
  }
  const pad = wrapPi(local - (p.padAngle ?? 0));
  if (Math.abs(pad) < ASTEROID_PAD_HALF) {
    const t = 1 - Math.abs(pad) / ASTEROID_PAD_HALF;
    u -= 0.14 * t * t;
  }
  return p.radius * Math.max(0.68, Math.min(1.22, u));
}

export function surfaceAltitude(p: AsteroidShape & Pick<Planet, "x" | "y">, x: number, y: number) {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  return d - surfaceRadius(p, Math.atan2(dy, dx));
}

/** Kite length in drawShip. Nose is forward; 30% of the craft sits past the local surface. */
const SHIP_NOSE = 13;
const SHIP_SPAN = 23;
export const ASTEROID_LAND_PROTRUDE = 0.3;

/** Distance from body center to the landed ship center. */
export function asteroidLandedRadius(p: AsteroidShape, worldAngle: number) {
  const surface = surfaceRadius(p, worldAngle);
  const r = surface + SHIP_SPAN * ASTEROID_LAND_PROTRUDE - SHIP_NOSE;
  return Math.max(surface * 0.45, r);
}

export const ASTEROID_PATH_STEPS = 22;

export function asteroidWorldPath(p: Planet) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < ASTEROID_PATH_STEPS; i++) {
    const world = p.rotate + (i / ASTEROID_PATH_STEPS) * Math.PI * 2;
    const r = surfaceRadius(p, world);
    pts.push({ x: p.x + Math.cos(world) * r, y: p.y + Math.sin(world) * r });
  }
  return pts;
}
