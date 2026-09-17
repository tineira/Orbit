import type { CivId, Planet, PlanetKind, Settlement } from "./types.ts";

export function isOccupiableKind(kind: PlanetKind): boolean {
  return kind === "rocky" || kind === "moon" || kind === "asteroid";
}

export function occupancyLegal(
  p: Pick<Planet, "kind" | "kicker" | "landable" | "settlement" | "civ">,
): { ok: boolean; reason?: string } {
  const occupiable = isOccupiableKind(p.kind);
  if (!occupiable) {
    if (p.settlement != null || p.civ != null) {
      return { ok: false, reason: `${p.kind} must have null occupancy` };
    }
    return { ok: true };
  }
  if (p.settlement == null) return { ok: false, reason: `${p.kind} needs settlement` };
  if (p.settlement === "unexplored") {
    if (p.civ != null) return { ok: false, reason: "unexplored cannot carry a civ" };
  } else if (p.civ == null) {
    return { ok: false, reason: `${p.settlement} requires civ` };
  }
  if (p.kicker === "Home") {
    if (p.settlement !== "active" || p.civ !== "human") {
      return { ok: false, reason: "Home must be active human" };
    }
  }
  if (p.kicker === "Camp") {
    if (p.settlement !== "active" || p.civ !== "human") {
      return { ok: false, reason: "Camp must be active human" };
    }
  }
  const shard = p.kicker === "Shard" || (p.kind === "asteroid" && !p.landable);
  if (shard && (p.settlement !== "unexplored" || p.civ != null)) {
    return { ok: false, reason: "Shard must be unexplored with civ null" };
  }
  return { ok: true };
}

/** Pads load methane. Active settlements only. */
export function padHasFuel(p: Pick<Planet, "settlement">): boolean {
  return p.settlement === "active";
}

/** One draw. Weights must sum to 1. */
export function rollSettlement(
  rng: () => number,
  w: { active: number; abandoned: number; unexplored: number },
): Settlement {
  const r = rng();
  if (r < w.active) return "active";
  if (r < w.active + w.abandoned) return "abandoned";
  return "unexplored";
}

export type FlavorArgs = {
  kind: PlanetKind;
  kicker: string;
  settlement: Settlement | null;
  civ: CivId | null;
  name: string;
  ctx?: { gasName?: string; twinName?: string };
};

type CopyFn = (args: FlavorArgs) => string;

function twinBound(name: string, twin: string) {
  return `${name} is bound to ${twin}. Two wells, one dance. Land on either; the other never sits still.`;
}

const COPY: Record<string, CopyFn> = {
  "Home:active:human": () =>
    "A small cradle world. This page is a system — fly it instead of scrolling it.",
  "Workshop:active:human": ({ name }) =>
    `${name} is a workshop in a shallow well. Things get built, then pushed into the dark.`,
  "Workshop:abandoned:human": ({ name }) =>
    `${name} is a dead floor. The jigs are still standing. The tank stays empty.`,
  "Workshop:unexplored:": ({ name }) =>
    `No one named this. ${name} is a workshop well. The tank stays empty.`,
  "Signal:active:human": () => "A cold radio world. Signals go out. Few come back.",
  "Signal:abandoned:human": () =>
    "The mast still points. Nobody answers. The tank stays empty.",
  "Signal:unexplored:": () => "No one named this. A cold radio world. The tank stays empty.",
  "Archive:active:human": ({ name }) =>
    `Dust libraries on ${name}, still staffed. Whatever was written here is still in orbit around the idea of it.`,
  "Archive:abandoned:human": ({ name }) =>
    `Dust libraries on ${name}. Whatever was written here is still in orbit around the idea of it.`,
  "Archive:unexplored:": ({ name }) =>
    `No one named this. Dust libraries on ${name}. The tank stays empty.`,
  "Twin:active:human": ({ name, ctx }) =>
    `${twinBound(name, ctx?.twinName ?? "its twin")} The pad is staffed. The tank fills.`,
  "Twin:abandoned:human": ({ name, ctx }) =>
    `${twinBound(name, ctx?.twinName ?? "its twin")} The pad is empty. The lights are dead.`,
  "Twin:unexplored:": ({ name, ctx }) =>
    `${twinBound(name, ctx?.twinName ?? "its twin")} No one named this. The tank stays empty.`,
  "Camp:active:human": ({ name }) =>
    `Someone bolted a light to ${name}. The well is a pebble. The tank still fills.`,
  "Rock:active:human": ({ name }) =>
    `A working pad on ${name}. It is a belt rock, not a Camp. The tank fills.`,
  "Rock:abandoned:human": ({ name }) =>
    `An empty pad on ${name}. The lights are dead. The tank stays empty.`,
  "Rock:unexplored:": ({ name }) =>
    `No one named this. ${name} is a face in the belt. The tank stays empty.`,
  "Shard:unexplored:": ({ name }) =>
    `${name} is grit on the rail. Too small to land. Catch an orbit; the spec still reads.`,
  "Moon:active:human": ({ name, ctx }) =>
    `Someone lives on ${name}, in the shadow of ${ctx?.gasName ?? "the giant"}. The tank fills.`,
  "Moon:abandoned:human": ({ name, ctx }) =>
    `An empty pad on ${name}, in the shadow of ${ctx?.gasName ?? "the giant"}. The lights are dead.`,
  "Moon:unexplored:": ({ name, ctx }) =>
    `A quiet moon of ${ctx?.gasName ?? "the giant"}. Slow down. The well will hold you if you let it. The tank stays empty.`,
};

export function flavorBody(args: FlavorArgs): string {
  if (args.settlement == null) {
    throw new Error(`flavorBody is not for null occupancy (${args.kind})`);
  }
  const key = `${args.kicker}:${args.settlement}:${args.civ ?? ""}`;
  const row = COPY[key];
  if (!row) throw new Error(`missing occupancy copy: ${key}`);
  return row(args);
}

function mineFrac(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Primary belt rocks are ≥26. Medium extras sit under 22. */
export const ASTEROID_MINE_PRIMARY_R = 26;

export type MineBeacon = "beacon" | "flicker" | "off";

export type AsteroidMineTower = {
  /** Body-frame offset from `padAngle`. Shoulders of the pad; never the landing spot. */
  dPad: number;
  beacon: MineBeacon;
};

export type AsteroidMine = {
  towers: AsteroidMineTower[];
  padLights: boolean;
};

/** Human mining camp on a landable asteroid. Unexplored and shards have none. */
export function asteroidMine(
  p: Pick<Planet, "kind" | "landable" | "radius" | "settlement" | "shapeSeed">,
): AsteroidMine | null {
  if (p.kind !== "asteroid" || !p.landable) return null;
  if (p.settlement !== "active" && p.settlement !== "abandoned") return null;
  const seed = p.shapeSeed ?? 0;
  const n = p.radius >= ASTEROID_MINE_PRIMARY_R ? 2 : 1;
  const offsets = n === 1 ? [-0.28] : [-0.28, 0.28];
  const towers: AsteroidMineTower[] = offsets.map((dPad, i) => {
    const beacon: MineBeacon =
      p.settlement === "active"
        ? "beacon"
        : mineFrac(seed * 3.9 + i * 2.3) < 0.42
          ? "flicker"
          : "off";
    return { dPad, beacon };
  });
  return { towers, padLights: p.settlement === "active" };
}

/** FAA L-864-ish red beacon: 30 flashes/min. */
export const MINE_BEACON_PERIOD_MS = 2000;
const MINE_BEACON_ON = 0.4;

/** Towers on one rock share a phase. Different rocks desync via `phaseMs`. */
export function mineBeaconLit(
  nowMs: number,
  reducedMotion: boolean,
  phaseMs = 0,
  kind: MineBeacon = "beacon",
): boolean {
  if (kind === "off") return false;
  if (kind === "beacon") {
    if (reducedMotion) return true;
    const t =
      ((nowMs + phaseMs) % MINE_BEACON_PERIOD_MS + MINE_BEACON_PERIOD_MS) % MINE_BEACON_PERIOD_MS;
    return t < MINE_BEACON_PERIOD_MS * MINE_BEACON_ON;
  }
  if (reducedMotion) return false;
  const a = mineFrac(nowMs * 0.017 + phaseMs * 0.001);
  const b = mineFrac(nowMs * 0.043 + phaseMs * 0.002 + 2.1);
  return a > 0.42 && b > 0.28;
}
