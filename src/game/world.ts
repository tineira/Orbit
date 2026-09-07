import type { Planet } from "./types";

/** Gravity constant in world units. a = G * GRAVITY_BASE * M / r² */
export const G = 1;
/** Default well strength. 1× on the gravity knob is this multiple of the raw G M / r². */
export const GRAVITY_BASE = 4;

export const SHIP_MASS = 1;
export const SHIP_HULL = 9;
export const THRUST_FORCE = 22;
export const RETRO_FORCE = 10;
export const TURN_RATE = 2.85;
export const LAND_SPEED = 20;
export const STEP = 1 / 60;
export const ORBIT_LOCK_DWELL = 0.55;
export const ORBIT_BREAK_COOLDOWN = 1.35;
export const ORBIT_SHELL_MIN_ALT = 18;
export const ORBIT_SHELL_MAX_ALT_FACTOR = 1.28;
export const ORBIT_SHELL_MAX_ALT_CAP = 170;
export const ORBIT_SHELL_MOON_MIN_ALT = 90;
/** How far past a gas giant's atmosphere the outer lock ring extends. Inner stays at 18. */
export const ORBIT_SHELL_GAS_CLEAR = 72;
/** Star corona outer radius / body radius. Keep in sync with parking: min shell sits just past this. */
export const STAR_ATMO_FACTOR = 2.1;
/** Clearance past the corona before a star lock can hold. */
export const ORBIT_SHELL_STAR_CLEAR = 40;
/** Star lock outer altitude as a multiple of radius (~800–1100 for typical stars). */
export const ORBIT_SHELL_STAR_MAX_FACTOR = 3.4;
export const ORBIT_SHELL_STAR_MAX_PAD = 520;
/** Kepler apoapsis altitude cap for star locks. */
export const KEPLER_STAR_APO_FACTOR = 6;
export const KEPLER_STAR_APO_CAP = 1600;
export const FLARE_CAP = 2;
export const FLARE_LONG_CHANCE = 0.18;
/** Atmosphere stronger than this dumps a locked orbit. */
export const ORBIT_DRAG_BREAK = 0.4;
/** Tidal pull / host gravity. Same 0.4 feel as drag, but a ratio — raw n-body vs host would dump every moon orbit (the parent is always pulling). */
export const ORBIT_PERTURB_BREAK = 0.4;

export const GRAVITY_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8] as const;
export const ATMO_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6] as const;

export function orbitShellAlts(p: Planet, planets: Planet[] = []) {
  let minAlt = ORBIT_SHELL_MIN_ALT;
  let maxAlt = Math.min(p.radius * ORBIT_SHELL_MAX_ALT_FACTOR, ORBIT_SHELL_MAX_ALT_CAP);
  if (p.kind === "moon") {
    maxAlt = Math.max(maxAlt, ORBIT_SHELL_MOON_MIN_ALT);
    const parent = p.parentId ? planets.find((b) => b.id === p.parentId) : undefined;
    if (parent && p.orbitR != null && parent.mass > 0) {
      const rPeri = p.orbitR * (1 - (p.orbitE ?? 0));
      const hill = rPeri * Math.cbrt(Math.max(0, p.mass / (3 * parent.mass)));
      maxAlt = Math.max(maxAlt, hill - p.radius);
      const toParent = rPeri - parent.radius - p.radius;
      if (toParent > minAlt + 8) maxAlt = Math.min(maxAlt, toParent - 8);
    }
  } else if (p.kind === "gas") {
    const atmoAlt = p.radius * 0.85;
    maxAlt = Math.max(maxAlt, atmoAlt + ORBIT_SHELL_GAS_CLEAR);
  } else if (p.kind === "star") {
    const atmoAlt = p.radius * (STAR_ATMO_FACTOR - 1);
    minAlt = atmoAlt + ORBIT_SHELL_STAR_CLEAR;
    maxAlt = Math.max(p.radius * ORBIT_SHELL_STAR_MAX_FACTOR, atmoAlt + ORBIT_SHELL_STAR_MAX_PAD);
    let innerPeri = Infinity;
    for (const q of planets) {
      if (q.parentId !== p.id || q.orbitR == null) continue;
      innerPeri = Math.min(innerPeri, q.orbitR * (1 - (q.orbitE ?? 0)));
    }
    if (Number.isFinite(innerPeri)) maxAlt = Math.min(maxAlt, innerPeri - p.radius - 280);
  }
  const sibling = twinOf(p, planets);
  if (sibling) {
    const sep =
      p.orbitR != null && sibling.orbitR != null
        ? p.orbitR + sibling.orbitR
        : Math.hypot(p.x - sibling.x, p.y - sibling.y);
    const toSibling = sep - p.radius - sibling.radius;
    if (toSibling > minAlt + 16) maxAlt = Math.min(maxAlt, toSibling * 0.5 - 8);
    if (p.orbitR != null) maxAlt = Math.min(maxAlt, p.orbitR - p.radius - 12);
  }
  if (maxAlt < minAlt) maxAlt = minAlt;
  return { minAlt, maxAlt };
}

/** Kinematic parent only — no gravity, hull, or drawing. */
export function isGhostBody(p: Planet) {
  return p.kind === "barycenter";
}

export function twinOf(p: Planet, planets: Planet[]): Planet | undefined {
  if (!p.parentId) return undefined;
  const parent = planets.find((b) => b.id === p.parentId);
  if (!parent || parent.kind !== "barycenter") return undefined;
  return planets.find((q) => q.parentId === p.parentId && q.id !== p.id && !isGhostBody(q));
}

export const TAKEOFF_SPEED = 20;

function massFrom(radius: number, surfaceG: number) {
  return (surfaceG * radius * radius) / G;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function takeName(rng: () => number, pool: string[], used: Set<string>): string {
  const avail = pool.filter((n) => !used.has(n.toLowerCase()));
  const name = avail.length ? pick(rng, avail) : `Body-${used.size + 1}`;
  used.add(name.toLowerCase());
  return name;
}

function slug(name: string, i: number) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return `${base || "body"}-${i}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function atmo(hex: string, a: number) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const STAR_NAMES = ["Helios", "Ember", "Kindle", "Pyre", "Hearth", "Apex", "Solis", "Cinder", "Vesta", "Ardor"];
const WORLD_NAMES = [
  "Vesper", "Kite", "Aurel", "Nyx", "Iskra", "Calyx", "Vela", "Orin", "Mire", "Thal",
  "Ravel", "Sable", "Brane", "Kael", "Ione", "Sere", "Voss", "Nadir", "Elide", "Korr",
  "Ysol", "Runa", "Ilex", "Vara", "Quill", "Deneb", "Mira", "Oum", "Lir", "Tole",
  "Nox", "Ashen", "Phaedra", "Rook", "Sil", "Xor", "Eda", "Vellum", "Kest", "Orrin",
];
const MOON_NAMES = [
  "Drift", "Vale", "Shard", "Wick", "Moth", "Halo", "Cinder", "Knot", "Floe", "Rill",
  "Glyph", "Nib", "Pebble", "Ash", "Speck", "Dusk", "Rime", "Coil", "Wisp", "Mote",
];

const ROCKY_PALETTES: [string, string][] = [
  ["#c57a58", "#5c3224"],
  ["#7a8794", "#2f3640"],
  ["#9db6c6", "#3d5564"],
  ["#b08060", "#4a3020"],
  ["#6e8b74", "#24332a"],
  ["#c4a574", "#5a4030"],
  ["#8a6a8a", "#3a2a40"],
  ["#d0c4b0", "#5c5348"],
  ["#c46a5a", "#4a2420"],
  ["#6a7c88", "#243038"],
];

const GAS_PALETTES: { a: string; b: string; bands: string[] }[] = [
  { a: "#6a7c64", b: "#2c342c", bands: ["#c4b07a", "#8a9a78", "#5a6a58", "#d8c89a"] },
  { a: "#7a6a58", b: "#2e241c", bands: ["#d8b48a", "#9a7a58", "#5a4838", "#e0c8a0"] },
  { a: "#5a6a88", b: "#222838", bands: ["#a8b8d0", "#6a7a98", "#3a4860", "#c8d0e0"] },
  { a: "#8a5a4a", b: "#341c18", bands: ["#d09070", "#a06850", "#5a3028", "#e0b098"] },
  { a: "#5a7a72", b: "#1c2c28", bands: ["#b0d0c4", "#6a9888", "#3a5850", "#d0e4d8"] },
];

const MOON_PALETTES: [string, string][] = [
  ["#c9c3b6", "#6e685c"],
  ["#b8c0c4", "#4e565c"],
  ["#d2c2a8", "#6a5a48"],
  ["#c0b8c8", "#524a58"],
  ["#b4c8b8", "#3e4c42"],
];

const STAR_PALETTES: [string, string, string][] = [
  ["#f3e3b0", "#d8882c", "rgba(255, 186, 74, 0.22)"],
  ["#f6f0dc", "#e0a24a", "rgba(255, 214, 140, 0.2)"],
  ["#f0d4a8", "#c45c22", "rgba(255, 150, 70, 0.22)"],
  ["#e8f0ff", "#8ab0e0", "rgba(180, 210, 255, 0.18)"],
];

type Role = { kicker: string; body: (name: string) => string };

const ROCKY_ROLES: Role[] = [
  {
    kicker: "Home",
    body: () => "A small cradle world. This page is a system — fly it instead of scrolling it.",
  },
  {
    kicker: "Workshop",
    body: (name) => `${name} is a workshop in a shallow well. Things get built, then pushed into the dark.`,
  },
  {
    kicker: "Signal",
    body: () => "A cold radio world. Signals go out. Few come back.",
  },
  {
    kicker: "Archive",
    body: (name) => `Dust libraries on ${name}. Whatever was written here is still in orbit around the idea of it.`,
  },
];

function shuffle<T>(rng: () => number, list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Polar Kepler rail around a focus at the origin. `orbitR` is semi-major axis. */
export function keplerRail(a: number, e: number, peri: number, theta: number, mu: number) {
  const ecc = Math.min(0.95, Math.max(0, e));
  const oneE2 = Math.max(0, 1 - ecc * ecc);
  const nu = theta - peri;
  const r = ecc < 1e-8 ? a : (a * oneE2) / (1 + ecc * Math.cos(nu));
  const n = Math.sqrt(Math.max(0, mu) / Math.max(1e-8, a * a * a));
  const h = n * a * a * Math.sqrt(oneE2);
  const vr = ecc < 1e-8 || h < 1e-8 ? 0 : (mu * ecc * Math.sin(nu)) / h;
  const vt = h / Math.max(r, 1e-8);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    r,
    n,
    x: c * r,
    y: s * r,
    vx: vr * c + vt * -s,
    vy: vr * s + vt * c,
  };
}

function placeOnRails(
  rng: () => number,
  star: Planet,
  drafts: { radius: number }[],
): {
  orbitR: number;
  orbitA: number;
  orbitW: number;
  orbitE: number;
  orbitPeri: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}[] {
  const mu = G * GRAVITY_BASE * star.mass;
  let a = star.radius + 3400;
  return drafts.map((d, i) => {
    a += (i === 0 ? 0 : 2050) + d.radius * 1.35 + rng() * 380;
    const orbitE = lerp(0.055, 0.12, rng());
    const orbitPeri = rng() * Math.PI * 2;
    const orbitA = rng() * Math.PI * 2;
    const k = keplerRail(a, orbitE, orbitPeri, orbitA, mu);
    return {
      orbitR: a,
      orbitA,
      orbitW: k.n,
      orbitE,
      orbitPeri,
      x: k.x,
      y: k.y,
      vx: k.vx,
      vy: k.vy,
    };
  });
}

function makeSystem(seed: number): Planet[] {
  const rng = mulberry32(seed);
  const used = new Set<string>(["lumen"]);
  const planets: Planet[] = [];

  const starR = lerp(220, 300, rng());
  const starG = lerp(22, 30, rng());
  const starName = takeName(rng, STAR_NAMES, used);
  const starPal = pick(rng, STAR_PALETTES);
  const star: Planet = {
    id: slug(starName, 0),
    name: starName,
    kind: "star",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: starR,
    surfaceG: starG,
    mass: massFrom(starR, starG),
    landable: false,
    rotate: 0,
    spin: lerp(0.08, 0.2, rng()),
    colorA: starPal[0],
    colorB: starPal[1],
    atmo: starPal[2],
    kicker: "Star",
    title: starName,
    body: "The well at the center. Too hot to land.",
    deny: "Too hot to land",
  };
  planets.push(star);

  const rockyCount = rng() < 0.45 ? 3 : 4;
  const moonCount = rng() < 0.4 ? 1 : 2;
  /** About once per 4–5 systems; never replaces Home (seat 0). */
  const pairSeat = rng() < 0.22 && rockyCount >= 3 ? 1 + Math.floor(rng() * (rockyCount - 1)) : -1;
  const rockySingles = pairSeat >= 0 ? rockyCount - 1 : rockyCount;
  const roles = [ROCKY_ROLES[0]!, ...shuffle(rng, ROCKY_ROLES.slice(1))].slice(0, rockySingles);
  const rockyPal = shuffle(rng, ROCKY_PALETTES);

  type Draft =
    | { kind: "rocky"; radius: number; surfaceG: number }
    | { kind: "gas"; radius: number; surfaceG: number }
    | {
        kind: "pair";
        radius: number;
        radiusA: number;
        radiusB: number;
        surfaceGA: number;
        surfaceGB: number;
        sep: number;
      };
  const drafts: Draft[] = [];
  for (let i = 0; i < rockyCount; i++) {
    if (i === pairSeat) {
      const radiusA = lerp(58, 96, rng());
      const radiusB = radiusA * lerp(0.85, 1.15, rng());
      const surfaceGA = lerp(9.2, 13.2, rng());
      const surfaceGB = surfaceGA * lerp(0.95, 1.05, rng());
      const sep = (radiusA + radiusB) * lerp(2.65, 3.3, rng());
      drafts.push({
        kind: "pair",
        radius: sep * 0.5 + Math.max(radiusA, radiusB),
        radiusA,
        radiusB,
        surfaceGA,
        surfaceGB,
        sep,
      });
      continue;
    }
    drafts.push({
      kind: "rocky",
      radius: lerp(54, 104, rng()),
      surfaceG: lerp(8.6, 13.8, rng()),
    });
  }
  const gasR = lerp(175, 248, rng());
  const gasG = lerp(13, 17, rng());
  drafts.push({ kind: "gas", radius: gasR, surfaceG: gasG });

  const seats = placeOnRails(rng, star, drafts);
  let rockyI = 0;

  drafts.forEach((draft, i) => {
    const seat = seats[i]!;
    const rail = {
      parentId: star.id,
      orbitR: seat.orbitR,
      orbitA: seat.orbitA,
      orbitW: seat.orbitW,
      orbitE: seat.orbitE,
      orbitPeri: seat.orbitPeri,
      x: seat.x,
      y: seat.y,
      vx: seat.vx,
      vy: seat.vy,
    };
    if (draft.kind === "gas") {
      const name = takeName(rng, WORLD_NAMES, used);
      const pal = pick(rng, GAS_PALETTES);
      planets.push({
        id: slug(name, planets.length),
        name,
        kind: "gas",
        ...rail,
        radius: draft.radius,
        surfaceG: draft.surfaceG,
        mass: massFrom(draft.radius, draft.surfaceG),
        landable: false,
        rotate: rng() * Math.PI,
        spin: lerp(0.22, 0.48, rng()) * (rng() < 0.5 ? 1 : -1),
        colorA: pal.a,
        colorB: pal.b,
        atmo: atmo(pal.a, 0.22),
        bands: pal.bands,
        kicker: "Giant",
        title: name,
        body: "A thick atmosphere. You can orbit. You cannot land.",
        deny: "Atmosphere too thick",
      });
      return;
    }

    if (draft.kind === "pair") {
      const nameA = takeName(rng, WORLD_NAMES, used);
      const nameB = takeName(rng, WORLD_NAMES, used);
      const palA = rockyPal[rockyI % rockyPal.length]!;
      const palB = rockyPal[(rockyI + 1) % rockyPal.length]!;
      const mA = massFrom(draft.radiusA, draft.surfaceGA);
      const mB = massFrom(draft.radiusB, draft.surfaceGB);
      const baryId = slug("bary", planets.length);
      const bary: Planet = {
        id: baryId,
        name: `${nameA}·${nameB}`,
        kind: "barycenter",
        ...rail,
        radius: 0,
        surfaceG: 0,
        mass: mA + mB,
        landable: false,
        rotate: 0,
        spin: 0,
        colorA: palA[0],
        colorB: palA[1],
        atmo: "rgba(0,0,0,0)",
        kicker: "Pair",
        title: `${nameA} · ${nameB}`,
        body: "",
      };
      planets.push(bary);

      const mu = G * GRAVITY_BASE * (mA + mB);
      const n = Math.sqrt(mu / (draft.sep * draft.sep * draft.sep));
      const aA = draft.sep * (mB / (mA + mB));
      const aB = draft.sep * (mA / (mA + mB));
      const theta = rng() * Math.PI * 2;
      const kA = keplerRail(aA, 0, 0, theta, n * n * aA * aA * aA);
      const kB = keplerRail(aB, 0, 0, theta + Math.PI, n * n * aB * aB * aB);
      const twinSpin = () => lerp(0.12, 0.32, rng()) * (rng() < 0.5 ? 1 : -1);
      planets.push({
        id: slug(nameA, planets.length),
        name: nameA,
        kind: "rocky",
        x: bary.x + kA.x,
        y: bary.y + kA.y,
        vx: bary.vx + kA.vx,
        vy: bary.vy + kA.vy,
        radius: draft.radiusA,
        surfaceG: draft.surfaceGA,
        mass: mA,
        landable: true,
        rotate: rng() * Math.PI * 2,
        spin: twinSpin(),
        colorA: palA[0],
        colorB: palA[1],
        atmo: atmo(palA[0], 0.26),
        parentId: baryId,
        orbitR: aA,
        orbitA: theta,
        orbitW: n,
        orbitE: 0,
        orbitPeri: 0,
        kicker: "Twin",
        title: nameA,
        body: `${nameA} is bound to ${nameB}. Two wells, one dance. Land on either; the other never sits still.`,
      });
      planets.push({
        id: slug(nameB, planets.length),
        name: nameB,
        kind: "rocky",
        x: bary.x + kB.x,
        y: bary.y + kB.y,
        vx: bary.vx + kB.vx,
        vy: bary.vy + kB.vy,
        radius: draft.radiusB,
        surfaceG: draft.surfaceGB,
        mass: mB,
        landable: true,
        rotate: rng() * Math.PI * 2,
        spin: twinSpin(),
        colorA: palB[0],
        colorB: palB[1],
        atmo: atmo(palB[0], 0.26),
        parentId: baryId,
        orbitR: aB,
        orbitA: theta + Math.PI,
        orbitW: n,
        orbitE: 0,
        orbitPeri: 0,
        kicker: "Twin",
        title: nameB,
        body: `${nameB} is bound to ${nameA}. Two wells, one dance. Land on either; the other never sits still.`,
      });
      return;
    }

    const name = takeName(rng, WORLD_NAMES, used);
    const pal = rockyPal[rockyI % rockyPal.length]!;
    const role = roles[rockyI]!;
    rockyI += 1;
    planets.push({
      id: slug(name, planets.length),
      name,
      kind: "rocky",
      ...rail,
      radius: draft.radius,
      surfaceG: draft.surfaceG,
      mass: massFrom(draft.radius, draft.surfaceG),
      landable: true,
      rotate: rng() * Math.PI * 2,
      spin: lerp(0.1, 0.26, rng()) * (rng() < 0.5 ? 1 : -1),
      colorA: pal[0],
      colorB: pal[1],
      atmo: atmo(pal[0], 0.26),
      kicker: role.kicker,
      title: name,
      body: role.body(name),
    });
  });

  const gas = planets.find((p) => p.kind === "gas")!;
  const moonPal = shuffle(rng, MOON_PALETTES);
  for (let m = 0; m < moonCount; m++) {
    const name = takeName(rng, MOON_NAMES, used);
    const radius = lerp(26, 44, rng());
    const surfaceG = lerp(4.2, 6.4, rng());
    const orbitR = gas.radius * (4.1 + m * 2.3 + rng() * 0.8);
    const orbitE = lerp(0.03, 0.07, rng());
    const orbitPeri = rng() * Math.PI * 2;
    const orbitA = rng() * Math.PI * 2 + m * 1.7;
    const k = keplerRail(orbitR, orbitE, orbitPeri, orbitA, G * GRAVITY_BASE * gas.mass);
    const pal = moonPal[m % moonPal.length]!;
    planets.push({
      id: slug(name, planets.length),
      name,
      kind: "moon",
      x: gas.x + k.x,
      y: gas.y + k.y,
      vx: gas.vx + k.vx,
      vy: gas.vy + k.vy,
      radius,
      surfaceG,
      mass: massFrom(radius, surfaceG),
      landable: true,
      rotate: rng() * Math.PI,
      spin: lerp(0.05, 0.14, rng()),
      colorA: pal[0],
      colorB: pal[1],
      atmo: atmo(pal[0], 0.18),
      parentId: gas.id,
      orbitR,
      orbitA,
      orbitW: k.n,
      orbitE,
      orbitPeri,
      kicker: "Moon",
      title: name,
      body: `A quiet moon of ${gas.name}. Slow down. The well will hold you if you let it.`,
    });
  }

  return planets;
}

export type ChartedSystem = {
  seed: number;
  planets: Planet[];
  home: Planet;
  start: { x: number; y: number; vx: number; vy: number; yaw: number };
  minimapWorldR: number;
};

let system: ChartedSystem | null = null;

export function isSystemReady() {
  return system !== null;
}

export function getSystem(): ChartedSystem {
  if (!system) throw new Error("System not created");
  return system;
}

export function createSystem(seed = (Math.random() * 0xffffffff) >>> 0): ChartedSystem {
  const planets = makeSystem(seed);
  const home = planets.find((p) => p.kicker === "Home") ?? planets.find((p) => p.kind === "rocky")!;
  const pad = home.radius + SHIP_HULL * 0.85;
  system = {
    seed,
    planets,
    home,
    start: {
      x: home.x,
      y: home.y - pad,
      vx: home.vx,
      vy: home.vy,
      yaw: 0,
    },
    minimapWorldR: Math.max(
      10800,
      planets.reduce((m, p) => {
        if (p.kind === "star" || p.orbitR == null) return Math.max(m, Math.hypot(p.x, p.y) + p.radius);
        const apo = p.orbitR * (1 + (p.orbitE ?? 0));
        if (p.parentId) {
          const parent = planets.find((b) => b.id === p.parentId);
          if (parent && parent.kind !== "star") {
            const parentApo =
              parent.orbitR != null
                ? parent.orbitR * (1 + (parent.orbitE ?? 0))
                : Math.hypot(parent.x, parent.y);
            return Math.max(m, parentApo + apo + p.radius);
          }
        }
        return Math.max(m, apo + p.radius);
      }, 0) * 1.12,
    ),
  };
  return system;
}

export function planetById(id: string) {
  return system?.planets.find((p) => p.id === id) ?? null;
}

export function getPlanets(): Planet[] {
  return system?.planets ?? [];
}

export function getStart() {
  return getSystem().start;
}

export function getMinimapWorldR() {
  return system?.minimapWorldR ?? 10800;
}
