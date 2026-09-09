import type {
  BurnCause,
  Camera,
  CrashKind,
  FlightStatus,
  Particle,
  Planet,
  Ship,
  SolarFlare,
  VerboseDiag,
} from "./types";
import {
  G,
  GRAVITY_BASE,
  LAND_SPEED,
  ORBIT_BREAK_COOLDOWN,
  ATMO_STEPS,
  GRAVITY_STEPS,
  ORBIT_DRAG_BREAK,
  ORBIT_LOCK_DWELL,
  ORBIT_PERTURB_BREAK,
  orbitShellAlts,
  keplerRail,
  isGhostBody,
  twinOf,
  STAR_ATMO_FACTOR,
  KEPLER_STAR_APO_FACTOR,
  KEPLER_STAR_APO_CAP,
  FLARE_CAP,
  FLARE_LONG_CHANCE,
  getStart,
  getSystem,
  RETRO_FORCE,
  SHIP_HULL,
  SHIP_MASS,
  STEP,
  TAKEOFF_SPEED,
  THRUST_FORCE,
  TURN_RATE,
} from "./world";

export type Sim = {
  ship: Ship;
  planets: Planet[];
  particles: Particle[];
  camera: Camera;
  phase: "creating" | "title" | "flight" | "landed" | "crashed";
  landedId: string | null;
  crashedId: string | null;
  landedAngle: number;
  status: FlightStatus;
  nearest: Planet | null;
  altitude: number | null;
  orbitHint: string | null;
  orbitLockId: string | null;
  orbitLockR: number;
  orbitLockA: number;
  orbitLockSign: number;
  orbitLockE: number;
  orbitLockPeri: number;
  orbitLockH: number;
  orbitDwell: number;
  orbitLockCooldown: number;
  orbitDragAlarm: boolean;
  orbitDragHintT: number;
  orbitBreakHint: string | null;
  reducedMotion: boolean;
  gravityScale: number;
  atmoScale: number;
  showOrbitShell: boolean;
  showLagrange: boolean;
  showPhysics: boolean;
  showGravityGrid: boolean;
  showVerbose: boolean;
  lagrangeLockKey: string | null;
  lagrangeDwellKey: string | null;
  lagrangeDwell: number;
  flares: SolarFlare[];
  flareWait: number;
  burned: boolean;
  burnCause: BurnCause | null;
  crashKind: CrashKind | null;
  crashAge: number;
  wreckSeed: number;
};

export const ORBIT_DRAG_HINT = "Atmosphere — orbit lost";
export const ORBIT_PERTURB_HINT = "Perturbed — orbit lost";
export { ATMO_STEPS, GRAVITY_STEPS };

const PARTICLE_CAP = 220;
const SOFT = 18;

export function createSim(): Sim {
  const { planets: src, start } = getSystem();
  const planets = src.map((p) => ({ ...p }));
  const sim: Sim = {
    ship: freshShip(),
    planets,
    particles: Array.from({ length: PARTICLE_CAP }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 1,
      hue: 0,
      alive: false,
    })),
    camera: {
      x: start.x,
      y: start.y,
      zoom: 0.96,
      zoomAuto: 0.96,
      userZoom: 1,
      shake: 0,
      trauma: 0,
    },
    phase: "title",
    landedId: null,
    crashedId: null,
    landedAngle: 0,
    status: "deep",
    nearest: null,
    altitude: null,
    orbitHint: null,
    orbitLockId: null,
    orbitLockR: 0,
    orbitLockA: 0,
    orbitLockSign: 1,
    orbitLockE: 0,
    orbitLockPeri: 0,
    orbitLockH: 0,
    orbitDwell: 0,
    orbitLockCooldown: 0,
    orbitDragAlarm: false,
    orbitDragHintT: 0,
    orbitBreakHint: null,
    reducedMotion: false,
    gravityScale: 1,
    atmoScale: 1,
    showOrbitShell: false,
    showLagrange: false,
    showPhysics: false,
    showGravityGrid: false,
    showVerbose: false,
    lagrangeLockKey: null,
    lagrangeDwellKey: null,
    lagrangeDwell: 0,
    flares: [],
    flareWait: 6,
    burned: false,
    burnCause: null,
    crashKind: null,
    crashAge: 0,
    wreckSeed: 0,
  };
  landOnHome(sim);
  return sim;
}

function freshShip(): Ship {
  const start = getStart();
  return {
    x: start.x,
    y: start.y,
    vx: start.vx,
    vy: start.vy,
    yaw: start.yaw,
    mass: SHIP_MASS,
    thrusting: false,
    reverse: false,
  };
}

export type SimViewPrefs = {
  gravityScale: number;
  atmoScale: number;
  showOrbitShell: boolean;
  showLagrange: boolean;
  showPhysics: boolean;
  showGravityGrid: boolean;
  showVerbose: boolean;
  userZoom: number;
};

export function simViewPrefs(sim: Sim): SimViewPrefs {
  return {
    gravityScale: sim.gravityScale,
    atmoScale: sim.atmoScale,
    showOrbitShell: sim.showOrbitShell,
    showLagrange: sim.showLagrange,
    showPhysics: sim.showPhysics,
    showGravityGrid: sim.showGravityGrid,
    showVerbose: sim.showVerbose,
    userZoom: sim.camera.userZoom,
  };
}

export function applySimViewPrefs(sim: Sim, prefs: SimViewPrefs) {
  sim.gravityScale = prefs.gravityScale;
  sim.atmoScale = prefs.atmoScale;
  sim.showOrbitShell = prefs.showOrbitShell;
  sim.showLagrange = prefs.showLagrange;
  sim.showPhysics = prefs.showPhysics;
  sim.showGravityGrid = prefs.showGravityGrid;
  sim.showVerbose = prefs.showVerbose;
  sim.camera.userZoom = prefs.userZoom;
  sim.camera.zoom = sim.camera.zoomAuto * prefs.userZoom;
}

export function rebootSim(sim: Sim) {
  sim.ship = freshShip();
  sim.phase = "landed";
  sim.crashedId = null;
  sim.orbitHint = null;
  sim.orbitLockId = null;
  sim.orbitLockR = 0;
  sim.orbitLockA = 0;
  sim.orbitLockE = 0;
  sim.orbitLockPeri = 0;
  sim.orbitLockH = 0;
  sim.orbitDwell = 0;
  sim.orbitLockCooldown = 0;
  sim.orbitDragAlarm = false;
  sim.orbitDragHintT = 0;
  sim.orbitBreakHint = null;
  sim.lagrangeLockKey = null;
  sim.lagrangeDwellKey = null;
  sim.lagrangeDwell = 0;
  sim.flares = [];
  sim.flareWait = 5 + Math.random() * 6;
  sim.burned = false;
  sim.burnCause = null;
  sim.crashKind = null;
  sim.crashAge = 0;
  sim.wreckSeed = 0;
  landOnHome(sim);
  sim.camera.zoomAuto = 0.96;
  sim.camera.zoom = 0.96 * sim.camera.userZoom;
  sim.camera.trauma = 0;
  sim.camera.shake = 0;
  for (const p of sim.particles) p.alive = false;
}

export function forwardOf(yaw: number) {
  return { x: -Math.sin(yaw), y: -Math.cos(yaw) };
}

export function bodyMu(p: Planet, gravityScale: number) {
  return G * GRAVITY_BASE * gravityScale * p.mass;
}

function bodyAccel(p: Planet, x: number, y: number, gravityScale: number) {
  if (isGhostBody(p) || p.mass <= 0) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.hypot(dx, dy) || 1;
    return { dx, dy, d, ax: 0, ay: 0, a: 0 };
  }
  const dx = p.x - x;
  const dy = p.y - y;
  const d = Math.hypot(dx, dy) || 1;
  const soft = Math.max(d, p.radius * 0.55 + SOFT);
  const a = bodyMu(p, gravityScale) / (soft * soft);
  return { dx, dy, d, ax: (a * dx) / d, ay: (a * dy) / d, a };
}

export function gravityAt(
  x: number,
  y: number,
  planets: Planet[],
  gravityScale: number,
): { ax: number; ay: number; nearest: Planet; dist: number } {
  let ax = 0;
  let ay = 0;
  let nearest = planets.find((p) => !isGhostBody(p)) ?? planets[0]!;
  let best = Infinity;
  for (const p of planets) {
    if (isGhostBody(p)) continue;
    const pull = bodyAccel(p, x, y, gravityScale);
    if (pull.d < best) {
      best = pull.d;
      nearest = p;
    }
    ax += pull.ax;
    ay += pull.ay;
  }
  return { ax, ay, nearest, dist: best };
}

export type GravityPull = {
  planet: Planet;
  ax: number;
  ay: number;
  a: number;
};

export function gravityPulls(sim: Sim): GravityPull[] {
  const { x, y } = sim.ship;
  const out: GravityPull[] = [];
  for (const p of sim.planets) {
    if (isGhostBody(p)) continue;
    const pull = bodyAccel(p, x, y, sim.gravityScale);
    out.push({ planet: p, ax: pull.ax, ay: pull.ay, a: pull.a });
  }
  return out;
}

export type LagrangeKind = "L1" | "L2" | "L3" | "L4" | "L5";

export type LagrangePoint = {
  key: string;
  kind: LagrangeKind;
  planetId: string;
  planetName: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export const LAGRANGE_CAPTURE_R = 22;
export const LAGRANGE_CAPTURE_V = 6;
const LAGRANGE_LOCK_DWELL = 0.65;

function railOmega(p: Planet, gravityScale: number) {
  return (p.orbitW ?? 0) * Math.sqrt(Math.max(0, gravityScale));
}

function bodyOrbitRadius(p: Planet) {
  const a = p.orbitR ?? 0;
  const e = p.orbitE ?? 0;
  if (e < 1e-8) return a;
  const nu = (p.orbitA ?? 0) - (p.orbitPeri ?? 0);
  return (a * Math.max(0, 1 - e * e)) / (1 + e * Math.cos(nu));
}

function bodyOrbitOmega(p: Planet, gravityScale: number) {
  const n = railOmega(p, gravityScale);
  const e = p.orbitE ?? 0;
  if (e < 1e-8) return n;
  const a = p.orbitR ?? 0;
  const r = bodyOrbitRadius(p);
  if (r < 1e-8) return n;
  return n * ((a * a) / (r * r)) * Math.sqrt(Math.max(0, 1 - e * e));
}

function railPoint(parent: Planet, angle: number, r: number, w: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: parent.x + c * r,
    y: parent.y + s * r,
    vx: parent.vx - s * w * r,
    vy: parent.vy + c * w * r,
  };
}

function rayAccel(
  r: number,
  angle: number,
  parent: Planet,
  body: Planet,
  w: number,
  gravityScale: number,
) {
  const pos = railPoint(parent, angle, r, w);
  const g = gravityAt(pos.x, pos.y, [parent, body], gravityScale);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (g.ax + w * w * (pos.x - parent.x)) * c + (g.ay + w * w * (pos.y - parent.y)) * s;
}

function findRayRoot(f: (r: number) => number, lo: number, hi: number): number | null {
  if (!(hi > lo)) return null;
  const n = 20;
  let a = lo;
  let fa = f(a);
  for (let i = 1; i <= n; i++) {
    const b = lo + ((hi - lo) * i) / n;
    const fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
      a = b;
      fa = fb;
      continue;
    }
    if (fa === 0) return a;
    if (fa * fb <= 0) {
      let loR = a;
      let hiR = b;
      let loV = fa;
      for (let k = 0; k < 24; k++) {
        const m = 0.5 * (loR + hiR);
        const mv = f(m);
        if (!Number.isFinite(mv) || loV * mv <= 0) {
          hiR = m;
        } else {
          loR = m;
          loV = mv;
        }
      }
      return 0.5 * (loR + hiR);
    }
    a = b;
    fa = fb;
  }
  return null;
}

function makeLagrange(
  kind: LagrangeKind,
  body: Planet,
  parent: Planet,
  angle: number,
  r: number,
  w: number,
): LagrangePoint | null {
  if (!Number.isFinite(r) || r < parent.radius * 1.15) return null;
  const pos = railPoint(parent, angle, r, w);
  if (kind === "L1" || kind === "L2") {
    const d = Math.hypot(pos.x - body.x, pos.y - body.y);
    if (d < body.radius + 24) return null;
  }
  return {
    key: `${body.id}:${kind}`,
    kind,
    planetId: body.id,
    planetName: body.name,
    ...pos,
  };
}

function pointsForPair(body: Planet, parent: Planet, gravityScale: number): LagrangePoint[] {
  if (body.orbitR == null || body.orbitA == null || body.orbitW == null) return [];
  const R = bodyOrbitRadius(body);
  const a = body.orbitA;
  const w = bodyOrbitOmega(body, gravityScale);
  if (w <= 0 || R <= parent.radius * 2.2) return [];
  const mu = body.mass / (parent.mass + body.mass);
  const hill = R * Math.cbrt(Math.max(1e-8, mu / 3));
  const fAlong = (r: number) => rayAccel(r, a, parent, body, w, gravityScale);
  const fOpp = (r: number) => rayAccel(r, a + Math.PI, parent, body, w, gravityScale);
  const pad = body.radius + 28;
  const r1 =
    findRayRoot(fAlong, parent.radius * 1.2, R - pad) ?? Math.max(parent.radius * 1.25, R - hill);
  const r2 = findRayRoot(fAlong, R + pad, R + Math.max(hill * 2.8, R * 0.55)) ?? R + hill;
  const r3 = findRayRoot(fOpp, parent.radius * 1.2, R * 1.25) ?? R;
  return [
    makeLagrange("L4", body, parent, a + Math.PI / 3, R, w),
    makeLagrange("L5", body, parent, a - Math.PI / 3, R, w),
    makeLagrange("L1", body, parent, a, r1, w),
    makeLagrange("L2", body, parent, a, r2, w),
    makeLagrange("L3", body, parent, a + Math.PI, r3, w),
  ].filter((pt): pt is LagrangePoint => pt != null);
}

const lagrangeCache = new WeakMap<Sim, LagrangePoint[]>();

function invalidateLagrange(sim: Sim) {
  lagrangeCache.delete(sim);
}

function rotatingPoint(
  kind: LagrangeKind,
  body: Planet,
  bary: Planet,
  x: number,
  y: number,
  w: number,
  planets: Planet[],
): LagrangePoint | null {
  for (const q of planets) {
    if (isGhostBody(q) || q.kind === "star") continue;
    if (Math.hypot(x - q.x, y - q.y) < q.radius + 24) return null;
  }
  const dx = x - bary.x;
  const dy = y - bary.y;
  return {
    key: `${body.id}:${kind}`,
    kind,
    planetId: body.id,
    planetName: body.name,
    x,
    y,
    vx: bary.vx - w * dy,
    vy: bary.vy + w * dx,
  };
}

function rayAccelPair(
  r: number,
  angle: number,
  bary: Planet,
  a: Planet,
  b: Planet,
  w: number,
  gravityScale: number,
) {
  const pos = railPoint(bary, angle, r, w);
  const g = gravityAt(pos.x, pos.y, [a, b], gravityScale);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (g.ax + w * w * (pos.x - bary.x)) * c + (g.ay + w * w * (pos.y - bary.y)) * s;
}

function pointsForBinary(
  a: Planet,
  b: Planet,
  bary: Planet,
  gravityScale: number,
  planets: Planet[],
): LagrangePoint[] {
  if (a.orbitW == null) return [];
  const w = bodyOrbitOmega(a, gravityScale);
  if (w <= 0) return [];
  const angA = Math.atan2(a.y - bary.y, a.x - bary.x);
  const angB = Math.atan2(b.y - bary.y, b.x - bary.x);
  const Ra = Math.hypot(a.x - bary.x, a.y - bary.y);
  const Rb = Math.hypot(b.x - bary.x, b.y - bary.y);
  const sep = Math.hypot(a.x - b.x, a.y - b.y);
  if (sep < a.radius + b.radius + 48) return [];
  const pairName = `${a.name} · ${b.name}`;
  const tag = (kind: LagrangeKind, pt: LagrangePoint | null): LagrangePoint | null =>
    pt ? { ...pt, planetName: pairName } : null;

  const fA = (r: number) => rayAccelPair(r, angA, bary, a, b, w, gravityScale);
  const fB = (r: number) => rayAccelPair(r, angB, bary, a, b, w, gravityScale);
  const r1a = findRayRoot(fA, 0, Math.max(8, Ra - a.radius - 28));
  const r1b = findRayRoot(fB, 0, Math.max(8, Rb - b.radius - 28));
  const useB = r1a == null || (r1b != null && r1b < r1a);
  const r1 = (useB ? r1b : r1a) ?? 0;
  const ang1 = useB ? angB : angA;
  const r2 =
    findRayRoot(fA, Ra + a.radius + 28, Ra + Math.max(sep * 0.85, 220)) ?? Ra + sep * 0.4;
  const r3 =
    findRayRoot(fB, Rb + b.radius + 28, Rb + Math.max(sep * 0.85, 220)) ?? Rb + sep * 0.4;

  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const hx = ((b.y - a.y) / sep) * (Math.sqrt(3) / 2) * sep;
  const hy = ((a.x - b.x) / sep) * (Math.sqrt(3) / 2) * sep;

  return [
    tag(
      "L1",
      rotatingPoint(
        "L1",
        a,
        bary,
        bary.x + Math.cos(ang1) * r1,
        bary.y + Math.sin(ang1) * r1,
        w,
        planets,
      ),
    ),
    tag(
      "L2",
      rotatingPoint(
        "L2",
        a,
        bary,
        bary.x + Math.cos(angA) * r2,
        bary.y + Math.sin(angA) * r2,
        w,
        planets,
      ),
    ),
    tag(
      "L3",
      rotatingPoint(
        "L3",
        a,
        bary,
        bary.x + Math.cos(angB) * r3,
        bary.y + Math.sin(angB) * r3,
        w,
        planets,
      ),
    ),
    tag("L4", rotatingPoint("L4", a, bary, mx + hx, my + hy, w, planets)),
    tag("L5", rotatingPoint("L5", a, bary, mx - hx, my - hy, w, planets)),
  ].filter((pt): pt is LagrangePoint => pt != null);
}

function computeLagrangePoints(planets: Planet[], gravityScale: number): LagrangePoint[] {
  if (gravityScale <= 0) return [];
  const byId = new Map(planets.map((p) => [p.id, p]));
  const out: LagrangePoint[] = [];
  const binaryDone = new Set<string>();
  for (const p of planets) {
    if (p.kind === "star" || isGhostBody(p)) continue;
    if (p.parentId == null || p.orbitR == null || p.orbitA == null || p.orbitW == null) continue;
    const parent = byId.get(p.parentId);
    if (!parent) continue;
    if (isGhostBody(parent)) {
      if (binaryDone.has(parent.id)) continue;
      binaryDone.add(parent.id);
      const sibling = twinOf(p, planets);
      if (sibling) out.push(...pointsForBinary(p, sibling, parent, gravityScale, planets));
      continue;
    }
    out.push(...pointsForPair(p, parent, gravityScale));
  }
  return out;
}

function lagrangePointByKey(
  planets: Planet[],
  gravityScale: number,
  key: string,
): LagrangePoint | null {
  return computeLagrangePoints(planets, gravityScale).find((pt) => pt.key === key) ?? null;
}

export function listLagrangePoints(sim: Sim): LagrangePoint[] {
  const hit = lagrangeCache.get(sim);
  if (hit) return hit;
  const computed = computeLagrangePoints(sim.planets, sim.gravityScale);
  lagrangeCache.set(sim, computed);
  return computed;
}

function lagrangeHint(pt: LagrangePoint, locked: boolean) {
  return locked
    ? `${pt.kind} locked · ${pt.planetName}`
    : `Capturing ${pt.kind} · ${pt.planetName}`;
}

function nearestLagrange(sim: Sim, points = listLagrangePoints(sim)): LagrangePoint | null {
  let best: LagrangePoint | null = null;
  let bestD = LAGRANGE_CAPTURE_R;
  for (const pt of points) {
    const d = Math.hypot(sim.ship.x - pt.x, sim.ship.y - pt.y);
    if (d < bestD) {
      bestD = d;
      best = pt;
    }
  }
  return best;
}

function lagrangeReady(sim: Sim, pt: LagrangePoint) {
  if (sim.orbitLockCooldown > 0) return false;
  if (sim.ship.thrusting || sim.ship.reverse) return false;
  const d = Math.hypot(sim.ship.x - pt.x, sim.ship.y - pt.y);
  if (d > LAGRANGE_CAPTURE_R) return false;
  const rel = Math.hypot(sim.ship.vx - pt.vx, sim.ship.vy - pt.vy);
  if (rel > LAGRANGE_CAPTURE_V) return false;
  if (atmoDrag(sim) > ORBIT_DRAG_BREAK) return false;
  if (lagrangePerturbRatio(pt, sim) > ORBIT_PERTURB_BREAK) return false;
  return true;
}

function captureLagrange(sim: Sim, pt: LagrangePoint) {
  sim.lagrangeLockKey = pt.key;
  sim.lagrangeDwell = 0;
  sim.lagrangeDwellKey = null;
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.ship.x = pt.x;
  sim.ship.y = pt.y;
  sim.ship.vx = pt.vx;
  sim.ship.vy = pt.vy;
  sim.status = "lagrange";
  sim.orbitHint = lagrangeHint(pt, true);
}

function breakLagrangeLock(sim: Sim) {
  sim.lagrangeLockKey = null;
  sim.lagrangeDwell = 0;
  sim.lagrangeDwellKey = null;
  sim.orbitLockCooldown = ORBIT_BREAK_COOLDOWN;
}

function stepLockedLagrange(
  sim: Sim,
  dt: number,
  controls: {
    steer: number;
    forward: boolean;
    reverse: boolean;
    aimYaw: number | null;
    aimThrust: boolean;
  },
) {
  const pt = listLagrangePoints(sim).find((p) => p.key === sim.lagrangeLockKey);
  if (!pt) {
    sim.lagrangeLockKey = null;
    return false;
  }
  const ship = sim.ship;
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;
  if (ship.thrusting || ship.reverse) {
    breakLagrangeLock(sim);
    return false;
  }
  if (atmoDrag(sim) > ORBIT_DRAG_BREAK) {
    dumpCurrentLock(sim, ORBIT_DRAG_HINT);
    return false;
  }
  if (lagrangePerturbRatio(pt, sim) > ORBIT_PERTURB_BREAK) {
    dumpCurrentLock(sim, ORBIT_PERTURB_HINT);
    return false;
  }
  ship.x = pt.x;
  ship.y = pt.y;
  ship.vx = pt.vx;
  ship.vy = pt.vy;
  const host = sim.planets.find((p) => p.id === pt.planetId);
  sim.nearest = host ?? sim.nearest;
  sim.altitude = host ? Math.hypot(ship.x - host.x, ship.y - host.y) - host.radius : null;
  sim.status = "lagrange";
  sim.orbitHint = lagrangeHint(pt, true);
  return true;
}

function atmoRadius(p: Planet) {
  return p.radius * (p.kind === "gas" ? 1.85 : p.kind === "star" ? STAR_ATMO_FACTOR : 1.72);
}

function dragNear(
  x: number,
  y: number,
  vx: number,
  vy: number,
  planets: Planet[],
  atmoScale: number,
) {
  if (atmoScale <= 0) return { ax: 0, ay: 0 };
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
    if (isGhostBody(p) || p.radius <= 0) continue;
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    const outer = atmoRadius(p);
    if (d >= outer || d < p.radius) continue;
    const t = 1 - (d - p.radius) / (outer - p.radius);
    const density = t * t * (p.kind === "gas" ? 0.48 : p.kind === "star" ? 0.12 : 0.5);
    const rvx = vx - p.vx;
    const rvy = vy - p.vy;
    const speed = Math.hypot(rvx, rvy);
    const mag = density * speed * atmoScale;
    ax -= rvx * mag * 0.1;
    ay -= rvy * mag * 0.1;
  }
  return { ax, ay };
}

export function atmoDrag(sim: Sim) {
  const d = dragNear(sim.ship.x, sim.ship.y, sim.ship.vx, sim.ship.vy, sim.planets, sim.atmoScale);
  return Math.hypot(d.ax, d.ay);
}

function spawn(
  sim: Sim,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  hue: number,
) {
  const slot = sim.particles.find((p) => !p.alive);
  if (!slot) return;
  slot.alive = true;
  slot.x = x;
  slot.y = y;
  slot.vx = vx;
  slot.vy = vy;
  slot.life = life;
  slot.max = life;
  slot.size = size;
  slot.hue = hue;
}

export function launchSim(sim: Sim) {
  if (sim.phase !== "title") return;
  if (sim.landedId) takeoff(sim);
  else sim.phase = "flight";
}

export function takeoff(sim: Sim) {
  if (!sim.landedId) return;
  if (sim.phase !== "landed" && sim.phase !== "title") return;
  const p = sim.planets.find((b) => b.id === sim.landedId);
  if (!p) return;
  const f = forwardOf(sim.ship.yaw);
  const nx = (sim.ship.x - p.x) / (p.radius || 1);
  const ny = (sim.ship.y - p.y) / (p.radius || 1);
  const outward = f.x * nx + f.y * ny;
  if (outward < 0.12) {
    const yawWant = Math.atan2(-nx, -ny);
    sim.ship.yaw = yawWant;
  }
  const dir = forwardOf(sim.ship.yaw);
  const r = Math.hypot(sim.ship.x - p.x, sim.ship.y - p.y) || p.radius + SHIP_HULL;
  const mu = bodyMu(p, sim.gravityScale);
  const rApo = r + 200;
  const v2 = Math.max(0, 2 * (mu / r - mu / rApo));
  const kick = Math.max(TAKEOFF_SPEED, Math.sqrt(v2));
  sim.ship.vx = p.vx + dir.x * kick;
  sim.ship.vy = p.vy + dir.y * kick;
  sim.ship.x += dir.x * 8;
  sim.ship.y += dir.y * 8;
  sim.phase = "flight";
  sim.landedId = null;
  sim.status = "approach";
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.orbitLockCooldown = 0;
  sim.lagrangeLockKey = null;
  sim.lagrangeDwellKey = null;
  sim.lagrangeDwell = 0;
}

function stickToPlanet(sim: Sim, p: Planet) {
  const ang = sim.landedAngle;
  const pad = p.radius + SHIP_HULL * 0.85;
  sim.ship.x = p.x + Math.sin(ang) * pad;
  sim.ship.y = p.y - Math.cos(ang) * pad;
  sim.ship.vx = p.vx;
  sim.ship.vy = p.vy;
}

function faceRadial(sim: Sim) {
  sim.ship.yaw = wrapPi(-sim.landedAngle);
}

function carryOnSurface(sim: Sim, p: Planet, dt: number) {
  const dAng = p.spin * dt * 0.35;
  sim.landedAngle += dAng;
  sim.ship.yaw -= dAng;
  stickToPlanet(sim, p);
}

function crashedHost(sim: Sim): Planet | undefined {
  if (sim.crashedId) {
    const p = sim.planets.find((b) => b.id === sim.crashedId);
    if (p) return p;
  }
  return sim.planets.find((b) => b.kind === "star");
}

function pinToSurface(sim: Sim, p: Planet) {
  const s = sim.ship;
  const dx = s.x - p.x;
  const dy = s.y - p.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  sim.landedAngle = Math.atan2(dx / d, -dy / d);
  stickToPlanet(sim, p);
}

function shipTouchesHull(sim: Sim, p: Planet) {
  return Math.hypot(sim.ship.x - p.x, sim.ship.y - p.y) <= p.radius + SHIP_HULL;
}

/** After a flare, keep coasting under gravity and drag until the star, then sink in like a gas giant. */
function stepBurnedFall(sim: Sim, dt: number) {
  const ship = sim.ship;
  const p = crashedHost(sim);
  if (p && shipTouchesHull(sim, p)) {
    if (sim.crashAge === 0) pinToSurface(sim, p);
    sim.crashAge += dt;
    stepSink(sim, dt);
    return;
  }

  const g = gravityAt(ship.x, ship.y, sim.planets, sim.gravityScale);
  const drag = dragNear(ship.x, ship.y, ship.vx, ship.vy, sim.planets, sim.atmoScale);
  ship.vx += (g.ax + drag.ax) * dt;
  ship.vy += (g.ay + drag.ay) * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  if (p && shipTouchesHull(sim, p)) {
    pinToSurface(sim, p);
    sim.crashAge += dt;
    stepSink(sim, dt);
    return;
  }

  sim.nearest = g.nearest;
  sim.altitude = g.dist - g.nearest.radius;
  emitBurnEmbers(sim);
}

function stepSink(sim: Sim, dt: number) {
  const p = crashedHost(sim);
  const ship = sim.ship;
  if (!p) return;
  const dur = sim.reducedMotion ? 0.18 : SINK_DURATION;
  const t = Math.min(1, sim.crashAge / dur);
  const ease = t * t;
  const pad = (p.radius + SHIP_HULL * 0.85) * (1 - ease) + p.radius * 0.46 * ease;
  const ang = sim.landedAngle;
  ship.x = p.x + Math.sin(ang) * pad;
  ship.y = p.y - Math.cos(ang) * pad;
  ship.vx = p.vx;
  ship.vy = p.vy;
  if (!sim.reducedMotion) ship.yaw += dt * 1.35;
  sim.nearest = p;
  sim.altitude = pad - p.radius;
  if (sim.burned) {
    if (t < 0.92) emitBurnEmbers(sim);
  } else emitSinkMist(sim, t);
}

function emitSinkMist(sim: Sim, t: number) {
  if (sim.reducedMotion || t > 0.92) return;
  if (Math.random() > 0.62) return;
  const s = sim.ship;
  const p = crashedHost(sim);
  let tx = 0;
  let ty = -1;
  if (p) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    tx = -dy / d;
    ty = dx / d;
  }
  spawn(
    sim,
    s.x + (Math.random() - 0.5) * 14,
    s.y + (Math.random() - 0.5) * 14,
    s.vx + tx * (6 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1) + (Math.random() - 0.5) * 6,
    s.vy + ty * (6 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1) + (Math.random() - 0.5) * 6,
    0.4 + Math.random() * 0.5,
    1.6 + Math.random() * 2.8,
    40 + Math.random() * 30,
  );
}

function landOnHome(sim: Sim) {
  const home =
    sim.planets.find((p) => p.kicker === "Home") ?? sim.planets.find((p) => p.kind === "rocky");
  if (!home) return;
  sim.landedId = home.id;
  sim.landedAngle = 0;
  sim.ship.thrusting = false;
  sim.ship.reverse = false;
  stickToPlanet(sim, home);
  faceRadial(sim);
  sim.nearest = home;
  sim.altitude = SHIP_HULL * 0.85;
  sim.status = "landed";
  sim.camera.x = sim.ship.x;
  sim.camera.y = sim.ship.y;
}

function copyPlanets(planets: Planet[]): Planet[] {
  return planets.map((p) => ({ ...p }));
}

function isOrbiting(p: Planet) {
  return p.parentId != null && p.orbitR != null && p.orbitA != null && p.orbitW != null;
}

function stepOrbitingBodies(planets: Planet[], dt: number, gravityScale: number) {
  for (const p of planets) {
    if (!isOrbiting(p)) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    const parent = planets.find((b) => b.id === p.parentId);
    if (!parent || p.orbitR == null || p.orbitA == null || p.orbitW == null) continue;
    const a = p.orbitR;
    const e = p.orbitE ?? 0;
    const peri = p.orbitPeri ?? 0;
    const n = railOmega(p, gravityScale);
    const r = bodyOrbitRadius(p);
    const dTheta = n * ((a * a) / Math.max(r * r, 1e-8)) * Math.sqrt(Math.max(0, 1 - e * e)) * dt;
    p.orbitA += dTheta;
    const mu = n * n * a * a * a;
    const k = keplerRail(a, e, peri, p.orbitA, mu);
    p.vx = parent.vx + k.vx;
    p.vy = parent.vy + k.vy;
    p.x = parent.x + k.x;
    p.y = parent.y + k.y;
  }
}

function updateMoons(sim: Sim, dt: number) {
  for (const p of sim.planets) p.rotate += p.spin * dt;
  stepOrbitingBodies(sim.planets, dt, sim.gravityScale);
}

function applySteer(ship: Ship, controls: { steer: number; aimYaw: number | null }, dt: number) {
  if (controls.aimYaw != null) {
    let d = wrapPi(controls.aimYaw - ship.yaw);
    const max = TURN_RATE * 1.15 * dt;
    if (d > max) d = max;
    if (d < -max) d = -max;
    ship.yaw += d;
  } else {
    ship.yaw += controls.steer * TURN_RATE * dt;
  }
}

function lockHint(name: string, e: number) {
  return e >= 0.08 ? `Ellipse locked · ${name}` : `Orbit locked · ${name}`;
}

type Kepler = {
  e: number;
  h: number;
  peri: number;
  nu: number;
  mu: number;
};

function keplerRadius(k: Kepler) {
  const pParam = (k.h * k.h) / k.mu;
  return pParam / (1 + k.e * Math.cos(k.nu));
}

function advanceKeplerNu(k: Kepler, dt: number) {
  const r = keplerRadius(k);
  return wrapPi(k.nu + (k.h / (r * r)) * dt);
}

function applyKepler(ship: Ship, p: Planet, k: Kepler) {
  const r = keplerRadius(k);
  const theta = k.peri + k.nu;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const vr = (k.mu * k.e * Math.sin(k.nu)) / k.h;
  const vt = k.h / r;
  ship.x = p.x + r * ct;
  ship.y = p.y + r * st;
  ship.vx = p.vx + vr * ct + vt * -st;
  ship.vy = p.vy + vr * st + vt * ct;
  return r;
}

const KEPLER_ENERGY_BOUND = -0.02;
const KEPLER_E_MAX = 0.92;
const KEPLER_H_MIN = 10;
const KEPLER_E_CIRC = 0.04;
const WELL_DOMINANT_FACTOR = 2.2;

type KeplerReject =
  "close" | "gravity" | "radial" | "unbound" | "semimajor" | "eccentric" | "periapsis" | "apoapsis";

type KeplerInspect = {
  r: number;
  mu: number;
  h: number;
  energy: number | null;
  a: number | null;
  e: number | null;
  periapsis: number | null;
  apoapsis: number | null;
  minR: number;
  maxApo: number;
  reject: KeplerReject | null;
  dx: number;
  dy: number;
  ex: number;
  ey: number;
};

function inspectKepler(
  p: Planet,
  ship: Ship,
  gravityScale: number,
  planets: Planet[],
): KeplerInspect | null {
  const dx = ship.x - p.x;
  const dy = ship.y - p.y;
  const r = Math.hypot(dx, dy);
  if (r < 1e-8) return null;
  const minR = p.radius + SHIP_HULL + 16;
  const rvx = ship.vx - p.vx;
  const rvy = ship.vy - p.vy;
  const mu = bodyMu(p, gravityScale);
  const h = dx * rvy - dy * rvx;
  const v2 = rvx * rvx + rvy * rvy;
  let maxApo =
    p.kind === "star"
      ? p.radius + Math.min(p.radius * KEPLER_STAR_APO_FACTOR, KEPLER_STAR_APO_CAP)
      : p.radius + Math.min(p.radius * 4.8, 720);
  const sibling = twinOf(p, planets);
  if (sibling) {
    const sep = Math.hypot(p.x - sibling.x, p.y - sibling.y);
    maxApo = Math.min(maxApo, sep - sibling.radius - SHIP_HULL - 20);
  }
  let energy: number | null = null;
  let a: number | null = null;
  let e: number | null = null;
  let ex = 0;
  let ey = 0;
  let periapsis: number | null = null;
  let apoapsis: number | null = null;
  if (mu > 0) {
    energy = 0.5 * v2 - mu / r;
    if (energy !== 0 && Number.isFinite(energy)) a = -mu / (2 * energy);
    ex = (rvy * h) / mu - dx / r;
    ey = (-rvx * h) / mu - dy / r;
    e = Math.hypot(ex, ey);
    if (a != null && a > 0 && Number.isFinite(a) && e != null) {
      periapsis = a * (1 - e);
      apoapsis = a * (1 + e);
    }
  }
  let reject: KeplerReject | null = null;
  if (r < minR) reject = "close";
  else if (mu <= 0) reject = "gravity";
  else if (Math.abs(h) < KEPLER_H_MIN) reject = "radial";
  else if (energy == null || energy >= KEPLER_ENERGY_BOUND) reject = "unbound";
  else if (a == null || a <= 0 || !Number.isFinite(a)) reject = "semimajor";
  else if (e != null && e >= KEPLER_E_MAX) reject = "eccentric";
  else if (periapsis != null && periapsis < minR) reject = "periapsis";
  else if (apoapsis != null && apoapsis > maxApo) reject = "apoapsis";
  return { r, mu, h, energy, a, e, periapsis, apoapsis, minR, maxApo, reject, dx, dy, ex, ey };
}

function keplerFromInspect(info: KeplerInspect): Kepler | null {
  if (info.reject || info.e == null || info.mu <= 0) return null;
  if (info.e < KEPLER_E_CIRC) {
    const sign = info.h >= 0 ? 1 : -1;
    return {
      e: 0,
      h: sign * Math.sqrt(info.mu * info.r),
      peri: Math.atan2(info.dy, info.dx),
      nu: 0,
      mu: info.mu,
    };
  }
  return {
    e: info.e,
    h: info.h,
    peri: Math.atan2(info.ey, info.ex),
    nu: wrapPi(Math.atan2(info.dy, info.dx) - Math.atan2(info.ey, info.ex)),
    mu: info.mu,
  };
}

function readKepler(p: Planet, ship: Ship, gravityScale: number, planets: Planet[]): Kepler | null {
  const info = inspectKepler(p, ship, gravityScale, planets);
  if (!info) return null;
  return keplerFromInspect(info);
}

function wellInspect(p: Planet, x: number, y: number, planets: Planet[]) {
  const d = Math.hypot(x - p.x, y - p.y) || 1;
  const aThis = (G * p.mass) / (d * d);
  if (p.kind === "moon") {
    let aMax = 0;
    for (const q of planets) {
      if (q.id === p.id || isGhostBody(q)) continue;
      const dq = Math.hypot(x - q.x, y - q.y) || 1;
      aMax = Math.max(aMax, (G * q.mass) / (dq * dq));
    }
    const ratio = aMax <= 0 ? Infinity : aThis / aMax;
    return { ratio, limit: 1, ok: aThis > aMax };
  }
  let aRest = 0;
  for (const q of planets) {
    if (q.id === p.id || isGhostBody(q)) continue;
    const dq = Math.hypot(x - q.x, y - q.y) || 1;
    aRest += (G * q.mass) / (dq * dq);
  }
  const ratio = aRest <= 0 ? Infinity : aThis / aRest;
  return { ratio, limit: WELL_DOMINANT_FACTOR, ok: aThis > aRest * WELL_DOMINANT_FACTOR };
}

function wellDominant(p: Planet, x: number, y: number, planets: Planet[]) {
  return wellInspect(p, x, y, planets).ok;
}

function captureOrbit(sim: Sim, p: Planet) {
  const k = readKepler(p, sim.ship, sim.gravityScale, sim.planets);
  if (!k) return false;
  const r = applyKepler(sim.ship, p, k);
  sim.orbitLockId = p.id;
  sim.orbitLockR = r;
  sim.orbitLockA = k.nu;
  sim.orbitLockSign = k.h >= 0 ? 1 : -1;
  sim.orbitLockE = k.e;
  sim.orbitLockPeri = k.peri;
  sim.orbitLockH = k.h;
  sim.orbitDwell = 0;
  sim.status = "orbit";
  sim.orbitHint = lockHint(p.name, k.e);
  return true;
}

function lockedKepler(sim: Sim): Kepler | null {
  if (!sim.orbitLockId || sim.orbitLockH === 0 || sim.gravityScale <= 0) return null;
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) return null;
  return {
    e: sim.orbitLockE,
    h: sim.orbitLockH,
    peri: sim.orbitLockPeri,
    nu: sim.orbitLockA,
    mu: bodyMu(p, sim.gravityScale),
  };
}

/** Closed relative ellipse the lock snaps to (host at its current position). */
export function lockedOrbitPolyline(sim: Sim, samples = 64): { x: number; y: number }[] {
  const p = sim.orbitLockId ? sim.planets.find((b) => b.id === sim.orbitLockId) : undefined;
  const k = lockedKepler(sim);
  if (!p || !k) return [];
  const n = k.e < 0.05 ? 48 : Math.max(48, samples);
  const sign = Math.sign(k.h || 1);
  const ghost: Ship = { ...sim.ship };
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    applyKepler(ghost, p, { ...k, nu: wrapPi(k.nu + (Math.PI * 2 * i * sign) / n) });
    pts.push({ x: ghost.x, y: ghost.y });
  }
  return pts;
}

function breakOrbitLock(sim: Sim) {
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.orbitLockCooldown = ORBIT_BREAK_COOLDOWN;
}

function dumpCurrentLock(sim: Sim, hint: string) {
  sim.orbitDragAlarm = true;
  sim.orbitDragHintT = 1.6;
  sim.orbitBreakHint = hint;
  sim.orbitHint = hint;
  if (sim.lagrangeLockKey) breakLagrangeLock(sim);
  else breakOrbitLock(sim);
}

/** Other bodies' gravity at the ship, minus the same pull at the host. Kepler already rides the host's frame. */
function orbitPerturbRatio(
  host: Planet,
  x: number,
  y: number,
  planets: Planet[],
  gravityScale: number,
) {
  const hostPull = bodyAccel(host, x, y, gravityScale).a;
  if (hostPull < 1e-8) return Infinity;
  let ax = 0;
  let ay = 0;
  for (const q of planets) {
    if (q.id === host.id || isGhostBody(q)) continue;
    const atShip = bodyAccel(q, x, y, gravityScale);
    const atHost = bodyAccel(q, host.x, host.y, gravityScale);
    ax += atShip.ax - atHost.ax;
    ay += atShip.ay - atHost.ay;
  }
  return Math.hypot(ax, ay) / hostPull;
}

/** Extra bodies beyond the Lagrange pair. The pair is the lock, not a perturbation. */
function lagrangePerturbRatio(pt: LagrangePoint, sim: Sim) {
  const body = sim.planets.find((p) => p.id === pt.planetId);
  const parent = body?.parentId ? sim.planets.find((p) => p.id === body.parentId) : undefined;
  if (!body || !parent) return Infinity;
  const pair = new Set([body.id, parent.id]);
  if (isGhostBody(parent)) {
    pair.delete(parent.id);
    for (const q of sim.planets) {
      if (q.parentId === parent.id && !isGhostBody(q)) pair.add(q.id);
    }
  }
  let ax = 0;
  let ay = 0;
  let charA = 0;
  for (const q of sim.planets) {
    if (isGhostBody(q)) continue;
    const pull = bodyAccel(q, sim.ship.x, sim.ship.y, sim.gravityScale);
    if (pair.has(q.id)) {
      if (pull.a > charA) charA = pull.a;
      continue;
    }
    ax += pull.ax;
    ay += pull.ay;
  }
  if (charA < 1e-8) return Infinity;
  return Math.hypot(ax, ay) / charA;
}

export function orbitPerturb(sim: Sim) {
  if (sim.orbitLockId) {
    const p = sim.planets.find((b) => b.id === sim.orbitLockId);
    if (!p) return 0;
    const r = orbitPerturbRatio(p, sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale);
    return Number.isFinite(r) ? r : 1;
  }
  if (sim.lagrangeLockKey) {
    const pt = listLagrangePoints(sim).find((p) => p.key === sim.lagrangeLockKey);
    if (!pt) return 0;
    const r = lagrangePerturbRatio(pt, sim);
    return Number.isFinite(r) ? r : 1;
  }
  return 0;
}

function stepLockedOrbit(
  sim: Sim,
  dt: number,
  controls: {
    steer: number;
    forward: boolean;
    reverse: boolean;
    aimYaw: number | null;
    aimThrust: boolean;
  },
) {
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) {
    sim.orbitLockId = null;
    return false;
  }
  const ship = sim.ship;
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;
  if (ship.thrusting || ship.reverse) {
    breakOrbitLock(sim);
    return false;
  }
  if (atmoDrag(sim) > ORBIT_DRAG_BREAK) {
    dumpCurrentLock(sim, ORBIT_DRAG_HINT);
    return false;
  }
  if (orbitPerturbRatio(p, ship.x, ship.y, sim.planets, sim.gravityScale) > ORBIT_PERTURB_BREAK) {
    dumpCurrentLock(sim, ORBIT_PERTURB_HINT);
    return false;
  }
  const k = lockedKepler(sim);
  if (!k) {
    sim.orbitLockId = null;
    return false;
  }
  k.nu = advanceKeplerNu(k, dt);
  sim.orbitLockA = k.nu;
  sim.orbitLockR = applyKepler(ship, p, k);
  sim.nearest = p;
  sim.altitude = sim.orbitLockR - p.radius;
  sim.status = "orbit";
  sim.orbitHint = lockHint(p.name, k.e);
  return true;
}

export function stepSim(
  sim: Sim,
  dt: number,
  controls: {
    steer: number;
    forward: boolean;
    reverse: boolean;
    aimYaw: number | null;
    aimThrust: boolean;
  },
) {
  updateMoons(sim, dt);
  invalidateLagrange(sim);
  stepFlares(sim, dt);

  const ship = sim.ship;
  if (sim.phase === "title") {
    if (sim.landedId) {
      const p = sim.planets.find((b) => b.id === sim.landedId);
      if (p) {
        stickToPlanet(sim, p);
        sim.nearest = p;
        sim.altitude = SHIP_HULL * 0.85;
        sim.status = "landed";
      }
    } else {
      const g = gravityAt(ship.x, ship.y, sim.planets, sim.gravityScale);
      sim.nearest = g.nearest;
      sim.altitude = g.dist - g.nearest.radius;
    }
    decayParticles(sim, dt);
    updateCamera(sim, dt);
    return;
  }

  if (sim.phase === "crashed") {
    if (sim.burned) {
      stepBurnedFall(sim, dt);
    } else if (sim.crashKind === "sink") {
      sim.crashAge += dt;
      stepSink(sim, dt);
    } else if (sim.crashedId) {
      sim.crashAge += dt;
      const p = sim.planets.find((b) => b.id === sim.crashedId);
      if (p) {
        carryOnSurface(sim, p, dt);
        sim.nearest = p;
        sim.altitude = SHIP_HULL * 0.85;
      }
    }
    decayParticles(sim, dt);
    updateCamera(sim, dt);
    ship.thrusting = false;
    ship.reverse = false;
    sim.status = "crashed";
    sim.orbitHint = null;
    sim.orbitLockId = null;
    sim.lagrangeLockKey = null;
    return;
  }

  if (sim.phase === "landed" && sim.landedId) {
    const p = sim.planets.find((b) => b.id === sim.landedId);
    if (p) {
      carryOnSurface(sim, p, dt);
      stickToPlanet(sim, p);
      faceRadial(sim);
      ship.thrusting = false;
    }
    decayParticles(sim, dt);
    updateCamera(sim, dt);
    return;
  }

  applySteer(ship, controls, dt);

  if (sim.lagrangeLockKey) {
    if (stepLockedLagrange(sim, dt, controls)) {
      if (shipHitsFlare(sim)) burnInFlare(sim);
      decayParticles(sim, dt);
      updateCamera(sim, dt);
      return;
    }
  }

  if (sim.orbitLockId) {
    if (stepLockedOrbit(sim, dt, controls)) {
      if (shipHitsFlare(sim)) burnInFlare(sim);
      decayParticles(sim, dt);
      updateCamera(sim, dt);
      return;
    }
  }

  const f = forwardOf(ship.yaw);
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;

  const {
    ax: gx,
    ay: gy,
    nearest,
    dist,
  } = gravityAt(ship.x, ship.y, sim.planets, sim.gravityScale);
  const drag = dragNear(ship.x, ship.y, ship.vx, ship.vy, sim.planets, sim.atmoScale);

  let tx = 0;
  let ty = 0;
  if (ship.thrusting) {
    const a = THRUST_FORCE / ship.mass;
    tx += f.x * a;
    ty += f.y * a;
    emitExhaust(sim, f, 1);
  } else if (ship.reverse) {
    const a = RETRO_FORCE / ship.mass;
    tx -= f.x * a;
    ty -= f.y * a;
    emitExhaust(sim, { x: -f.x, y: -f.y }, 0.45);
  }

  ship.vx += (gx + drag.ax + tx) * dt;
  ship.vy += (gy + drag.ay + ty) * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  collidePlanets(sim);
  if (sim.phase === "flight" && shipHitsFlare(sim)) burnInFlare(sim);

  sim.nearest = nearest;
  sim.altitude = dist - nearest.radius;
  classify(sim, nearest, dist);
  decayParticles(sim, dt);
  updateCamera(sim, dt);
}

function emitExhaust(sim: Sim, f: { x: number; y: number }, power: number) {
  const s = sim.ship;
  const n = sim.reducedMotion ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const spread = (Math.random() - 0.5) * 0.5;
    const bx = f.x * Math.cos(spread) - f.y * Math.sin(spread);
    const by = f.x * Math.sin(spread) + f.y * Math.cos(spread);
    spawn(
      sim,
      s.x - bx * 12,
      s.y - by * 12,
      s.vx - bx * (26 + Math.random() * 18) * power + (Math.random() - 0.5) * 8,
      s.vy - by * (26 + Math.random() * 18) * power + (Math.random() - 0.5) * 8,
      0.28 + Math.random() * 0.22,
      1.2 + Math.random() * 1.5 * power,
      28 + Math.random() * 18,
    );
  }
}

export function crashKindFor(p: Planet): CrashKind {
  if (p.kind === "star") return "burn";
  if (p.kind === "gas") return "sink";
  return "wreck";
}

export const SINK_DURATION = 1.55;

export function sinkAlpha(sim: Sim) {
  if (sim.crashKind !== "sink" && !sim.burned) return 1;
  const t = Math.min(1, sim.crashAge / (sim.reducedMotion ? 0.18 : SINK_DURATION));
  return Math.max(0, 1 - t * t);
}

function crashInto(sim: Sim, p: Planet, nx: number, ny: number, rel: number) {
  const s = sim.ship;
  const kind = crashKindFor(p);
  sim.phase = "crashed";
  sim.crashedId = p.id;
  sim.crashKind = kind;
  sim.crashAge = 0;
  sim.wreckSeed = Math.random() * 1000;
  sim.burned = kind === "burn";
  sim.burnCause = kind === "burn" ? "star" : null;
  sim.landedId = null;
  sim.landedAngle = Math.atan2(nx, -ny);
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.lagrangeLockKey = null;
  sim.lagrangeDwell = 0;
  sim.status = "crashed";
  sim.orbitHint = null;
  stickToPlanet(sim, p);
  s.thrusting = false;
  s.reverse = false;
  sim.camera.trauma = 1;
  burstWreck(sim, nx, ny, kind);
  void rel;
}

export function flareApexNow(f: SolarFlare, starR: number) {
  const age = 1 - Math.max(0, Math.min(1, f.life / f.max));
  let env = 0;
  if (age < 0.2) {
    const t = age / 0.2;
    env = t * t * (3 - 2 * t);
  } else if (age < 0.72) env = 1;
  else {
    const t = (age - 0.72) / 0.28;
    env = 1 - t * t * (3 - 2 * t);
  }
  return starR + (f.reach - starR) * env;
}

function spawnFlare(star: Planet, reduced: boolean): SolarFlare {
  const long = Math.random() < FLARE_LONG_CHANCE;
  const reach = star.radius * (long ? 3.05 + Math.random() * 0.95 : 1.52 + Math.random() * 0.72);
  const max = reduced ? 12 + Math.random() * 6 : 8.5 + Math.random() * 7.5;
  return {
    angle: Math.random() * Math.PI * 2,
    span: (long ? 0.52 : 0.36) + Math.random() * 0.55,
    spin: reduced ? 0 : (Math.random() - 0.5) * 0.045,
    reach,
    baseW: 7 + Math.random() * 6,
    life: max,
    max,
    seed: Math.random() * 1000,
    strands: reduced ? 3 : 5 + Math.floor(Math.random() * 3),
  };
}

function stepFlares(sim: Sim, dt: number) {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star) {
    sim.flares.length = 0;
    return;
  }
  for (const f of sim.flares) {
    f.life -= dt;
    f.angle += f.spin * dt;
  }
  sim.flares = sim.flares.filter((f) => f.life > 0);
  const cap = sim.reducedMotion ? 1 : FLARE_CAP;
  sim.flareWait -= dt;
  if (sim.flareWait > 0) return;
  if (sim.flares.length < cap) sim.flares.push(spawnFlare(star, sim.reducedMotion));
  sim.flareWait = sim.reducedMotion ? 14 + Math.random() * 8 : 8 + Math.random() * 10;
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return { d: Math.hypot(px - ax, py - ay), t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

export function flareArcPoints(star: Planet, f: SolarFlare, n = 22): { x: number; y: number }[] {
  const R = star.radius;
  const apex = flareApexNow(f, R);
  if (apex < R + 8) return [];
  const alpha = Math.max(0.12, f.span * 0.5);
  const ux = Math.cos(f.angle);
  const uy = Math.sin(f.angle);
  const ax = star.x + Math.cos(f.angle - alpha) * R;
  const ay = star.y + Math.sin(f.angle - alpha) * R;
  const bx = star.x + Math.cos(f.angle + alpha) * R;
  const by = star.y + Math.sin(f.angle + alpha) * R;
  const cDist = 2 * apex - R * Math.cos(alpha);
  const cx = star.x + ux * cDist;
  const cy = star.y + uy * cDist;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * ax + 2 * mt * t * cx + t * t * bx,
      y: mt * mt * ay + 2 * mt * t * cy + t * t * by,
    });
  }
  return pts;
}

export function shipHitsFlare(sim: Sim): boolean {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star || !sim.flares.length) return false;
  const sx = sim.ship.x;
  const sy = sim.ship.y;
  for (const f of sim.flares) {
    const pts = flareArcPoints(star, f, 18);
    if (pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const hit = distPointSeg(sx, sy, a.x, a.y, b.x, b.y);
      if (hit.d < f.baseW + SHIP_HULL * 0.65) return true;
    }
  }
  return false;
}

function burnInFlare(sim: Sim) {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star || sim.phase === "crashed") return;
  const s = sim.ship;
  sim.phase = "crashed";
  sim.burned = true;
  sim.burnCause = "flare";
  sim.crashKind = "burn";
  sim.crashAge = 0;
  sim.wreckSeed = Math.random() * 1000;
  sim.crashedId = star.id;
  sim.landedId = null;
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.lagrangeLockKey = null;
  sim.lagrangeDwell = 0;
  sim.status = "crashed";
  sim.orbitHint = null;
  s.thrusting = false;
  s.reverse = false;
  sim.camera.trauma = 1;
  burstWreck(sim, 0, 0, "burn");
}

function burstWreck(sim: Sim, nx: number, ny: number, kind: CrashKind) {
  const s = sim.ship;
  const hot = kind === "burn";
  const sink = kind === "sink";
  const n = sim.reducedMotion ? (hot ? 10 : sink ? 8 : 8) : hot ? 26 : sink ? 16 : 22;
  const spread = hot ? 120 : sink ? 36 : 78;
  const along = sink ? -22 : 20;
  for (let i = 0; i < n; i++) {
    spawn(
      sim,
      s.x + (hot || sink ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 6),
      s.y + (hot || sink ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 6),
      s.vx + nx * (along + Math.random() * (sink ? 28 : 90)) + (Math.random() - 0.5) * spread,
      s.vy + ny * (along + Math.random() * (sink ? 28 : 90)) + (Math.random() - 0.5) * spread,
      (hot ? 0.5 : sink ? 0.55 : 0.5) + Math.random() * (hot ? 0.55 : 0.45),
      (hot ? 1.6 : sink ? 1.8 : 1.5) + Math.random() * (hot ? 3.2 : sink ? 2.6 : 2.8),
      hot ? 8 + Math.random() * 40 : sink ? 38 + Math.random() * 28 : 22 + Math.random() * 24,
    );
  }
}

function burnLift(sim: Sim): { x: number; y: number } {
  const s = sim.ship;
  const p = crashedHost(sim);
  let rx = 0;
  let ry = -1;
  if (p) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    rx = dx / d;
    ry = dy / d;
  }
  const sp = Math.hypot(s.vx, s.vy);
  if (p && !shipTouchesHull(sim, p) && sp > 6) {
    const x = (-s.vx / sp) * 0.65 + rx * 0.35;
    const y = (-s.vy / sp) * 0.65 + ry * 0.35;
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }
  return { x: rx, y: ry };
}

function emitBurnEmbers(sim: Sim) {
  if (sim.reducedMotion) return;
  const s = sim.ship;
  const lift = burnLift(sim);
  const n = Math.random() < 0.55 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const jitter = (Math.random() - 0.5) * 0.9;
    const jx = -lift.y * jitter;
    const jy = lift.x * jitter;
    const speed = 14 + Math.random() * 22;
    spawn(
      sim,
      s.x + (Math.random() - 0.5) * 10,
      s.y + (Math.random() - 0.5) * 10,
      s.vx + (lift.x + jx) * speed + (Math.random() - 0.5) * 8,
      s.vy + (lift.y + jy) * speed + (Math.random() - 0.5) * 8,
      0.28 + Math.random() * 0.42,
      1.1 + Math.random() * 2.1,
      10 + Math.random() * 38,
    );
  }
}

function collidePlanets(sim: Sim) {
  const s = sim.ship;
  for (const p of sim.planets) {
    if (isGhostBody(p) || p.radius <= 0) continue;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const min = p.radius + SHIP_HULL;
    if (d >= min) continue;
    const nx = dx / d;
    const ny = dy / d;
    const rvx = s.vx - p.vx;
    const rvy = s.vy - p.vy;
    const rel = Math.hypot(rvx, rvy);
    const vn = rvx * nx + rvy * ny;

    s.x = p.x + nx * min;
    s.y = p.y + ny * min;

    const canLand = p.landable && sim.phase === "flight" && rel < LAND_SPEED && vn < 14;
    if (canLand) {
      sim.phase = "landed";
      sim.landedId = p.id;
      sim.crashedId = null;
      sim.landedAngle = Math.atan2(nx, -ny);
      sim.status = "landed";
      sim.orbitLockId = null;
      sim.lagrangeLockKey = null;
      sim.lagrangeDwell = 0;
      s.vx = p.vx;
      s.vy = p.vy;
      faceRadial(sim);
      sim.camera.trauma = Math.min(1, sim.camera.trauma + 0.18);
      return;
    }

    crashInto(sim, p, nx, ny, rel);
    return;
  }
}

function orbitReady(sim: Sim, nearest: Planet, dist: number) {
  if (sim.orbitLockCooldown > 0) return false;
  if (sim.ship.thrusting || sim.ship.reverse) return false;
  const alt = dist - nearest.radius;
  const { minAlt, maxAlt } = orbitShellAlts(nearest, sim.planets);
  if (alt < minAlt || alt > maxAlt) return false;
  if (!wellDominant(nearest, sim.ship.x, sim.ship.y, sim.planets)) return false;
  if (atmoDrag(sim) > ORBIT_DRAG_BREAK) return false;
  if (
    orbitPerturbRatio(nearest, sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale) >
    ORBIT_PERTURB_BREAK
  )
    return false;
  return readKepler(nearest, sim.ship, sim.gravityScale, sim.planets) != null;
}

function fmtDiag(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "∞";
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  return n.toFixed(digits);
}

function keplerGate(info: KeplerInspect, p: Planet): string | null {
  switch (info.reject) {
    case "close":
      return "CLOSE";
    case "gravity":
      return "GRAVITY OFF";
    case "radial":
      return "RADIAL";
    case "unbound":
      return "UNBOUND";
    case "semimajor":
      return "UNBOUND";
    case "eccentric":
      return `ECC ${fmtDiag(info.e ?? 0)} / ${fmtDiag(KEPLER_E_MAX)}`;
    case "periapsis":
      return `PERI ${fmtDiag((info.periapsis ?? 0) - p.radius)}`;
    case "apoapsis":
      return `APO ${fmtDiag((info.apoapsis ?? 0) - p.radius)} / ${fmtDiag(info.maxApo - p.radius)}`;
    default:
      return null;
  }
}

export function verboseDiag(sim: Sim): VerboseDiag {
  const ship = sim.ship;
  const host =
    (sim.orbitLockId ? sim.planets.find((b) => b.id === sim.orbitLockId) : null) ?? sim.nearest;
  const g = gravityAt(ship.x, ship.y, sim.planets, sim.gravityScale);
  const dragVec = dragNear(ship.x, ship.y, ship.vx, ship.vy, sim.planets, sim.atmoScale);
  const drag = Math.hypot(dragVec.ax, dragVec.ay);
  const accelG = Math.hypot(g.ax, g.ay);
  const accelDrag = Math.hypot(dragVec.ax, dragVec.ay);
  const accelThrust = ship.thrusting
    ? THRUST_FORCE / ship.mass
    : ship.reverse
      ? RETRO_FORCE / ship.mass
      : 0;

  const info = host ? inspectKepler(host, ship, sim.gravityScale, sim.planets) : null;
  const well = host ? wellInspect(host, ship.x, ship.y, sim.planets) : null;
  const shell = host ? orbitShellAlts(host, sim.planets) : null;
  const alt = host ? Math.hypot(ship.x - host.x, ship.y - host.y) - host.radius : sim.altitude;
  const relSpeed = host
    ? Math.hypot(ship.vx - host.vx, ship.vy - host.vy)
    : Math.hypot(ship.vx, ship.vy);
  const vCirc = info && info.mu > 0 && info.r > 0 ? Math.sqrt(info.mu / info.r) : null;

  let perturb = 0;
  if (sim.lagrangeLockKey) {
    const pt = listLagrangePoints(sim).find((p) => p.key === sim.lagrangeLockKey);
    perturb = pt ? lagrangePerturbRatio(pt, sim) : Infinity;
  } else if (host) {
    perturb = orbitPerturbRatio(host, ship.x, ship.y, sim.planets, sim.gravityScale);
  }

  let lagrange: string | null = null;
  let nearL: LagrangePoint | null = null;
  let nearLd = Infinity;
  for (const pt of listLagrangePoints(sim)) {
    const d = Math.hypot(ship.x - pt.x, ship.y - pt.y);
    if (d < nearLd) {
      nearLd = d;
      nearL = pt;
    }
  }
  if (nearL && nearLd <= LAGRANGE_CAPTURE_R * 3) {
    const rel = Math.hypot(ship.vx - nearL.vx, ship.vy - nearL.vy);
    lagrange = `${nearL.kind} Δr ${fmtDiag(nearLd)} / ${LAGRANGE_CAPTURE_R}  Δv ${fmtDiag(rel)} / ${LAGRANGE_CAPTURE_V}`;
  }

  let gate = "COAST";
  let ok = false;
  if (sim.phase === "landed") gate = "LANDED";
  else if (sim.phase === "crashed") gate = "CRASH";
  else if (sim.phase === "title") gate = "TITLE";
  else if (sim.lagrangeLockKey) {
    const kind = sim.lagrangeLockKey.split(":")[1] ?? "L";
    gate = `${kind} LOCKED`;
    ok = true;
  } else if (sim.orbitLockId) {
    gate = sim.orbitLockE >= 0.08 ? "ELLIPSE LOCKED" : "LOCKED";
    ok = true;
  } else if (sim.ship.thrusting || sim.ship.reverse) gate = "THRUST";
  else if (sim.orbitLockCooldown > 0) gate = `COOLDOWN ${fmtDiag(sim.orbitLockCooldown)}`;
  else if (nearL && lagrangeReady(sim, nearL)) {
    gate = `CAPTURING ${nearL.kind} ${fmtDiag(sim.lagrangeDwell)} / ${fmtDiag(LAGRANGE_LOCK_DWELL)}`;
    ok = true;
  } else if (host && shell) {
    const hostAlt = Math.hypot(ship.x - host.x, ship.y - host.y) - host.radius;
    if (hostAlt < shell.minAlt || hostAlt > shell.maxAlt) {
      gate = `SHELL ${fmtDiag(hostAlt, 1)} [${fmtDiag(shell.minAlt, 0)}–${fmtDiag(shell.maxAlt, 0)}]`;
    } else if (well && !well.ok) gate = `WELL ${fmtDiag(well.ratio)} / ${fmtDiag(well.limit)}`;
    else if (drag > ORBIT_DRAG_BREAK) gate = `DRAG ${fmtDiag(drag)} / ${fmtDiag(ORBIT_DRAG_BREAK)}`;
    else if (perturb > ORBIT_PERTURB_BREAK)
      gate = `PERTURB ${fmtDiag(perturb)} / ${fmtDiag(ORBIT_PERTURB_BREAK)}`;
    else if (info?.reject) gate = keplerGate(info, host) ?? "KEPLER";
    else {
      gate = `CAPTURING ${fmtDiag(sim.orbitDwell)} / ${fmtDiag(ORBIT_LOCK_DWELL)}`;
      ok = true;
    }
  }

  return {
    gate,
    ok,
    relSpeed,
    vCirc,
    ecc: info?.e ?? null,
    eccLim: KEPLER_E_MAX,
    energy: info?.energy ?? null,
    alt,
    shellMin: shell?.minAlt ?? null,
    shellMax: shell?.maxAlt ?? null,
    drag,
    dragLim: ORBIT_DRAG_BREAK,
    perturb,
    perturbLim: ORBIT_PERTURB_BREAK,
    accelG,
    accelThrust,
    accelDrag,
    well: well?.ratio ?? null,
    wellLim: well?.limit ?? null,
    periAlt: info?.periapsis != null && host ? info.periapsis - host.radius : null,
    apoAlt: info?.apoapsis != null && host ? info.apoapsis - host.radius : null,
    lagrange,
  };
}

function classify(sim: Sim, nearest: Planet, dist: number) {
  if (sim.orbitDragHintT > 0) sim.orbitDragHintT = Math.max(0, sim.orbitDragHintT - STEP);

  if (sim.phase === "landed") {
    sim.status = "landed";
    sim.orbitHint = null;
    sim.orbitDwell = 0;
    return;
  }
  if (sim.phase === "crashed") {
    sim.status = "crashed";
    sim.orbitHint = null;
    return;
  }
  if (sim.lagrangeLockKey) {
    sim.status = "lagrange";
    return;
  }
  if (sim.orbitLockId) {
    sim.status = "orbit";
    return;
  }

  if (sim.orbitLockCooldown > 0) {
    sim.orbitLockCooldown = Math.max(0, sim.orbitLockCooldown - STEP);
  }

  const s = sim.ship;
  const atmo = atmoRadius(nearest);
  const rel = Math.hypot(s.vx - nearest.vx, s.vy - nearest.vy);
  const powered = s.thrusting || s.reverse;

  const lagrange = nearestLagrange(sim);
  if (lagrange && lagrangeReady(sim, lagrange)) {
    sim.status = "lagrange";
    sim.orbitHint = lagrangeHint(lagrange, false);
    if (sim.lagrangeDwellKey === lagrange.key) sim.lagrangeDwell += STEP;
    else {
      sim.lagrangeDwellKey = lagrange.key;
      sim.lagrangeDwell = STEP;
    }
    if (sim.lagrangeDwell >= LAGRANGE_LOCK_DWELL) captureLagrange(sim, lagrange);
    return;
  }
  sim.lagrangeDwell = 0;
  sim.lagrangeDwellKey = null;

  if (!powered && orbitReady(sim, nearest, dist)) {
    sim.status = "orbit";
    sim.orbitHint = `Capturing ${nearest.name}`;
    sim.orbitDwell += STEP;
    if (sim.orbitDwell >= ORBIT_LOCK_DWELL) captureOrbit(sim, nearest);
    return;
  }
  sim.orbitDwell = 0;

  if (dist < atmo) {
    sim.status = rel > LAND_SPEED * 1.15 ? "too-fast" : "approach";
    sim.orbitHint =
      sim.status === "too-fast"
        ? nearest.landable
          ? "Too fast to land"
          : (nearest.deny ?? "Cannot land")
        : nearest.landable
          ? "Slow to land"
          : (nearest.deny ?? "Cannot land");
  } else {
    sim.status = "deep";
    sim.orbitHint = null;
  }
  if (sim.orbitDragHintT > 0) sim.orbitHint = sim.orbitBreakHint ?? ORBIT_DRAG_HINT;
}

function decayParticles(sim: Sim, dt: number) {
  for (const p of sim.particles) {
    if (!p.alive) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    if (p.life <= 0) p.alive = false;
  }
}

export const USER_ZOOM_MIN = 0.12;
export const USER_ZOOM_MAX = 3.4;

export function applyUserZoom(sim: Sim, factor: number) {
  const next = sim.camera.userZoom * factor;
  sim.camera.userZoom = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, next));
  sim.camera.zoom = sim.camera.zoomAuto * sim.camera.userZoom;
}

export function setUserZoom(sim: Sim, value: number) {
  sim.camera.userZoom = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, value));
  sim.camera.zoom = sim.camera.zoomAuto * sim.camera.userZoom;
}

function updateCamera(sim: Sim, dt: number) {
  const s = sim.ship;
  const look = 0.28;
  const targetX = s.x + s.vx * look;
  const targetY = s.y + s.vy * look;
  const k = sim.phase === "title" ? 1.8 : 3.4;
  const a = 1 - Math.exp(-k * dt);
  sim.camera.x += (targetX - sim.camera.x) * a;
  sim.camera.y += (targetY - sim.camera.y) * a;
  const speed = Math.hypot(s.vx, s.vy);
  const zWant = speed > 42 ? 0.76 : speed > 24 ? 0.88 : 0.98;
  sim.camera.zoomAuto += (zWant - sim.camera.zoomAuto) * (1 - Math.exp(-1.6 * dt));
  sim.camera.zoom = sim.camera.zoomAuto * sim.camera.userZoom;
  sim.camera.trauma = Math.max(0, sim.camera.trauma - dt * 1.6);
  sim.camera.shake = sim.reducedMotion ? 0 : sim.camera.trauma * sim.camera.trauma;
}

export function wrapPi(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function nearestStepIndex(steps: readonly number[], value: number) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const d = Math.abs(steps[i]! - value);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

function stepAlong(steps: readonly number[], value: number, dir: number) {
  const i = nearestStepIndex(steps, value);
  const next = i + (dir < 0 ? -1 : 1);
  if (next < 0 || next >= steps.length) return value;
  return steps[next]!;
}

function syncTitleVelocity(sim: Sim) {
  if (sim.phase !== "title" || sim.landedId) return;
  const start = getStart();
  const k = Math.sqrt(Math.max(0, sim.gravityScale));
  sim.ship.vx = start.vx * k;
  sim.ship.vy = start.vy * k;
}

export function adjustGravityScale(sim: Sim, dir: number) {
  const next = stepAlong(GRAVITY_STEPS, sim.gravityScale, dir);
  if (next === sim.gravityScale) return false;
  sim.gravityScale = next;
  invalidateLagrange(sim);
  syncTitleVelocity(sim);
  if (sim.orbitLockId) {
    const p = sim.planets.find((b) => b.id === sim.orbitLockId);
    if (!p || !captureOrbit(sim, p)) breakOrbitLock(sim);
  }
  return true;
}

export function adjustAtmoScale(sim: Sim, dir: number) {
  const next = stepAlong(ATMO_STEPS, sim.atmoScale, dir);
  if (next === sim.atmoScale) return false;
  sim.atmoScale = next;
  return true;
}

export function relativePathTarget(sim: Sim): Planet | null {
  if (sim.phase !== "flight" || sim.landedId || sim.orbitLockId || sim.lagrangeLockKey) return null;
  const p = sim.nearest;
  if (!p || p.kind === "star" || isGhostBody(p)) return null;
  const dist = Math.hypot(sim.ship.x - p.x, sim.ship.y - p.y);
  const alt = dist - p.radius;
  const { maxAlt } = orbitShellAlts(p, sim.planets);
  const near = Math.max(maxAlt * 2.4, atmoRadius(p) - p.radius + 40, 220);
  if (alt > near || alt < -2) return null;
  return p;
}

export function predictRelativePath(
  sim: Sim,
  target: Planet,
  seconds = 24,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let x = sim.ship.x;
  let y = sim.ship.y;
  let vx = sim.ship.vx;
  let vy = sim.ship.vy;
  const bodies = copyPlanets(sim.planets);
  const origin = { x: target.x, y: target.y };
  const dt = 1 / 36;
  const n = Math.floor(seconds / dt);
  for (let i = 0; i < n; i++) {
    stepOrbitingBodies(bodies, dt, sim.gravityScale);
    const g = gravityAt(x, y, bodies, sim.gravityScale);
    const drag = dragNear(x, y, vx, vy, bodies, sim.atmoScale);
    vx += (g.ax + drag.ax) * dt;
    vy += (g.ay + drag.ay) * dt;
    x += vx * dt;
    y += vy * dt;
    const body = bodies.find((b) => b.id === target.id);
    if (!body) break;
    pts.push({ x: origin.x + (x - body.x), y: origin.y + (y - body.y) });
    if (Math.hypot(x - body.x, y - body.y) < body.radius + 4) break;
  }
  return pts;
}

export function predictPath(sim: Sim, seconds = 9): { x: number; y: number }[] {
  if (sim.lagrangeLockKey) {
    const key = sim.lagrangeLockKey;
    const bodies = copyPlanets(sim.planets);
    const dt = seconds / 48;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 48; i++) {
      stepOrbitingBodies(bodies, dt, sim.gravityScale);
      const pt = lagrangePointByKey(bodies, sim.gravityScale, key);
      if (!pt) break;
      pts.push({ x: pt.x, y: pt.y });
    }
    return pts;
  }
  if (sim.orbitLockId) {
    const hostId = sim.orbitLockId;
    const k0 = lockedKepler(sim);
    if (!k0) return [];
    const bodies = copyPlanets(sim.planets);
    const ghost: Ship = { ...sim.ship };
    const k: Kepler = { ...k0 };
    const dt = STEP;
    const n = Math.max(2, Math.floor(seconds / dt));
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      stepOrbitingBodies(bodies, dt, sim.gravityScale);
      const p = bodies.find((b) => b.id === hostId);
      if (!p) break;
      k.mu = bodyMu(p, sim.gravityScale);
      k.nu = advanceKeplerNu(k, dt);
      applyKepler(ghost, p, k);
      pts.push({ x: ghost.x, y: ghost.y });
    }
    return pts;
  }
  const pts: { x: number; y: number }[] = [];
  let x = sim.ship.x;
  let y = sim.ship.y;
  let vx = sim.ship.vx;
  let vy = sim.ship.vy;
  const bodies = copyPlanets(sim.planets);
  const dt = 1 / 36;
  const n = Math.floor(seconds / dt);
  for (let i = 0; i < n; i++) {
    stepOrbitingBodies(bodies, dt, sim.gravityScale);
    const g = gravityAt(x, y, bodies, sim.gravityScale);
    const drag = dragNear(x, y, vx, vy, bodies, sim.atmoScale);
    vx += (g.ax + drag.ax) * dt;
    vy += (g.ay + drag.ay) * dt;
    x += vx * dt;
    y += vy * dt;
    const hit = bodies.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius + 4);
    pts.push({ x, y });
    if (hit) break;
  }
  return pts;
}

export function predictPlanetPaths(
  sim: Sim,
  seconds = 10,
): { planet: Planet; path: { x: number; y: number }[] }[] {
  const movers = sim.planets.filter((p) => isOrbiting(p) && !isGhostBody(p));
  if (!movers.length) return [];
  const ghosts = copyPlanets(sim.planets);
  const byId = new Map(ghosts.map((p) => [p.id, p]));
  const paths = new Map<string, { x: number; y: number }[]>();
  for (const m of movers) paths.set(m.id, []);
  const dt = 1 / 36;
  const n = Math.floor(seconds / dt);
  for (let i = 0; i < n; i++) {
    stepOrbitingBodies(ghosts, dt, sim.gravityScale);
    for (const m of movers) {
      const g = byId.get(m.id);
      if (!g) continue;
      paths.get(m.id)!.push({ x: g.x, y: g.y });
    }
  }
  return movers.map((p) => ({ planet: p, path: paths.get(p.id) ?? [] }));
}

export { STEP, atmoRadius };
