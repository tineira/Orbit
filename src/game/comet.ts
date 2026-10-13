import type { CampaignState } from "./campaign.ts";
import { campaignHasModule } from "./refill.ts";
import type { Comet, CometRequires, NearbyHeading, Planet, Ship } from "./types.ts";
import { angDiff, G, GRAVITY_BASE, getMinimapWorldR, HEADING_MIN_SEP } from "./world.ts";

export const COMET_RED = "#e24b3a";
export const COMET_NUCLEUS_R = 27;
export const COMET_CROSS_MIN_S = 15;
export const COMET_CROSS_MAX_S = 25;

const COMET_SPAWN_OUT = 1.02;
const COMET_THETA_TRIES = 12;

/** Nucleus-center to star-center floor; outside flare reach 4.0×star.radius. */
export function COMET_PERI_CLEAR(star: { radius: number }) {
  return 4.2 * star.radius + COMET_NUCLEUS_R;
}

export function spawnComet(planets: Planet[], rng: () => number): Comet {
  const R = getMinimapWorldR();
  const spawnR = R * COMET_SPAWN_OUT;
  const star = planets.find((p) => p.kind === "star");
  const floor = COMET_PERI_CLEAR(star ?? { radius: 250 });
  const sign = rng() < 0.5 ? 1 : -1;
  const T = COMET_CROSS_MIN_S + rng() * (COMET_CROSS_MAX_S - COMET_CROSS_MIN_S);
  const speed = (2 * R) / T;
  // Straight-line b equals periapsis; star gravity pulls closer. Aim so two-body rp is the floor.
  const mu = star && star.mass > 0 ? G * GRAVITY_BASE * star.mass : 0;
  const a = mu > 0 ? mu / (speed * speed) : 0;
  const b = Math.sqrt(floor * floor + 2 * a * floor) + 8;

  let picked = aimChord(rng() * Math.PI * 2, spawnR, b, sign, speed);
  let pickedClear = -1;
  let pickedLegal = !chordClipsGas(picked.x, picked.y, picked.ux, picked.uy, planets, spawnR);
  if (pickedLegal) pickedClear = chordClearance(picked.x, picked.y, picked.ux, picked.uy, planets, spawnR);
  for (let i = 1; i < COMET_THETA_TRIES; i++) {
    const pose = aimChord(rng() * Math.PI * 2, spawnR, b, sign, speed);
    const legal = !chordClipsGas(pose.x, pose.y, pose.ux, pose.uy, planets, spawnR);
    if (!legal && pickedLegal) continue;
    const clear = chordClearance(pose.x, pose.y, pose.ux, pose.uy, planets, spawnR);
    if (!pickedLegal && legal) {
      picked = pose;
      pickedLegal = true;
      pickedClear = clear;
      continue;
    }
    if (clear > pickedClear) {
      picked = pose;
      pickedLegal = legal;
      pickedClear = clear;
    }
  }

  return {
    x: picked.x,
    y: picked.y,
    vx: picked.vx,
    vy: picked.vy,
    radius: COMET_NUCLEUS_R,
    mass: COMET_NUCLEUS_R * COMET_NUCLEUS_R * 0.35,
  };
}

/**
 * A leaving comet: already inside the chart, on a wide outbound chord.
 * It is not a sun graze. `spawnComet` stays the close pass.
 */
export function spawnLeavingComet(planets: Planet[], rng: () => number): Comet {
  const R = getMinimapWorldR();
  const star = planets.find((p) => p.kind === "star");
  const floor = COMET_PERI_CLEAR(star ?? { radius: 250 });
  const speed = (2 * R) / COMET_CROSS_MIN_S;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < 8; i++) {
    const theta = rng() * Math.PI * 2;
    const r = Math.max(floor * 1.6, R * 0.62);
    const px = Math.cos(theta) * Math.min(r, R * 0.78);
    const py = Math.sin(theta) * Math.min(r, R * 0.78);
    const tangent = (rng() < 0.5 ? 1 : -1) * 0.22;
    let ux = Math.cos(theta) - Math.sin(theta) * tangent;
    let uy = Math.sin(theta) + Math.cos(theta) * tangent;
    const mag = Math.hypot(ux, uy) || 1;
    ux /= mag;
    uy /= mag;
    x = px;
    y = py;
    vx = ux * speed;
    vy = uy * speed;
    const clear = planets.every((p) => {
      const d = Math.hypot(px - p.x, py - p.y);
      if (p.kind === "star") return d > floor;
      if (p.radius <= 0) return true;
      return d > p.radius * 1.4;
    });
    if (clear) break;
  }
  return {
    x,
    y,
    vx,
    vy,
    radius: COMET_NUCLEUS_R,
    mass: COMET_NUCLEUS_R * COMET_NUCLEUS_R * 0.35,
  };
}

function aimChord(theta: number, spawnR: number, b: number, sign: number, speed: number) {
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const nx = -uy;
  const ny = ux;
  const sinA = Math.min(0.999999, b / Math.max(spawnR, 1e-8));
  const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
  const dirx = -cosA * ux + sign * sinA * nx;
  const diry = -cosA * uy + sign * sinA * ny;
  const mag = Math.hypot(dirx, diry) || 1;
  const hx = dirx / mag;
  const hy = diry / mag;
  return {
    x: ux * spawnR,
    y: uy * spawnR,
    ux: hx,
    uy: hy,
    vx: hx * speed,
    vy: hy * speed,
  };
}

function chordApproach(
  x: number,
  y: number,
  ux: number,
  uy: number,
  px: number,
  py: number,
  spawnR: number,
) {
  const maxT = spawnR * 2.2;
  let t = (px - x) * ux + (py - y) * uy;
  if (t < 0) t = 0;
  if (t > maxT) t = maxT;
  return Math.hypot(x + t * ux - px, y + t * uy - py);
}

function chordClipsGas(
  x: number,
  y: number,
  ux: number,
  uy: number,
  planets: Planet[],
  spawnR: number,
) {
  for (const p of planets) {
    if (p.kind !== "gas" || p.radius <= 0) continue;
    if (chordApproach(x, y, ux, uy, p.x, p.y, spawnR) < p.radius) return true;
  }
  return false;
}

function chordClearance(
  x: number,
  y: number,
  ux: number,
  uy: number,
  planets: Planet[],
  spawnR: number,
) {
  let best = Infinity;
  for (const p of planets) {
    if (p.kind === "star" || p.kind === "barycenter" || p.radius <= 0) continue;
    const ratio = chordApproach(x, y, ux, uy, p.x, p.y, spawnR) / p.radius;
    if (ratio < best) best = ratio;
  }
  return best;
}

export function warpHeadings(
  nearby: NearbyHeading[],
  cometHeading: NearbyHeading | null | undefined,
): NearbyHeading[] {
  if (!cometHeading) return nearby;
  return nearby.concat(cometHeading);
}

/** True when the ship meets a story comet's ask. Free mode never calls this. */
export function cometRequireMet(
  ship: Pick<Ship, "fuel" | "fuelKind" | "engineKind" | "tankKind">,
  campaign: Pick<CampaignState, "flags" | "modules"> | null,
  requires: CometRequires,
): boolean {
  if (typeof requires === "string") return !!campaign?.flags.includes(requires);
  if ("fuel" in requires) return ship.fuelKind === requires.fuel && ship.fuel > 0;
  if ("module" in requires) return campaignHasModule(campaign?.modules, requires.module);
  if ("engine" in requires) return ship.engineKind === requires.engine;
  return ship.tankKind === requires.tank;
}

export function makeCometHeading(angle: number): NearbyHeading {
  return {
    angle,
    color: COMET_RED,
    pal: [COMET_RED, COMET_RED, COMET_RED],
    name: "Comet",
    kind: "comet",
  };
}

export function separateCometHeading(trueAngle: number, nearby: NearbyHeading[]): number {
  const stars = nearby.filter((n) => n.kind === "star");
  const legal = (angle: number) => stars.every((n) => angDiff(angle, n.angle) >= HEADING_MIN_SEP);
  if (legal(trueAngle)) return trueAngle;
  const step = (0.5 * Math.PI) / 180;
  let pos: number | null = null;
  let neg: number | null = null;
  for (let d = step; d <= Math.PI + 1e-9; d += step) {
    if (pos == null && legal(trueAngle + d)) pos = d;
    if (neg == null && legal(trueAngle - d)) neg = d;
    if (pos != null && neg != null) break;
  }
  if (pos == null && neg == null) return trueAngle;
  if (pos == null) return trueAngle - neg!;
  if (neg == null) return trueAngle + pos;
  if (neg < pos) return trueAngle - neg;
  return trueAngle + pos;
}
