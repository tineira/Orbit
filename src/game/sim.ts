import type { Camera, FlightStatus, Particle, Planet, Ship } from "./types";
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
  lagrangeLockKey: string | null;
  lagrangeDwellKey: string | null;
  lagrangeDwell: number;
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
    camera: { x: start.x, y: start.y, zoom: 0.96, zoomAuto: 0.96, userZoom: 1, shake: 0, trauma: 0 },
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
    lagrangeLockKey: null,
    lagrangeDwellKey: null,
    lagrangeDwell: 0,
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
  let nearest = planets[0]!;
  let best = Infinity;
  for (const p of planets) {
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

function findRayRoot(
  f: (r: number) => number,
  lo: number,
  hi: number,
): number | null {
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
  const R = body.orbitR;
  const a = body.orbitA;
  const w = railOmega(body, gravityScale);
  if (w <= 0 || R <= parent.radius * 2.2) return [];
  const mu = body.mass / (parent.mass + body.mass);
  const hill = R * Math.cbrt(Math.max(1e-8, mu / 3));
  const fAlong = (r: number) => rayAccel(r, a, parent, body, w, gravityScale);
  const fOpp = (r: number) => rayAccel(r, a + Math.PI, parent, body, w, gravityScale);
  const pad = body.radius + 28;
  const r1 = findRayRoot(fAlong, parent.radius * 1.2, R - pad) ?? Math.max(parent.radius * 1.25, R - hill);
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

export function listLagrangePoints(sim: Sim): LagrangePoint[] {
  if (sim.gravityScale <= 0) return [];
  const byId = new Map(sim.planets.map((p) => [p.id, p]));
  const out: LagrangePoint[] = [];
  for (const p of sim.planets) {
    if (p.kind === "star") continue;
    if (p.parentId == null || p.orbitR == null || p.orbitA == null || p.orbitW == null) continue;
    const parent = byId.get(p.parentId);
    if (!parent) continue;
    out.push(...pointsForPair(p, parent, sim.gravityScale));
  }
  return out;
}

function lagrangeHint(pt: LagrangePoint, locked: boolean) {
  return locked ? `${pt.kind} locked · ${pt.planetName}` : `Capturing ${pt.kind} · ${pt.planetName}`;
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
  return rel <= LAGRANGE_CAPTURE_V;
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
  controls: { steer: number; forward: boolean; reverse: boolean; aimYaw: number | null; aimThrust: boolean },
) {
  const pt = listLagrangePoints(sim).find((p) => p.key === sim.lagrangeLockKey);
  if (!pt) {
    sim.lagrangeLockKey = null;
    return false;
  }
  const ship = sim.ship;
  applySteer(ship, controls, dt);
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;
  if (ship.thrusting || ship.reverse) {
    breakLagrangeLock(sim);
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
  return p.radius * (p.kind === "gas" ? 1.85 : p.kind === "star" ? 2.1 : 1.72);
}

function dragNear(x: number, y: number, vx: number, vy: number, planets: Planet[], atmoScale: number) {
  if (atmoScale <= 0) return { ax: 0, ay: 0 };
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
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

function spawn(sim: Sim, x: number, y: number, vx: number, vy: number, life: number, size: number, hue: number) {
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

function landOnHome(sim: Sim) {
  const home =
    sim.planets.find((p) => p.kicker === "Home") ?? sim.planets.find((p) => p.kind === "rocky");
  if (!home) return;
  sim.landedId = home.id;
  sim.landedAngle = 0;
  sim.ship.yaw = 0;
  sim.ship.thrusting = false;
  sim.ship.reverse = false;
  stickToPlanet(sim, home);
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
  const wMul = Math.sqrt(Math.max(0, gravityScale));
  for (const p of planets) {
    if (!isOrbiting(p)) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    const parent = planets.find((b) => b.id === p.parentId);
    if (!parent || p.orbitR == null || p.orbitA == null || p.orbitW == null) continue;
    p.orbitA += p.orbitW * wMul * dt;
    const nx = parent.x + Math.cos(p.orbitA) * p.orbitR;
    const ny = parent.y + Math.sin(p.orbitA) * p.orbitR;
    p.vx = (nx - p.x) / dt;
    p.vy = (ny - p.y) / dt;
    p.x = nx;
    p.y = ny;
  }
}

function updateMoons(sim: Sim, dt: number) {
  for (const p of sim.planets) p.rotate += p.spin * dt;
  stepOrbitingBodies(sim.planets, dt, sim.gravityScale);
}

function applySteer(
  ship: Ship,
  controls: { steer: number; aimYaw: number | null },
  dt: number,
) {
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

function readKepler(p: Planet, ship: Ship, gravityScale: number): Kepler | null {
  const dx = ship.x - p.x;
  const dy = ship.y - p.y;
  const r = Math.hypot(dx, dy);
  const minR = p.radius + SHIP_HULL + 16;
  if (r < minR) return null;
  const rvx = ship.vx - p.vx;
  const rvy = ship.vy - p.vy;
  const mu = bodyMu(p, gravityScale);
  if (mu <= 0) return null;
  const h = dx * rvy - dy * rvx;
  if (Math.abs(h) < 10) return null;
  const v2 = rvx * rvx + rvy * rvy;
  const energy = 0.5 * v2 - mu / r;
  if (energy >= -0.02) return null;
  const a = -mu / (2 * energy);
  if (a <= 0 || !Number.isFinite(a)) return null;
  const ex = (rvy * h) / mu - dx / r;
  const ey = (-rvx * h) / mu - dy / r;
  const e = Math.hypot(ex, ey);
  if (e >= 0.92) return null;
  const periapsis = a * (1 - e);
  if (periapsis < minR) return null;
  const apoapsis = a * (1 + e);
  const maxApo = p.radius + Math.min(p.radius * 4.8, 720);
  if (apoapsis > maxApo) return null;

  if (e < 0.04) {
    const sign = h >= 0 ? 1 : -1;
    return {
      e: 0,
      h: sign * Math.sqrt(mu * r),
      peri: Math.atan2(dy, dx),
      nu: 0,
      mu,
    };
  }
  return {
    e,
    h,
    peri: Math.atan2(ey, ex),
    nu: wrapPi(Math.atan2(dy, dx) - Math.atan2(ey, ex)),
    mu,
  };
}

function wellDominant(p: Planet, x: number, y: number, planets: Planet[]) {
  const d = Math.hypot(x - p.x, y - p.y) || 1;
  const aThis = (G * p.mass) / (d * d);
  if (p.kind === "moon") {
    for (const q of planets) {
      if (q.id === p.id) continue;
      const dq = Math.hypot(x - q.x, y - q.y) || 1;
      if ((G * q.mass) / (dq * dq) >= aThis) return false;
    }
    return true;
  }
  let aRest = 0;
  for (const q of planets) {
    if (q.id === p.id) continue;
    const dq = Math.hypot(x - q.x, y - q.y) || 1;
    aRest += (G * q.mass) / (dq * dq);
  }
  return aThis > aRest * 2.2;
}

function captureOrbit(sim: Sim, p: Planet) {
  const k = readKepler(p, sim.ship, sim.gravityScale);
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

function breakOrbitLock(sim: Sim) {
  sim.orbitLockId = null;
  sim.orbitDwell = 0;
  sim.orbitLockCooldown = ORBIT_BREAK_COOLDOWN;
}

function dumpLockedOrbit(sim: Sim, hint: string) {
  sim.orbitDragAlarm = true;
  sim.orbitDragHintT = 1.6;
  sim.orbitBreakHint = hint;
  sim.orbitHint = hint;
  breakOrbitLock(sim);
}

/** Other bodies' gravity at the ship, minus the same pull at the host. Kepler already rides the host's frame. */
function orbitPerturbRatio(host: Planet, x: number, y: number, planets: Planet[], gravityScale: number) {
  const hostPull = bodyAccel(host, x, y, gravityScale).a;
  if (hostPull < 1e-8) return Infinity;
  let ax = 0;
  let ay = 0;
  for (const q of planets) {
    if (q.id === host.id) continue;
    const atShip = bodyAccel(q, x, y, gravityScale);
    const atHost = bodyAccel(q, host.x, host.y, gravityScale);
    ax += atShip.ax - atHost.ax;
    ay += atShip.ay - atHost.ay;
  }
  return Math.hypot(ax, ay) / hostPull;
}

export function orbitPerturb(sim: Sim) {
  if (!sim.orbitLockId) return 0;
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) return 0;
  const r = orbitPerturbRatio(p, sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale);
  return Number.isFinite(r) ? r : 1;
}

function stepLockedOrbit(
  sim: Sim,
  dt: number,
  controls: { steer: number; forward: boolean; reverse: boolean; aimYaw: number | null; aimThrust: boolean },
) {
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) {
    sim.orbitLockId = null;
    return false;
  }
  const ship = sim.ship;
  applySteer(ship, controls, dt);
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;
  if (ship.thrusting || ship.reverse) {
    breakOrbitLock(sim);
    return false;
  }
  if (atmoDrag(sim) > ORBIT_DRAG_BREAK) {
    dumpLockedOrbit(sim, ORBIT_DRAG_HINT);
    return false;
  }
  if (orbitPerturbRatio(p, ship.x, ship.y, sim.planets, sim.gravityScale) > ORBIT_PERTURB_BREAK) {
    dumpLockedOrbit(sim, ORBIT_PERTURB_HINT);
    return false;
  }
  const k = lockedKepler(sim);
  if (!k) {
    sim.orbitLockId = null;
    return false;
  }
  const r = keplerRadius(k);
  k.nu = wrapPi(k.nu + (k.h / (r * r)) * dt);
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
  controls: { steer: number; forward: boolean; reverse: boolean; aimYaw: number | null; aimThrust: boolean },
) {
  updateMoons(sim, dt);

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
    if (sim.crashedId) {
      const p = sim.planets.find((b) => b.id === sim.crashedId);
      if (p) {
        sim.landedAngle += p.spin * dt * 0.35;
        stickToPlanet(sim, p);
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
      sim.landedAngle += p.spin * dt * 0.35;
      stickToPlanet(sim, p);
      if (controls.steer) ship.yaw += controls.steer * TURN_RATE * dt;
      if (controls.aimYaw != null) {
        let d = wrapPi(controls.aimYaw - ship.yaw);
        const max = TURN_RATE * dt;
        if (d > max) d = max;
        if (d < -max) d = -max;
        ship.yaw += d;
      }
      ship.thrusting = false;
      if (controls.forward || controls.aimThrust) {
        const f = forwardOf(ship.yaw);
        const nx = (ship.x - p.x) / (p.radius || 1);
        const ny = (ship.y - p.y) / (p.radius || 1);
        if (f.x * nx + f.y * ny > 0.18) takeoff(sim);
      }
    }
    decayParticles(sim, dt);
    updateCamera(sim, dt);
    return;
  }

  if (sim.lagrangeLockKey) {
    if (stepLockedLagrange(sim, dt, controls)) {
      decayParticles(sim, dt);
      updateCamera(sim, dt);
      return;
    }
  }

  if (sim.orbitLockId) {
    if (stepLockedOrbit(sim, dt, controls)) {
      decayParticles(sim, dt);
      updateCamera(sim, dt);
      return;
    }
  }

  applySteer(ship, controls, dt);

  const f = forwardOf(ship.yaw);
  ship.thrusting = controls.forward || controls.aimThrust;
  ship.reverse = controls.reverse && !ship.thrusting;

  const { ax: gx, ay: gy, nearest, dist } = gravityAt(ship.x, ship.y, sim.planets, sim.gravityScale);
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

function crashInto(sim: Sim, p: Planet, nx: number, ny: number, rel: number) {
  const s = sim.ship;
  sim.phase = "crashed";
  sim.crashedId = p.id;
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
  const n = sim.reducedMotion ? 6 : 18;
  for (let i = 0; i < n; i++) {
    spawn(
      sim,
      s.x,
      s.y,
      s.vx + nx * (20 + Math.random() * 90) + (Math.random() - 0.5) * 70,
      s.vy + ny * (20 + Math.random() * 90) + (Math.random() - 0.5) * 70,
      0.45 + Math.random() * 0.4,
      1.4 + Math.random() * 2.4,
      18 + Math.random() * 22,
    );
  }
  void rel;
}

function collidePlanets(sim: Sim) {
  const s = sim.ship;
  for (const p of sim.planets) {
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
  if (orbitPerturbRatio(nearest, sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale) > ORBIT_PERTURB_BREAK) return false;
  return readKepler(nearest, sim.ship, sim.gravityScale) != null;
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
  if (!p || p.kind === "star") return null;
  const dist = Math.hypot(sim.ship.x - p.x, sim.ship.y - p.y);
  const alt = dist - p.radius;
  const { maxAlt } = orbitShellAlts(p, sim.planets);
  const near = Math.max(maxAlt * 2.4, atmoRadius(p) - p.radius + 40, 220);
  if (alt > near || alt < -2) return null;
  return p;
}

export function predictRelativePath(sim: Sim, target: Planet, seconds = 24): { x: number; y: number }[] {
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
    const star = sim.planets.find((p) => p.kind === "star");
    const pt = listLagrangePoints(sim).find((p) => p.key === sim.lagrangeLockKey);
    if (!star || !pt) return [];
    const dx = pt.x - star.x;
    const dy = pt.y - star.y;
    const r = Math.hypot(dx, dy) || 1;
    const w = (dx * pt.vy - dy * pt.vx) / (r * r);
    const n = 48;
    const pts: { x: number; y: number }[] = [];
    for (let i = 1; i <= n; i++) {
      const t = (Math.PI * 2 * i) / n;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const sign = w >= 0 ? 1 : -1;
      pts.push({
        x: star.x + dx * c - dy * s * sign,
        y: star.y + dx * s * sign + dy * c,
      });
    }
    return pts;
  }
  if (sim.orbitLockId) {
    const p = sim.planets.find((b) => b.id === sim.orbitLockId);
    const k = lockedKepler(sim);
    if (!p || !k) return [];
    const pts: { x: number; y: number }[] = [];
    const n = k.e < 0.05 ? 48 : 64;
    const ghost: Ship = { ...sim.ship };
    for (let i = 1; i <= n; i++) {
      const kk = { ...k, nu: wrapPi(k.nu + (Math.PI * 2 * i * Math.sign(k.h || 1)) / n) };
      applyKepler(ghost, p, kk);
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

export function predictPlanetPaths(sim: Sim, seconds = 10): { planet: Planet; path: { x: number; y: number }[] }[] {
  const movers = sim.planets.filter(isOrbiting);
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
