import type { Planet, PlanetKind } from "./types";

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
/** Atmosphere stronger than this dumps a locked orbit. */
export const ORBIT_DRAG_BREAK = 0.4;
export const TAKEOFF_SPEED = 20;
export const START_ALT = 220;

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

function placeAroundStar(
  rng: () => number,
  starR: number,
  radii: number[],
): { x: number; y: number }[] {
  const n = radii.length;
  const base = rng() * Math.PI * 2;
  const pos = radii.map((radius, i) => {
    const ang = base + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    const dist = lerp(5600, 9400, rng());
    return {
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      radius,
    };
  });

  for (let iter = 0; iter < 28; iter++) {
    for (let i = 0; i < n; i++) {
      const a = pos[i]!;
      const dStar = Math.hypot(a.x, a.y);
      const minStar = starR + a.radius + 3200;
      if (dStar < minStar && dStar > 1) {
        const s = minStar / dStar;
        a.x *= s;
        a.y *= s;
      }
      for (let j = i + 1; j < n; j++) {
        const b = pos[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius + 3600;
        if (d > 0.1 && d < min) {
          const push = (min - d) * 0.52;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push * 0.5;
          a.y -= ny * push * 0.5;
          b.x += nx * push * 0.5;
          b.y += ny * push * 0.5;
        }
      }
    }
  }

  return pos.map(({ x, y }) => ({ x, y }));
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
  const roles = [ROCKY_ROLES[0]!, ...shuffle(rng, ROCKY_ROLES.slice(1))].slice(0, rockyCount);
  const rockyPal = shuffle(rng, ROCKY_PALETTES);

  type Draft = { kind: PlanetKind; radius: number; surfaceG: number };
  const drafts: Draft[] = [];
  for (let i = 0; i < rockyCount; i++) {
    drafts.push({
      kind: "rocky",
      radius: lerp(54, 104, rng()),
      surfaceG: lerp(8.6, 13.8, rng()),
    });
  }
  const gasR = lerp(175, 248, rng());
  const gasG = lerp(13, 17, rng());
  drafts.push({ kind: "gas", radius: gasR, surfaceG: gasG });

  const seats = placeAroundStar(
    rng,
    starR,
    drafts.map((d) => d.radius),
  );
  let rockyI = 0;

  drafts.forEach((draft, i) => {
    const seat = seats[i]!;
    if (draft.kind === "gas") {
      const name = takeName(rng, WORLD_NAMES, used);
      const pal = pick(rng, GAS_PALETTES);
      planets.push({
        id: slug(name, planets.length),
        name,
        kind: "gas",
        x: seat.x,
        y: seat.y,
        vx: 0,
        vy: 0,
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

    const name = takeName(rng, WORLD_NAMES, used);
    const pal = rockyPal[rockyI % rockyPal.length]!;
    const role = roles[rockyI]!;
    rockyI += 1;
    planets.push({
      id: slug(name, planets.length),
      name,
      kind: "rocky",
      x: seat.x,
      y: seat.y,
      vx: 0,
      vy: 0,
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
    const orbitA = rng() * Math.PI * 2 + m * 1.7;
    const pal = moonPal[m % moonPal.length]!;
    planets.push({
      id: slug(name, planets.length),
      name,
      kind: "moon",
      x: gas.x + Math.cos(orbitA) * orbitR,
      y: gas.y + Math.sin(orbitA) * orbitR,
      vx: 0,
      vy: 0,
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
      orbitW: Math.sqrt((G * GRAVITY_BASE * gas.mass) / (orbitR * orbitR * orbitR)),
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
  const startR = home.radius + START_ALT;
  system = {
    seed,
    planets,
    home,
    start: {
      x: home.x,
      y: home.y - startR,
      vx: Math.sqrt((G * GRAVITY_BASE * home.mass) / startR),
      vy: 0,
      yaw: -Math.PI * 0.5,
    },
    minimapWorldR: Math.max(
      10800,
      planets.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y) + (p.orbitR ?? 0) + p.radius), 0) * 1.12,
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
