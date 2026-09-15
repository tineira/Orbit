import type { Planet } from "./types.ts";
import { beltBands, SHIP_HULL, type BeltBand } from "./world.ts";

export type BeltTickKind = "dust" | "chip" | "pebble";

export type BeltTick = {
  kind: BeltTickKind;
  volume: number;
  bright: number;
  ring: number;
  pan: number;
  delay?: number;
};

export type BeltScan = {
  ticks: BeltTick[];
  dust: number;
  dustBright: number;
};

const TWO_PI = Math.PI * 2;
const V_SILENT = 10;
const CHIP_COOL = 0.2;
const PEBBLE_COOL = 0.38;
const TICK_GAP = 0.04;
const ANG_PAD = 0.95;

export function beltHash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function moteSize(u: number, v: number) {
  if (u < 0.58) return 0.45 + v * 1.9;
  if (u < 0.86) return 1.8 + v * 5;
  return 6 + v * 9;
}

export function moteKind(u: number): "dust" | BeltTickKind {
  if (u < 0.58) return "dust";
  if (u < 0.86) return "chip";
  return "pebble";
}

export function beltPhase(planets: Planet[], parentId: string) {
  for (const p of planets) {
    if (p.kind === "asteroid" && p.parentId === parentId) return p.orbitA ?? 0;
  }
  return 0;
}

export function moteAt(belt: BeltBand, px: number, py: number, phase: number, i: number) {
  const n = belt.motes;
  const u = beltHash(belt.seed + i * 1.7);
  const v = beltHash(belt.seed + i * 5.9);
  const sz = moteSize(u, v);
  let theta = (i / n) * TWO_PI + beltHash(belt.seed + i * 3.1) * 0.7 + phase;
  theta += 0.16 * Math.sin(theta * 5 + belt.seed);
  const nu = theta - belt.orbitPeri;
  const e = belt.orbitE;
  const a = belt.orbitR;
  const oneE2 = Math.max(0, 1 - e * e);
  const rr = e < 1e-8 ? a : (a * oneE2) / (1 + e * Math.cos(nu));
  const g = beltHash(belt.seed + i * 8.2) * 2 - 1;
  const rad = rr + g * Math.abs(g) * belt.width * 0.55;
  return {
    x: px + Math.cos(theta) * rad,
    y: py + Math.sin(theta) * rad,
    theta,
    rad,
    sz,
    u,
    v,
    kind: moteKind(u),
  };
}

function wrapPi(a: number) {
  let x = (a + Math.PI) % TWO_PI;
  if (x < 0) x += TWO_PI;
  return x - Math.PI;
}

function tickVolume(sz: number, closing: number, kind: BeltTickKind) {
  if (closing < V_SILENT) return 0;
  const u = closing / 32;
  const speedW = Math.log1p(u * u) / Math.log1p(4);
  if (kind === "pebble") {
    const sizeHeavy = Math.min(1, Math.max(0, (sz - 5) / 10));
    const cap = 0.46 + sizeHeavy * 0.42;
    return Math.min(cap, (0.34 + sizeHeavy * 0.76) * Math.max(0.45, speedW));
  }
  const sizeW = Math.sqrt(Math.max(0.35, Math.min(1, sz / 14)));
  return Math.min(0.22, sizeW * speedW * 0.26);
}

function beltOmega(lead: Planet, parent: Planet) {
  const dx = lead.x - parent.x;
  const dy = lead.y - parent.y;
  const r2 = dx * dx + dy * dy;
  if (r2 < 1) return 0;
  return (dx * (lead.vy - parent.vy) - dy * (lead.vx - parent.vx)) / r2;
}

function rainGap(rate: number) {
  let gap = -Math.log(Math.max(1e-6, Math.random())) / Math.max(0.25, rate);
  const roll = Math.random();
  if (roll < 0.22) gap *= 0.1 + Math.random() * 0.22;
  else if (roll < 0.35) gap *= 1.7 + Math.random() * 1.8;
  return Math.min(0.6, Math.max(0.014, gap));
}

function scatterBeltRain(rel: number, depth: number, dt: number, rainWait: number) {
  const ticks: BeltTick[] = [];
  const speed = Math.max(0, rel - V_SILENT);
  if (speed <= 0 || dt <= 0) return { ticks, rainWait };
  const speedW = Math.min(1, speed / 40);
  const rate = speedW * (6.5 + depth * 22);
  if (rate < 0.45) return { ticks, rainWait };
  let wait = rainWait - dt;
  let n = 0;
  while (wait <= 0 && n < 5) {
    const jitter = Math.random();
    ticks.push({
      kind: "dust",
      volume: 0.028 + speedW * 0.06 + jitter * 0.03,
      bright: 0.2 + speedW * 0.42 + Math.random() * 0.2,
      ring: 0.006 + jitter * 0.02,
      pan: (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7),
      delay: n * (0.008 + Math.random() * 0.024),
    });
    n++;
    wait += rainGap(rate);
  }
  return { ticks, rainWait: wait };
}

/** Hull ticks and grit. Decorative motes never enter `collidePlanets`. */
export function scanBeltHull(
  ship: { x: number; y: number; vx: number; vy: number; yaw: number },
  planets: Planet[],
  cool: Map<string, number>,
  tickWait: number,
  dt: number,
  rainWait = 0,
): BeltScan & { tickWait: number; rainWait: number } {
  const nextWait = Math.max(0, tickWait - dt);
  if (cool.size) {
    for (const [k, t] of cool) {
      const left = t - dt;
      if (left <= 0) cool.delete(k);
      else cool.set(k, left);
    }
  }

  const bands = beltBands(planets);
  if (!bands.length) return { ticks: [], dust: 0, dustBright: 0, tickWait: nextWait, rainWait };

  const byId = new Map(planets.map((p) => [p.id, p]));
  const rx = -Math.cos(ship.yaw);
  const ry = Math.sin(ship.yaw);
  const found: { key: string; cool: number; tick: BeltTick }[] = [];
  let dust = 0;
  let dustBright = 0;
  let rainRel = 0;
  let rainDepth = 0;

  for (const belt of bands) {
    const parent = byId.get(belt.parentId);
    if (!parent) continue;
    const px = parent.x;
    const py = parent.y;
    const pvx = parent.vx;
    const pvy = parent.vy;
    const phase = beltPhase(planets, belt.parentId);
    const lead = planets.find((p) => p.kind === "asteroid" && p.parentId === belt.parentId);
    const omega = lead ? beltOmega(lead, parent) : 0;
    const shipAng = Math.atan2(ship.y - py, ship.x - px);
    const shipR = Math.hypot(ship.x - px, ship.y - py);
    const nu = shipAng - belt.orbitPeri;
    const e = belt.orbitE;
    const a = belt.orbitR;
    const oneE2 = Math.max(0, 1 - e * e);
    const rr = e < 1e-8 ? a : (a * oneE2) / (1 + e * Math.cos(nu));
    const band = belt.width * 0.55 + SHIP_HULL + 22;
    if (Math.abs(shipR - rr) > band) continue;

    const flowVx = pvx + -Math.sin(shipAng) * shipR * omega;
    const flowVy = pvy + Math.cos(shipAng) * shipR * omega;
    const relFlow = Math.hypot(ship.vx - flowVx, ship.vy - flowVy);
    const depth = 1 - Math.min(1, Math.abs(shipR - rr) / band);
    if (relFlow > rainRel) {
      rainRel = relFlow;
      rainDepth = depth;
    }

    const n = belt.motes;
    const iMid = Math.round(((shipAng - phase) / TWO_PI) * n);
    const half = Math.ceil((n * ANG_PAD) / TWO_PI) + 2;
    for (let k = -half; k <= half; k++) {
      const i = ((iMid + k) % n + n) % n;
      const theta0 = (i / n) * TWO_PI + phase;
      if (Math.abs(wrapPi(theta0 - shipAng)) > ANG_PAD) continue;
      const m = moteAt(belt, px, py, phase, i);
      const dx = ship.x - m.x;
      const dy = ship.y - m.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const gritR = SHIP_HULL + Math.max(4, m.sz) + (m.kind === "dust" ? 10 : 0);
      if (d > gritR) continue;

      const mvx = pvx + -Math.sin(m.theta) * m.rad * omega;
      const mvy = pvy + Math.cos(m.theta) * m.rad * omega;
      const rvx = ship.vx - mvx;
      const rvy = ship.vy - mvy;
      const nx = dx / d;
      const ny = dy / d;
      const closing = Math.max(0, -(rvx * nx + rvy * ny));
      const rel = Math.hypot(rvx, rvy);

      if (m.kind === "dust") {
        const near = 1 - Math.min(1, d / gritR);
        const speed = Math.max(0, (rel - 6) / 40);
        dust += near * (0.25 + speed);
        dustBright += speed;
        const hitR = SHIP_HULL + Math.max(3, m.sz);
        if (d > hitR) continue;
        const key = `${belt.seed}:${i}`;
        if (cool.has(key)) {
          // Still touching the same mote: hold the tick until we separate.
          cool.set(key, 0.2);
          continue;
        }
        const vol = tickVolume(m.sz, closing, "chip") * 0.7;
        if (vol < 0.012) continue;
        const bright = Math.max(0, Math.min(1, (closing - V_SILENT) / 48));
        const pan = Math.max(-1, Math.min(1, (dx * rx + dy * ry) / 16));
        found.push({
          key,
          cool: 0.2,
          tick: { kind: "chip", volume: vol, bright, ring: 0.02, pan },
        });
        continue;
      }

      const hitR = SHIP_HULL + m.sz;
      if (d > hitR) continue;
      const key = `${belt.seed}:${i}`;
      if (cool.has(key)) {
        // Resting against the same rock: refresh the hold every frame so it
        // only re-arms once the ship separates and the grace period runs out.
        cool.set(key, m.kind === "pebble" ? PEBBLE_COOL : CHIP_COOL);
        continue;
      }
      const vol = tickVolume(m.sz, closing, m.kind);
      if (vol < 0.012) continue;
      const sizeW = Math.min(1, m.sz / 14);
      const bright = Math.max(0, Math.min(1, (closing - V_SILENT) / 48));
      const pan = Math.max(-1, Math.min(1, (dx * rx + dy * ry) / 16));
      found.push({
        key,
        cool: m.kind === "pebble" ? PEBBLE_COOL : CHIP_COOL,
        tick: {
          kind: m.kind,
          volume: vol,
          bright,
          ring: m.kind === "pebble" ? 0.42 + sizeW * 0.58 : 0.04 + sizeW * 0.08,
          pan,
        },
      });
    }
  }

  const ticks: BeltTick[] = [];
  let wait = nextWait;
  if (found.length && wait <= 0) {
    found.sort((a, b) => {
      const dv = b.tick.volume - a.tick.volume;
      if (dv) return dv;
      return (b.tick.kind === "pebble" ? 1 : 0) - (a.tick.kind === "pebble" ? 1 : 0);
    });
    const n = Math.min(found[0]!.tick.kind === "pebble" ? 2 : 3, found.length);
    for (let i = 0; i < n; i++) {
      const pick = found[i]!;
      cool.set(pick.key, pick.cool);
      ticks.push(pick.tick);
    }
    wait = TICK_GAP;
  }

  const rain = scatterBeltRain(rainRel, rainDepth, dt, rainWait);
  ticks.push(...rain.ticks);

  const grit = Math.min(1, dust * 0.35);
  return {
    ticks,
    dust: grit,
    dustBright: grit > 0.001 ? Math.min(1, dustBright / Math.max(1, dust)) : 0,
    tickWait: wait,
    rainWait: rain.rainWait,
  };
}
