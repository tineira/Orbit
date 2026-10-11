import type { EngineKind, FuelKind, Ship, TankKind } from "./types.ts";

/** localStorage key. Random mode never reads or writes it. */
export const CAMPAIGN_STORAGE_KEY = "orbit.campaign.v1";

export type CampaignFlag = string;

export type CampaignModule = "transceiver" | "atmoTrap" | "hushDetector";

export type Grant =
  | { engine: EngineKind }
  | { tank: TankKind }
  | { module: CampaignModule };

export type CampaignLeg = { id: string; step: number; seed: number };

/** The loadout a checkpoint can put back. Position comes from the body. */
export type CampaignShip = Pick<Ship, "fuelKind" | "engineKind" | "tankKind" | "fuel" | "hull">;

export type CampaignCheckpoint = {
  seed: number;
  landedId: string | null;
  place: string | null;
  leg: CampaignLeg | null;
  flags: CampaignFlag[];
  firedTriggers: string[];
  /** Heading ids revealed by triggers. Missing on old saves, which load as []. */
  revealed: string[];
  ship: CampaignShip;
  modules: Grant[];
};

export type CampaignState = {
  version: 1;
  place: string | null;
  leg: CampaignLeg | null;
  flags: CampaignFlag[];
  firedTriggers: string[];
  /** Heading ids revealed by triggers. Missing on old saves, which load as []. */
  revealed: string[];
  ship: CampaignShip;
  modules: Grant[];
  checkpoint: CampaignCheckpoint;
};

export type CampaignStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const FUELS = new Set<FuelKind>(["ch4", "nh3", "h2", "ntr", "d", "he3", "lumen", "hush"]);
const ENGINES = new Set<EngineKind>(["v1", "v2", "thermal", "torch", "lumen", "coil"]);
const TANKS = new Set<TankKind>(["fuel", "long", "cryo", "hold", "cistern"]);
const MODULES = new Set<CampaignModule>(["transceiver", "atmoTrap", "hushDetector"]);

export function campaignFromSearch(search = ""): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!params.has("campaign")) return false;
  const value = (params.get("campaign") ?? "").trim().toLowerCase();
  return value !== "0" && value !== "off" && value !== "false";
}

/** Same place and seed: keep the save. A different place, or no save, starts fresh. */
export function resumePlaceSave(
  stored: CampaignState | null,
  place: { id: string; seed: number } | null,
): boolean {
  if (!place || !stored) return false;
  return stored.place === place.id && stored.checkpoint.seed === place.seed;
}

export function campaignShipFrom(
  ship: Pick<Ship, "fuelKind" | "engineKind" | "tankKind" | "fuel" | "hull">,
): CampaignShip {
  return {
    fuelKind: ship.fuelKind,
    engineKind: ship.engineKind,
    tankKind: ship.tankKind,
    fuel: ship.fuel,
    hull: ship.hull,
  };
}

export function newCampaign(opts: {
  seed: number;
  landedId: string | null;
  ship: CampaignShip;
  place?: string | null;
  leg?: CampaignLeg | null;
  flags?: CampaignFlag[];
  firedTriggers?: string[];
  modules?: Grant[];
}): CampaignState {
  const state: CampaignState = {
    version: 1,
    place: opts.place ?? null,
    leg: cloneLeg(opts.leg ?? null),
    flags: (opts.flags ?? []).slice(),
    firedTriggers: (opts.firedTriggers ?? []).slice(),
    revealed: [],
    ship: { ...opts.ship },
    modules: (opts.modules ?? []).map(cloneGrant),
    checkpoint: blankCheckpoint(opts.seed, opts.landedId, opts.ship),
  };
  return writeCheckpoint(state, {
    seed: opts.seed,
    landedId: opts.landedId,
    ship: opts.ship,
    place: state.place,
    leg: state.leg,
  });
}

export type CheckpointSnap = {
  seed: number;
  landedId: string | null;
  ship: CampaignShip;
  /** Omit to keep the current place. Pass null when a story landing ends a leg. */
  place?: string | null;
  leg?: CampaignLeg | null;
};

/** Freeze the ship, marks, place or leg, and seed. Later flight does not move this copy. */
export function writeCheckpoint(state: CampaignState, snap: CheckpointSnap): CampaignState {
  const place = snap.place !== undefined ? snap.place : state.place;
  const leg = snap.leg !== undefined ? cloneLeg(snap.leg) : cloneLeg(state.leg);
  const ship = { ...snap.ship };
  const flags = state.flags.slice();
  const firedTriggers = state.firedTriggers.slice();
  const revealed = state.revealed.slice();
  const modules = state.modules.map(cloneGrant);
  state.place = place;
  state.leg = cloneLeg(leg);
  state.flags = flags;
  state.firedTriggers = firedTriggers;
  state.revealed = revealed;
  state.ship = { ...ship };
  state.modules = modules.map(cloneGrant);
  state.checkpoint = {
    seed: snap.seed >>> 0,
    landedId: snap.landedId,
    place,
    leg: cloneLeg(leg),
    flags: flags.slice(),
    firedTriggers: firedTriggers.slice(),
    revealed: revealed.slice(),
    ship: { ...ship },
    modules: modules.map(cloneGrant),
  };
  return state;
}

/** Copy marks onto the frozen checkpoint. Does not move the ship, the pad, or the seed. */
export function keepCampaignMarks(state: CampaignState): CampaignState {
  const cp = state.checkpoint;
  cp.flags = state.flags.slice();
  cp.firedTriggers = state.firedTriggers.slice();
  cp.revealed = state.revealed.slice();
  cp.modules = state.modules.map(cloneGrant);
  return state;
}

/** Copy the frozen checkpoint back onto the live fields. */
export function restoreCampaignFields(state: CampaignState): CampaignState {
  const cp = state.checkpoint;
  state.place = cp.place;
  state.leg = cloneLeg(cp.leg);
  state.flags = cp.flags.slice();
  state.firedTriggers = cp.firedTriggers.slice();
  state.revealed = cp.revealed.slice();
  state.ship = { ...cp.ship };
  state.modules = cp.modules.map(cloneGrant);
  return state;
}

export function saveCampaign(
  state: CampaignState,
  storage: CampaignStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadCampaign(storage: CampaignStorage | null = defaultStorage()): CampaignState | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CAMPAIGN_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parseCampaign(JSON.parse(raw));
  } catch {
    return null;
  }
}

function defaultStorage(): CampaignStorage | null {
  try {
    const ls = (globalThis as { localStorage?: CampaignStorage }).localStorage;
    if (!ls || typeof ls.getItem !== "function" || typeof ls.setItem !== "function") return null;
    return ls;
  } catch {
    return null;
  }
}

function blankCheckpoint(seed: number, landedId: string | null, ship: CampaignShip): CampaignCheckpoint {
  return {
    seed: seed >>> 0,
    landedId,
    place: null,
    leg: null,
    flags: [],
    firedTriggers: [],
    revealed: [],
    ship: { ...ship },
    modules: [],
  };
}

function cloneLeg(leg: CampaignLeg | null): CampaignLeg | null {
  return leg ? { id: leg.id, step: leg.step, seed: leg.seed >>> 0 } : null;
}

function cloneGrant(grant: Grant): Grant {
  if ("engine" in grant) return { engine: grant.engine };
  if ("tank" in grant) return { tank: grant.tank };
  return { module: grant.module };
}

function parseCampaign(value: unknown): CampaignState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  const ship = parseShip(row.ship);
  const checkpoint = parseCheckpoint(row.checkpoint);
  const flags = parseFlags(row.flags);
  const firedTriggers = parseIds(row.firedTriggers);
  const revealed = parseOptionalIds(row.revealed);
  const modules = parseGrants(row.modules);
  const place = parsePlace(row.place);
  const leg = parseLeg(row.leg);
  if (
    !ship ||
    !checkpoint ||
    !flags ||
    !firedTriggers ||
    !revealed ||
    !modules ||
    place === undefined ||
    leg === undefined
  ) {
    return null;
  }
  return {
    version: 1,
    place,
    leg,
    flags,
    firedTriggers,
    revealed,
    ship,
    modules,
    checkpoint,
  };
}

function parseCheckpoint(value: unknown): CampaignCheckpoint | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const seed = parseSeed(row.seed);
  const ship = parseShip(row.ship);
  const flags = parseFlags(row.flags);
  const firedTriggers = parseIds(row.firedTriggers);
  const revealed = parseOptionalIds(row.revealed);
  const modules = parseGrants(row.modules);
  const place = parsePlace(row.place);
  const leg = parseLeg(row.leg);
  const landedId = parseLandedId(row.landedId);
  if (
    seed == null ||
    !ship ||
    !flags ||
    !firedTriggers ||
    !revealed ||
    !modules ||
    place === undefined ||
    leg === undefined ||
    landedId === undefined
  ) {
    return null;
  }
  return { seed, landedId, place, leg, flags, firedTriggers, revealed, ship, modules };
}

function parseShip(value: unknown): CampaignShip | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!FUELS.has(row.fuelKind as FuelKind)) return null;
  if (!ENGINES.has(row.engineKind as EngineKind)) return null;
  if (!TANKS.has(row.tankKind as TankKind)) return null;
  if (typeof row.fuel !== "number" || !Number.isFinite(row.fuel) || row.fuel < 0) return null;
  if (typeof row.hull !== "number" || !Number.isFinite(row.hull)) return null;
  return {
    fuelKind: row.fuelKind as FuelKind,
    engineKind: row.engineKind as EngineKind,
    tankKind: row.tankKind as TankKind,
    fuel: row.fuel,
    hull: Math.min(100, Math.max(0, row.hull)),
  };
}

function parseSeed(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  return value;
}

function parsePlace(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || !value) return undefined;
  return value;
}

function parseLandedId(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || !value) return undefined;
  return value;
}

function parseLeg(value: unknown): CampaignLeg | null | undefined {
  if (value == null) return null;
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const seed = parseSeed(row.seed);
  if (typeof row.id !== "string" || !row.id) return undefined;
  if (typeof row.step !== "number" || !Number.isInteger(row.step) || row.step < 0) return undefined;
  if (seed == null) return undefined;
  return { id: row.id, step: row.step, seed };
}

function parseFlags(value: unknown): CampaignFlag[] | null {
  return parseIds(value);
}

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return value.slice();
}

/** Absent means an older save. A present non-array is corrupt. */
function parseOptionalIds(value: unknown): string[] | null {
  if (value == null) return [];
  return parseIds(value);
}

function parseGrants(value: unknown): Grant[] | null {
  if (!Array.isArray(value)) return null;
  const out: Grant[] = [];
  for (const item of value) {
    const grant = parseGrant(item);
    if (!grant) return null;
    out.push(grant);
  }
  return out;
}

function parseGrant(value: unknown): Grant | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== 1) return null;
  if (keys[0] === "engine" && ENGINES.has(row.engine as EngineKind)) return { engine: row.engine as EngineKind };
  if (keys[0] === "tank" && TANKS.has(row.tank as TankKind)) return { tank: row.tank as TankKind };
  if (keys[0] === "module" && MODULES.has(row.module as CampaignModule)) {
    return { module: row.module as CampaignModule };
  }
  return null;
}
