import { hullDamage } from "./hull.ts";
import type { BeltTick, BeltTickKind } from "./belt.ts";

/**
 * The comet scene. Warping to a comet heading drops the ship next to the
 * nucleus, in the nucleus frame: the nucleus sits at the origin and spins
 * slowly. No star, no planets, no star gravity. The only job is landing.
 * Units are scene units; the camera fits ~640 of them on the short side.
 */

export type CometSceneKind = "perihelion" | "inbound" | "marked";

export type CometSceneParams = {
  seed: number;
  jets: number;
  /** Fraction of each jet period it is on. */
  duty: number;
  jetPower: number;
  /** Rocks per second per lit jet. */
  rockRate: number;
  /** A vent is lit when its normal · sun > this. Lower = more of the day side vents. */
  lit: number;
  /** Sun strength 0..1: light, how hard gas bends away from it. */
  sun: number;
  /** Mean seconds between outbursts. */
  burstEvery: number;
  /** Fallback rocks per second onto the night side. */
  fallRate: number;
  label: string;
  /** A shaft into the nucleus where no vent, outburst, rock or sunlight reaches. */
  cave?: CometCave;
};

/** Nucleus-frame angle of the shaft, its angular half width, and how deep its floor is below the rim. */
export type CometCave = { a: number; half: number; depth: number };

/** Starting points from the playable look (artifact "Escena del cometa"). Tune by playing. */
export const COMET_SCENES: Record<CometSceneKind, CometSceneParams> = {
  perihelion: {
    seed: 11,
    jets: 7,
    duty: 0.62,
    jetPower: 1,
    rockRate: 1.5,
    lit: -0.15,
    sun: 1,
    burstEvery: 5.5,
    fallRate: 1.1,
    label: "COMET · PERIHELION",
    // On the far end of the big lobe: about three ships wide at the mouth, four deep.
    cave: { a: Math.PI, half: 0.3, depth: 36 },
  },
  inbound: {
    seed: 17,
    jets: 5,
    duty: 0.52,
    jetPower: 0.8,
    rockRate: 1,
    lit: 0.05,
    sun: 0.75,
    burstEvery: 8.5,
    fallRate: 0.55,
    label: "COMET · INBOUND",
  },
  marked: {
    seed: 23,
    jets: 3,
    duty: 0.42,
    jetPower: 0.6,
    rockRate: 0.6,
    lit: 0.25,
    sun: 0.5,
    burstEvery: 13,
    fallRate: 0.45,
    label: "COMET · MARKED",
  },
};

export const COMET_SCENE_DEFAULT: CometSceneKind = "inbound";

/** Crash ids in the scene: the runtime plays the crash sound when one appears; the crash card reads them. */
export const COMET_CRASH_NUCLEUS = "comet-nucleus";
export const COMET_CRASH_ROCKS = "comet-rocks";

/** Nucleus scale. The lobes are sized against it. */
export const NUCLEUS_R = 78;
/** Spin, rad/s. One turn every ~57 s. */
export const NUCLEUS_OMEGA = 0.11;
/** Nucleus gravity: a = K / d². Weak; you can hover with little thrust. */
export const NUCLEUS_GRAV_K = 1.6e5;
/** Seconds landed (summed across hops; a crash starts over) before the comet decelerates. */
export const COMET_HOLD_S = 120;
export const COMET_ENTRY_DIST = 640;
export const COMET_ENTRY_SPEED = 70;
/** Past this the comet outruns you. */
export const COMET_SCENE_EDGE = 1100;
/** The view fits this many scene units on its short side. */
export const COMET_VIEW_UNITS = 640;
/** Far out the view opens up to this many units, so the approach shows the whole comet. */
export const COMET_VIEW_UNITS_FAR = 1500;

/** View size for a ship at distance `d` from the nucleus: close in near the ground, wide far out. */
export function cometViewUnits(d: number) {
  return Math.max(COMET_VIEW_UNITS, Math.min(COMET_VIEW_UNITS_FAR, 560 + (d - NUCLEUS_R) * 1.55));
}

/** Two lobes, like a contact binary. Nucleus frame. */
export const NUCLEUS_LOBES = [
  { x: -22, y: 2, r: 64 },
  { x: 46, y: -6, r: 44 },
] as const;

const SUN_RAW = { x: -0.94, y: -0.34 };
const SUN_M = Math.hypot(SUN_RAW.x, SUN_RAW.y);
/** Direction toward the sun, fixed on screen. */
export const COMET_SUN = { x: SUN_RAW.x / SUN_M, y: SUN_RAW.y / SUN_M };
// You catch a comet as it leaves a system, moving away from the sun: you always
// come in from behind, which is always its day side. The tail points away from the sun.
const TRAVEL_RAW = { x: 0.82, y: 0.57 };
const TRAVEL_M = Math.hypot(TRAVEL_RAW.x, TRAVEL_RAW.y);
/** The comet's direction of travel on screen: the background stars stream the other way. */
export const COMET_TRAVEL = { x: TRAVEL_RAW.x / TRAVEL_M, y: TRAVEL_RAW.y / TRAVEL_M };
/**
 * After the hold the comet slows near another star: the streaks stop and the
 * light swings round to the new star, ahead of the comet.
 */
export const COMET_ARRIVE_S = 14;

const JET_RANGE = 300;
const JET_PUSH = 260;
const BURST_RANGE = 280;
const BURST_PUSH = 620;
const BURST_WARN_S = 1.4;
const BURST_PUSH_S = 0.8;
const BURST_LIFE_S = 6;
const GAS_CAP = 2400;
const ROCK_BOUND = 760;
export const IMPACT_LIFE_S = 1.2;
const IMPACT_CAP = 40;
/** How much of its closing speed a rock keeps when it bounces off the hull. */
const ROCK_BOUNCE = 0.55;
/** A rock at least this big, hitting at least this hard, breaks into pieces. */
const ROCK_SPLIT_R = 6;
const ROCK_SPLIT_V = 40;
/** Slower than this, a rock on the hull crumbles instead of bouncing (so one cannot rest on a parked ship). */
const ROCK_SETTLE_V = 8;
const ROCK_MAX_HITS = 2;
/** Hielo look: crystals per jet per tick, speed and life factors, spread. */
const GAS_PER_TICK = 9;
const GAS_SPEED = 0.75;
const GAS_LIFE = 1.7;
const GAS_SPREAD = 1.3;
const BURST_GAS = 260;
const SUN_GAS_PUSH = 34;

export function sceneHash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPE_N = 128;
const SHAPE = Array.from({ length: SHAPE_N }, (_, i) => {
  const a = (i / SHAPE_N) * Math.PI * 2;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  let best = 0;
  for (const L of NUCLEUS_LOBES) {
    // Ray from the origin against the lobe circle: far intersection.
    const b = ux * L.x + uy * L.y;
    const c = L.x * L.x + L.y * L.y - L.r * L.r;
    const disc = b * b - c;
    if (disc > 0) best = Math.max(best, b + Math.sqrt(disc));
  }
  const rough = (sceneHash(i * 3.7) - 0.5) * 0.07 + Math.sin(i * 0.9) * 0.015;
  return (best / NUCLEUS_R) * (1 + rough);
});

/** Surface radius at angle `a` in the nucleus frame. */
export function nucleusRadiusAt(a: number) {
  const u = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * SHAPE_N;
  const i = Math.floor(u);
  const f = u - i;
  return NUCLEUS_R * (SHAPE[i % SHAPE_N]! * (1 - f) + SHAPE[(i + 1) % SHAPE_N]! * f);
}

export type SceneJet = {
  /** Vent angle, nucleus frame. */
  a: number;
  period: number;
  phase: number;
  duty: number;
  power: number;
  rockRate: number;
  /** Thermal lag: seconds a vent keeps spraying after it turns into the night. */
  lag: number;
  /** Seconds since it left the light. */
  dark: number;
  /** 1 while lit, fading to 0 over `lag` in the dark. */
  fade: number;
  on: boolean;
  acc: number;
};

export type SceneRock = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  w: number;
  k: number;
  /** Fell back onto the night side. Feels the nucleus. */
  fall?: boolean;
  burst?: boolean;
  dead?: boolean;
  /** Seconds before it can strike the hull again, after bouncing off it. */
  hitT?: number;
  /** Times it has bounced off the hull. */
  hits?: number;
};

/** Where a rock struck the nucleus: a puff of dust and a spray of grit. Draw only. */
export type SceneImpact = { x: number; y: number; nx: number; ny: number; r: number; t: number; k: number };

export type SceneGas = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  /** 0 jet, 1 outburst, 2 warning trickle. */
  b: 0 | 1 | 2;
  k: number;
};

export type SceneBurst = { a: number; t: number; warn: number; fired: boolean };

export type CometScene = {
  kind: CometSceneKind;
  p: CometSceneParams;
  rot: number;
  t: number;
  rng: () => number;
  jets: SceneJet[];
  rocks: SceneRock[];
  gas: SceneGas[];
  bursts: SceneBurst[];
  impacts: SceneImpact[];
  burstClock: number;
  fallClock: number;
  /** Landing site, nucleus frame. Set on touchdown. */
  site: number;
  /** Seconds landed without a break. Leaving the ground, by takeoff or a vent, starts it over. */
  held: number;
  /** Hold complete: the comet is decelerating. */
  done: boolean;
  doneT: number;
  /** Seed the scene was made from, so the same comet can be visited again. */
  seed: number;
  /** Unit vector toward the star that lights the nucleus. */
  sun: { x: number; y: number };
  /** How fast the comet streaks past the stars: 1 between systems, 0 once it has arrived. */
  travel: number;
  /** Streak distance flown so far (the integral of travel). */
  flown: number;
  /** Seconds into the slowdown, or -1 before it starts. */
  arriveT: number;
  /** In orbit around the new star: the scene opens onto that system. */
  arrived: boolean;
  /** Debug (`&landed`): nothing hits or throws the parked ship until it takes off. */
  anchored?: boolean;
  /** Short notice for the HUD ("VENT UNDER HULL"). */
  msg: string;
  msgT: number;
  /** Engine plume light 0..1, smoothed. */
  glow: number;
  /** Jet blast building toward the next hit on the hull. */
  blast: number;
  /** Scene time of the last ice tick on the hull. */
  grainAt: number;
};

export function makeCometScene(
  kind: CometSceneKind = COMET_SCENE_DEFAULT,
  seed?: number,
  arrived?: { sun: { x: number; y: number } },
): CometScene {
  const p = { ...COMET_SCENES[kind] };
  const sceneSeed = seed ?? p.seed * 7919;
  const rng = mulberry32(sceneSeed);
  const jets: SceneJet[] = [];
  for (let i = 0; i < p.jets; i++) {
    jets.push({
      a: (i / p.jets) * Math.PI * 2 + rng() * 0.5,
      period: 2.2 + rng() * 2.6,
      phase: rng() * 5,
      duty: p.duty,
      power: p.jetPower,
      rockRate: p.rockRate,
      lag: 4 + sceneHash(i * 13.7 + p.seed) * 7,
      dark: 99,
      fade: 1,
      on: false,
      acc: 0,
    });
  }
  // No vent inside the cave itself. Its lips keep theirs: the shelter is the
  // floor under the roof, not the way in.
  const c = p.cave;
  if (c) {
    for (const j of jets) {
      const g = angleGap(j.a, c.a);
      if (Math.abs(g) < c.half) j.a = c.a + (g >= 0 ? 1 : -1) * (c.half + 0.04);
    }
  }
  return {
    kind,
    p,
    rot: 0,
    t: 0,
    rng,
    jets,
    rocks: [],
    gas: [],
    bursts: [],
    impacts: [],
    burstClock: 1.5,
    fallClock: 1,
    site: 0,
    held: 0,
    done: !!arrived,
    doneT: 0,
    seed: sceneSeed,
    sun: arrived ? unit(arrived.sun) : { ...COMET_SUN },
    travel: arrived ? 0 : 1,
    flown: 0,
    arriveT: -1,
    arrived: !!arrived,
    msg: "",
    msgT: 0,
    glow: 0,
    blast: 0,
    grainAt: -1,
  };
}

function unit(v: { x: number; y: number }) {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}

/** Start the slowdown toward the next star. */
export function startArrival(scene: CometScene) {
  if (scene.arriveT < 0 && !scene.arrived) scene.arriveT = 0;
}

function smooth(e0: number, e1: number, x: number) {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

/** Streaks die away, then the light swings from the old sun behind to the new star ahead. */
function stepArrival(scene: CometScene, dt: number) {
  if (scene.arriveT < 0 || scene.arrived) return;
  scene.arriveT += dt;
  const u = Math.min(1, scene.arriveT / COMET_ARRIVE_S);
  scene.travel = 1 - smooth(0, 0.7, u);
  const a0 = Math.atan2(COMET_SUN.y, COMET_SUN.x);
  const a1 = Math.atan2(COMET_TRAVEL.y, COMET_TRAVEL.x);
  const a = a0 + angleGap(a1, a0) * smooth(0.3, 1, u);
  scene.sun = { x: Math.cos(a), y: Math.sin(a) };
  if (u >= 1) {
    scene.arrived = true;
    scene.travel = 0;
  }
}

/** Surface radius under a scene point. */
export function surfaceRadiusAt(scene: CometScene, x: number, y: number) {
  return groundRadiusAt(scene, Math.atan2(y, x) - scene.rot);
}

/** Ground under a nucleus-frame angle: the shape, or the cave floor inside the shaft. */
export function groundRadiusAt(scene: CometScene, a: number) {
  const c = scene.p.cave;
  if (c && Math.abs(angleGap(a, c.a)) < c.half) return caveFloorR(c);
  return nucleusRadiusAt(a);
}

export function caveFloorR(c: CometCave) {
  return nucleusRadiusAt(c.a) - c.depth;
}

/** The lower of the two lips: below it you are between the walls. */
export function caveRimR(c: CometCave) {
  return Math.min(nucleusRadiusAt(c.a - c.half), nucleusRadiusAt(c.a + c.half));
}

/** Inside the shaft, below the rim: sheltered from vents, outbursts, rocks and the sun. */
export function inCave(scene: CometScene, x: number, y: number) {
  const c = scene.p.cave;
  if (!c) return false;
  const a = Math.atan2(y, x) - scene.rot;
  return Math.abs(angleGap(a, c.a)) < c.half && Math.hypot(x, y) < caveRimR(c);
}

/** A nucleus-frame angle within `pad` of the shaft. */
export function nearCave(scene: CometScene, a: number, pad = 0) {
  const c = scene.p.cave;
  return !!c && Math.abs(angleGap(a, c.a)) < c.half + pad;
}

/**
 * A hull of radius `hullR` touching a shaft wall: the unit normal back into the
 * shaft, and how far the hull is in. Null when clear.
 */
export function caveWallContact(scene: CometScene, x: number, y: number, hullR: number) {
  const c = scene.p.cave;
  if (!c) return null;
  const d = Math.hypot(x, y);
  if (d <= 1) return null;
  const g = angleGap(Math.atan2(y, x) - scene.rot, c.a);
  if (Math.abs(g) >= c.half) return null;
  const sgn = g >= 0 ? 1 : -1;
  // Each wall runs up to its own lip; the two lips are not the same height.
  if (d >= nucleusRadiusAt(c.a + sgn * c.half)) return null;
  const clear = d * Math.sin(c.half - Math.abs(g));
  if (clear >= hullR) return null;
  const w = c.a + sgn * c.half + scene.rot;
  return { nx: sgn * Math.sin(w), ny: -sgn * Math.cos(w), depth: hullR - clear };
}

/** Velocity of the spinning ground at a scene point. */
export function surfaceVelocity(x: number, y: number) {
  return { x: -NUCLEUS_OMEGA * y, y: NUCLEUS_OMEGA * x };
}

/** Scene position of a nucleus-frame surface angle, lifted by `lift`. */
export function surfacePoint(scene: CometScene, a: number, lift = 0) {
  const w = a + scene.rot;
  const r = groundRadiusAt(scene, a) + lift;
  return { x: Math.cos(w) * r, y: Math.sin(w) * r, w };
}

/** normal · sun for a nucleus-frame angle. > 0 is day. */
export function sunDot(scene: CometScene, a: number) {
  const w = a + scene.rot;
  return Math.cos(w) * scene.sun.x + Math.sin(w) * scene.sun.y;
}

export function siteLit(scene: CometScene, a: number) {
  if (nearCave(scene, a)) return false;
  return sunDot(scene, a) > 0;
}

export function jetLit(scene: CometScene, j: SceneJet) {
  return sunDot(scene, j.a) > scene.p.lit;
}

/** Inside the shadow column behind the nucleus. */
export function inUmbra(scene: CometScene, x: number, y: number, pad = 0.9) {
  const { sun } = scene;
  const behind = -(x * sun.x + y * sun.y);
  const side = Math.abs(-x * sun.y + y * sun.x);
  return behind > 0 && side < NUCLEUS_R * pad;
}

export function angleGap(a: number, b: number) {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

export function stepCometScene(scene: CometScene, dt: number, reduced = false) {
  const { p, rng } = scene;
  scene.t += dt;
  scene.rot += NUCLEUS_OMEGA * dt;
  stepArrival(scene, dt);
  scene.flown += scene.travel * dt;
  if (scene.msgT > 0) scene.msgT = Math.max(0, scene.msgT - dt);

  for (const j of scene.jets) {
    const u = (((scene.t + j.phase) % j.period) + j.period) % j.period / j.period;
    const lit = jetLit(scene, j);
    j.dark = lit ? 0 : j.dark + dt;
    j.fade = lit ? 1 : Math.max(0, 1 - j.dark / j.lag);
    j.on = (lit || j.fade > 0) && u < j.duty;
    if (!j.on) continue;
    const { x: bx, y: by, w } = surfacePoint(scene, j.a);
    const n = reduced ? 2 : GAS_PER_TICK;
    for (let k = 0; k < n; k++) {
      const s = (rng() - 0.5) * GAS_SPREAD;
      const sp = (120 + rng() * 140 * j.power) * GAS_SPEED * (0.5 + 0.5 * j.fade);
      scene.gas.push({
        x: bx,
        y: by,
        vx: Math.cos(w + s) * sp,
        vy: Math.sin(w + s) * sp,
        life: (1.6 + rng() * 1.2) * GAS_LIFE,
        age: 0,
        b: 0,
        k: rng() * Math.PI * 2,
      });
    }
    // A vent that kept spraying into the night throws gas, not rocks: unseen rocks would be unfair.
    if (j.fade < 1) continue;
    j.acc += dt * j.rockRate;
    while (j.acc > 1) {
      j.acc -= 1;
      const s = (rng() - 0.5) * 0.7;
      const sp = 70 + rng() * 120;
      scene.rocks.push({
        x: bx,
        y: by,
        vx: Math.cos(w + s) * sp,
        vy: Math.sin(w + s) * sp,
        r: 3 + rng() * 6,
        spin: rng() * 6,
        w: (rng() - 0.5) * 3,
        k: Math.floor(rng() * 1000),
      });
    }
  }

  stepBursts(scene, dt, reduced);
  stepFallback(scene, dt);

  const push = SUN_GAS_PUSH * p.sun;
  for (const g of scene.gas) {
    g.vx -= scene.sun.x * push * dt;
    g.vy -= scene.sun.y * push * dt;
    if (g.b === 1) {
      const f = 1 - 0.9 * dt;
      g.vx *= f;
      g.vy *= f;
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.age += dt;
  }
  scene.gas = scene.gas.filter((g) => g.age < g.life);
  if (scene.gas.length > GAS_CAP) scene.gas.splice(0, scene.gas.length - GAS_CAP);

  // Every rock feels the nucleus: slow jet rocks arc back down, fast ones escape.
  for (const r of scene.rocks) {
    const d = Math.hypot(r.x, r.y) || 1;
    const g = NUCLEUS_GRAV_K / (d * d);
    r.vx -= (r.x / d) * g * dt;
    r.vy -= (r.y / d) * g * dt;
    // A rock leaves from the surface; it only lands again once it is heading back in.
    if (r.x * r.vx + r.y * r.vy < 0 && d < nucleusRadiusAt(Math.atan2(r.y, r.x) - scene.rot) + r.r * 0.4) {
      r.dead = true;
      scene.impacts.push({ x: r.x, y: r.y, nx: r.x / d, ny: r.y / d, r: r.r, t: 0, k: r.k });
    }
    if (r.hitT) r.hitT = Math.max(0, r.hitT - dt);
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.spin += r.w * dt;
  }
  scene.rocks = scene.rocks.filter(
    (r) => !r.dead && Math.abs(r.x) < ROCK_BOUND && Math.abs(r.y) < ROCK_BOUND,
  );
  for (const im of scene.impacts) im.t += dt;
  scene.impacts = scene.impacts.filter((im) => im.t < IMPACT_LIFE_S);
  if (scene.impacts.length > IMPACT_CAP) scene.impacts.splice(0, scene.impacts.length - IMPACT_CAP);
}

/** Outbursts: a day-side spot blows. It always warns first, then throws a wide fan of gas and rocks. */
function stepBursts(scene: CometScene, dt: number, reduced: boolean) {
  const { p, rng } = scene;
  scene.burstClock -= dt;
  if (scene.burstClock <= 0) {
    scene.burstClock = p.burstEvery * (0.7 + rng() * 0.6);
    for (let tries = 0; tries < 20; tries++) {
      const a = rng() * Math.PI * 2;
      if (sunDot(scene, a) > Math.max(0.2, p.lit + 0.25) && !nearCave(scene, a)) {
        scene.bursts.push({ a, t: 0, warn: BURST_WARN_S, fired: false });
        break;
      }
    }
  }
  for (const b of scene.bursts) {
    b.t += dt;
    const { x: bx, y: by, w } = surfacePoint(scene, b.a);
    if (b.t < b.warn) {
      if (rng() < dt * 18) {
        const s = (rng() - 0.5) * 0.4;
        const sp = 25 + rng() * 30;
        scene.gas.push({ x: bx, y: by, vx: Math.cos(w + s) * sp, vy: Math.sin(w + s) * sp, life: 1.2, age: 0, b: 2, k: rng() * 6.283 });
      }
      continue;
    }
    if (b.fired) continue;
    b.fired = true;
    const n = reduced ? 40 : BURST_GAS;
    for (let k = 0; k < n; k++) {
      const s = (rng() - 0.5) * 2.3;
      const sp = 60 + rng() * 230;
      scene.gas.push({ x: bx, y: by, vx: Math.cos(w + s) * sp, vy: Math.sin(w + s) * sp, life: 2.6 + rng() * 2, age: 0, b: 1, k: rng() * 6.283 });
    }
    const nr = Math.round(5 + p.jetPower * 7);
    for (let k = 0; k < nr; k++) {
      const s = (rng() - 0.5) * 1.4;
      const sp = 90 + rng() * 160;
      scene.rocks.push({
        x: bx,
        y: by,
        vx: Math.cos(w + s) * sp,
        vy: Math.sin(w + s) * sp,
        r: 3 + rng() * 7,
        spin: rng() * 6,
        w: (rng() - 0.5) * 4,
        k: Math.floor(rng() * 1000),
        burst: true,
      });
    }
  }
  scene.bursts = scene.bursts.filter((b) => b.t < b.warn + BURST_LIFE_S);
}

/** What the day side throws up comes back down, onto the night side. */
function stepFallback(scene: CometScene, dt: number) {
  const { p, rng } = scene;
  scene.fallClock -= dt * p.fallRate;
  if (scene.fallClock > 0) return;
  scene.fallClock += 0.6 + rng() * 0.8;
  const base = Math.atan2(-scene.sun.y, -scene.sun.x) + (rng() - 0.5) * 2.4;
  const d0 = 560;
  const sp = 18 + rng() * 26;
  const tang = (rng() - 0.5) * 22;
  scene.rocks.push({
    x: Math.cos(base) * d0,
    y: Math.sin(base) * d0,
    vx: -Math.cos(base) * sp - Math.sin(base) * tang,
    vy: -Math.sin(base) * sp + Math.cos(base) * tang,
    r: 3 + rng() * 6,
    spin: rng() * 6,
    w: (rng() - 0.5) * 1.5,
    k: Math.floor(rng() * 1000),
    fall: true,
  });
}

/** Nucleus gravity plus every jet and outburst push at a scene point. */
export function sceneAccel(scene: CometScene, x: number, y: number) {
  const d = Math.hypot(x, y) || 1;
  const g = NUCLEUS_GRAV_K / (d * d);
  let ax = (-x / d) * g;
  let ay = (-y / d) * g;
  for (const j of scene.jets) {
    const k = jetReach(scene, j, x, y);
    if (!k) continue;
    const w = surfacePoint(scene, j.a).w;
    ax += Math.cos(w) * JET_PUSH * k;
    ay += Math.sin(w) * JET_PUSH * k;
  }
  for (const b of scene.bursts) {
    const k = burstReach(scene, b, x, y);
    if (!k) continue;
    const { x: bx, y: by } = surfacePoint(scene, b.a);
    const dd = Math.hypot(x - bx, y - by) || 1;
    ax += ((x - bx) / dd) * BURST_PUSH * k;
    ay += ((y - by) / dd) * BURST_PUSH * k;
  }
  return { ax, ay };
}

/** How hard a jet reaches the point: 0 outside its cone, up to power at the vent. */
function jetReach(scene: CometScene, j: SceneJet, x: number, y: number) {
  if (!j.on || inCave(scene, x, y)) return 0;
  const { x: bx, y: by, w } = surfacePoint(scene, j.a);
  const dx = x - bx;
  const dy = y - by;
  const dd = Math.hypot(dx, dy);
  const along = dx * Math.cos(w) + dy * Math.sin(w);
  const off = Math.abs(-dx * Math.sin(w) + dy * Math.cos(w));
  if (along <= 0 || dd >= JET_RANGE || off >= 30 + along * 0.32) return 0;
  return j.power * j.fade * (1 - dd / JET_RANGE);
}

/** Same for an outburst, during its push. */
function burstReach(scene: CometScene, b: SceneBurst, x: number, y: number) {
  if (b.t < b.warn || b.t > b.warn + BURST_PUSH_S || inCave(scene, x, y)) return 0;
  const { x: bx, y: by, w } = surfacePoint(scene, b.a);
  const dx = x - bx;
  const dy = y - by;
  const dd = Math.hypot(dx, dy) || 1;
  const along = dx * Math.cos(w) + dy * Math.sin(w);
  if (along <= 0 || dd >= BURST_RANGE || along / dd <= 0.35) return 0;
  return 1 - dd / BURST_RANGE;
}

/** Blast hits per second at full reach, and the hull each one takes at most. */
const BLAST_RATE = 4;
const BLAST_HIT_MAX = 6;
/** Ice grains tick on the hull at most this often (seconds), like belt grit. */
const GRAIN_GAP = 0.05;
/** Height of a landed hull's centre above the ground (the ship's hull radius). */
const HULL_CLEAR = 9;

/**
 * Gas and ice on the hull. Loose grains only tick, like belt grit. Inside a jet
 * or an outburst the blast hits like small rocks: belt noise and hull damage.
 */
export function sceneGasHits(
  scene: CometScene,
  ship: { x: number; y: number; vx: number; vy: number },
  hullR: number,
  dt: number,
): BeltTick[] {
  const ticks: BeltTick[] = [];
  if (inCave(scene, ship.x, ship.y)) {
    scene.blast = 0;
    return ticks;
  }
  for (const g of scene.gas) {
    if (scene.t - scene.grainAt < GRAIN_GAP) break;
    const dx = g.x - ship.x;
    const dy = g.y - ship.y;
    if (dx * dx + dy * dy > (hullR + 2) * (hullR + 2)) continue;
    g.age = g.life;
    scene.grainAt = scene.t;
    const closing = Math.hypot(ship.vx - g.vx, ship.vy - g.vy);
    const speedW = Math.min(1, closing / 120);
    ticks.push({ kind: "chip", volume: 0.02 + speedW * 0.03, bright: speedW * 0.4, ring: 0.05, pan: Math.max(-1, Math.min(1, dx / hullR)), damage: 0 });
  }
  let reach = 0;
  for (const j of scene.jets) reach = Math.max(reach, jetReach(scene, j, ship.x, ship.y));
  for (const b of scene.bursts) reach = Math.max(reach, burstReach(scene, b, ship.x, ship.y) * 2);
  if (reach <= 0) {
    scene.blast = 0;
    return ticks;
  }
  scene.blast += dt * BLAST_RATE * Math.min(2, reach);
  while (scene.blast >= 1) {
    scene.blast -= 1;
    const k = Math.min(1, reach);
    ticks.push({
      kind: "pebble",
      volume: 0.08 + k * 0.12,
      bright: 0.4 + k * 0.6,
      ring: 0.5 + k * 0.4,
      pan: (scene.rng() - 0.5) * 1.2,
      damage: Math.max(1, Math.round(BLAST_HIT_MAX * k)),
    });
  }
  return ticks;
}

/** Speed of a scene point relative to the ground spinning under it. */
export function relativeToSurface(x: number, y: number, vx: number, vy: number) {
  const s = surfaceVelocity(x, y);
  return Math.hypot(vx - s.x, vy - s.y);
}

/**
 * Rocks touching the hull. Same rule as a belt: below 10 closing it is grit,
 * a small rock is a chip, a big one a pebble. The rock bounces off: a graze
 * bends its path, a head-on hit sends it back. A big rock hit hard breaks.
 */
export function sceneRockHits(
  scene: CometScene,
  ship: { x: number; y: number; vx: number; vy: number },
  hullR: number,
): BeltTick[] {
  const ticks: BeltTick[] = [];
  const pieces: SceneRock[] = [];
  for (const r of scene.rocks) {
    if (r.dead || r.hitT) continue;
    const dx = r.x - ship.x;
    const dy = r.y - ship.y;
    const d = Math.hypot(dx, dy);
    if (d > r.r + hullR) continue;
    const nx = dx / (d || 1);
    const ny = dy / (d || 1);
    const closing = Math.max(0, (ship.vx - r.vx) * nx + (ship.vy - r.vy) * ny);
    bounceOffHull(r, ship, nx, ny, closing, hullR, pieces);
    const kind: BeltTickKind = r.r < 5 ? "chip" : "pebble";
    const sz = r.r * 1.4;
    const bright = Math.max(0, Math.min(1, (closing - 10) / 48));
    const speedW = Math.min(1, closing / 60);
    ticks.push({
      kind,
      volume: kind === "pebble" ? 0.07 + speedW * 0.12 : 0.035 + speedW * 0.05,
      bright,
      ring: kind === "pebble" ? 0.42 + Math.min(1, sz / 14) * 0.58 : 0.05,
      pan: Math.max(-1, Math.min(1, nx)),
      damage: hullDamage(kind, sz, closing),
    });
  }
  if (ticks.length) scene.rocks = scene.rocks.filter((r) => !r.dead).concat(pieces);
  return ticks;
}

/** Send a rock off the hull: reflect it in the ship's frame, or break a big one hit hard. */
function bounceOffHull(
  r: SceneRock,
  ship: { x: number; y: number; vx: number; vy: number },
  nx: number,
  ny: number,
  closing: number,
  hullR: number,
  pieces: SceneRock[],
) {
  const rvx = r.vx - ship.vx + nx * closing * (1 + ROCK_BOUNCE);
  const rvy = r.vy - ship.vy + ny * closing * (1 + ROCK_BOUNCE);
  const ox = ship.x + nx * (r.r + hullR + 0.5);
  const oy = ship.y + ny * (r.r + hullR + 0.5);
  r.hits = (r.hits ?? 0) + 1;
  if (closing < ROCK_SETTLE_V || r.hits > ROCK_MAX_HITS) {
    r.dead = true;
    return;
  }
  if (r.r < ROCK_SPLIT_R || closing < ROCK_SPLIT_V) {
    r.x = ox;
    r.y = oy;
    r.vx = ship.vx + rvx;
    r.vy = ship.vy + rvy;
    r.w += (sceneHash(r.k * 1.7) - 0.5) * 6;
    r.hitT = 0.3;
    return;
  }
  r.dead = true;
  const n = closing > 90 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const h = sceneHash(r.k * 3.1 + i * 7.7);
    const turn = ((i + 0.5) / n - 0.5) * 1.6 + (h - 0.5) * 0.3;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const sp = 0.8 + sceneHash(r.k + i * 2.3) * 0.5;
    pieces.push({
      x: ox + (c * nx - sn * ny) * r.r * 0.4,
      y: oy + (sn * nx + c * ny) * r.r * 0.4,
      vx: ship.vx + (rvx * c - rvy * sn) * sp,
      vy: ship.vy + (rvx * sn + rvy * c) * sp,
      r: r.r * (0.42 + h * 0.18),
      spin: r.spin + i,
      w: (h - 0.5) * 8,
      k: r.k * 4 + i + 1,
      burst: r.burst,
      fall: r.fall,
      hitT: 0.3,
    });
  }
}

/** A vent or outburst under a landed site throws the ship off. Strength 0 = none. */
/** How hard the vents could hit a ship parked at `a` if they all fired at once (0 = out of every cone). Debug sites use it. */
export function siteExposure(scene: CometScene, a: number) {
  const { x, y } = surfacePoint(scene, a, HULL_CLEAR);
  let k = 0;
  for (const j of scene.jets) {
    if (Math.abs(angleGap(j.a, a)) < 0.16) return Infinity;
    k = Math.max(k, jetReach(scene, { ...j, on: true, fade: 1 }, x, y));
  }
  return k;
}

export function ventUnderSite(scene: CometScene, site: number): { why: string; k: number } | null {
  if (nearCave(scene, site)) return null;
  // Any vent whose blast reaches the hull lifts it, so a parked ship is never ground down in place.
  const { x, y } = surfacePoint(scene, site, HULL_CLEAR);
  for (const j of scene.jets) {
    if (j.on && (Math.abs(angleGap(j.a, site)) < 0.16 || jetReach(scene, j, x, y) > 0)) {
      return { why: "Vent under hull", k: Math.max(0.3, j.power * j.fade) };
    }
  }
  for (const b of scene.bursts) {
    const k = b.t - b.warn;
    if (k > 0 && k < BURST_PUSH_S && (Math.abs(angleGap(b.a, site)) < 0.5 || burstReach(scene, b, x, y) > 0)) {
      return { why: "Outburst", k: 2 };
    }
  }
  return null;
}

/** Entry pose: always from behind the comet, catching up along its travel, almost matched. */
export function cometEntryPose() {
  const ux = COMET_TRAVEL.x;
  const uy = COMET_TRAVEL.y;
  return {
    x: -ux * COMET_ENTRY_DIST,
    y: -uy * COMET_ENTRY_DIST,
    vx: ux * COMET_ENTRY_SPEED,
    vy: uy * COMET_ENTRY_SPEED,
  };
}
