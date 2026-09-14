import type {
  CompositionReadout,
  FuelKind,
  MatterProfileId,
  Mix,
  MixEntry,
  Planet,
  PlanetKind,
  SubstanceId,
} from "./types.ts";

export type SubstanceClass = "gas" | "ice" | "rock" | "exotic";
export type MatterLayer = "bulk" | "atmosphere";

export type Substance = {
  id: SubstanceId;
  hud: string;
  name: string;
  class: SubstanceClass;
  /** NTR and HUSH are not world matter — they stay off this catalog. */
  fuelKind?: FuelKind;
};

export type MatterProfile = {
  id: MatterProfileId;
  kind: Exclude<PlanetKind, "barycenter">;
  bulk: Mix;
  atmosphere: Mix;
};

export const SUBSTANCES: Record<SubstanceId, Substance> = {
  h2: { id: "h2", hud: "H2", name: "Hydrogen", class: "gas", fuelKind: "h2" },
  he: { id: "he", hud: "He", name: "Helium", class: "gas" },
  n2: { id: "n2", hud: "N2", name: "Nitrogen", class: "gas" },
  co2: { id: "co2", hud: "CO2", name: "Carbon dioxide", class: "gas" },
  ch4: { id: "ch4", hud: "CH4", name: "Methane", class: "gas", fuelKind: "ch4" },
  nh3: { id: "nh3", hud: "NH3", name: "Ammonia", class: "gas", fuelKind: "nh3" },
  d: { id: "d", hud: "D", name: "Deuterium", class: "gas", fuelKind: "d" },
  he3: { id: "he3", hud: "He3", name: "Helium-3", class: "gas", fuelKind: "he3" },
  lumen: { id: "lumen", hud: "LUMEN", name: "Lumen", class: "exotic", fuelKind: "lumen" },
  h2o: { id: "h2o", hud: "H2O", name: "Water ice", class: "ice" },
  silicate: { id: "silicate", hud: "Si", name: "Silicate", class: "rock" },
  iron: { id: "iron", hud: "Fe", name: "Iron", class: "rock" },
  carbon: { id: "carbon", hud: "C", name: "Carbon", class: "rock" },
  sulfur: { id: "sulfur", hud: "S", name: "Sulfur", class: "rock" },
};

const mix = (...entries: MixEntry[]): Mix => entries;

export const MATTER_PROFILES: Record<MatterProfileId, MatterProfile> = {
  "star-warm": {
    id: "star-warm",
    kind: "star",
    bulk: mix({ id: "h2", fraction: 0.73 }, { id: "he", fraction: 0.25 }, { id: "d", fraction: 0.02 }),
    atmosphere: mix(
      { id: "h2", fraction: 0.7 },
      { id: "he", fraction: 0.22 },
      { id: "lumen", fraction: 0.08 },
    ),
  },
  "star-hot": {
    id: "star-hot",
    kind: "star",
    bulk: mix(
      { id: "h2", fraction: 0.62 },
      { id: "he", fraction: 0.32 },
      { id: "d", fraction: 0.04 },
      { id: "he3", fraction: 0.02 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.58 },
      { id: "he", fraction: 0.28 },
      { id: "lumen", fraction: 0.12 },
      { id: "he3", fraction: 0.02 },
    ),
  },
  "rocky-home": {
    id: "rocky-home",
    kind: "rocky",
    bulk: mix(
      { id: "silicate", fraction: 0.62 },
      { id: "iron", fraction: 0.28 },
      { id: "carbon", fraction: 0.1 },
    ),
    atmosphere: mix({ id: "n2", fraction: 0.78 }, { id: "co2", fraction: 0.22 }),
  },
  "rocky-workshop": {
    id: "rocky-workshop",
    kind: "rocky",
    bulk: mix(
      { id: "iron", fraction: 0.48 },
      { id: "silicate", fraction: 0.4 },
      { id: "carbon", fraction: 0.12 },
    ),
    atmosphere: mix({ id: "n2", fraction: 0.85 }, { id: "co2", fraction: 0.15 }),
  },
  "rocky-signal": {
    id: "rocky-signal",
    kind: "rocky",
    bulk: mix(
      { id: "silicate", fraction: 0.7 },
      { id: "iron", fraction: 0.22 },
      { id: "sulfur", fraction: 0.08 },
    ),
    atmosphere: mix({ id: "co2", fraction: 1 }),
  },
  "rocky-archive": {
    id: "rocky-archive",
    kind: "rocky",
    bulk: mix(
      { id: "silicate", fraction: 0.55 },
      { id: "carbon", fraction: 0.3 },
      { id: "iron", fraction: 0.15 },
    ),
    atmosphere: mix({ id: "co2", fraction: 0.6 }, { id: "ch4", fraction: 0.4 }),
  },
  "rocky-twin": {
    id: "rocky-twin",
    kind: "rocky",
    bulk: mix(
      { id: "silicate", fraction: 0.58 },
      { id: "iron", fraction: 0.32 },
      { id: "carbon", fraction: 0.1 },
    ),
    atmosphere: mix({ id: "n2", fraction: 0.7 }, { id: "co2", fraction: 0.3 }),
  },
  "gas-ammonia": {
    id: "gas-ammonia",
    kind: "gas",
    bulk: mix(
      { id: "h2", fraction: 0.82 },
      { id: "he", fraction: 0.12 },
      { id: "nh3", fraction: 0.06 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.7 },
      { id: "he", fraction: 0.1 },
      { id: "nh3", fraction: 0.2 },
    ),
  },
  "gas-methane": {
    id: "gas-methane",
    kind: "gas",
    bulk: mix(
      { id: "h2", fraction: 0.8 },
      { id: "he", fraction: 0.12 },
      { id: "ch4", fraction: 0.08 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.68 },
      { id: "he", fraction: 0.1 },
      { id: "ch4", fraction: 0.22 },
    ),
  },
  "gas-ice": {
    id: "gas-ice",
    kind: "gas",
    bulk: mix(
      { id: "h2", fraction: 0.7 },
      { id: "he", fraction: 0.22 },
      { id: "h2o", fraction: 0.08 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.62 },
      { id: "he", fraction: 0.28 },
      { id: "ch4", fraction: 0.1 },
    ),
  },
  "gas-sulfur": {
    id: "gas-sulfur",
    kind: "gas",
    bulk: mix(
      { id: "h2", fraction: 0.78 },
      { id: "he", fraction: 0.12 },
      { id: "sulfur", fraction: 0.1 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.66 },
      { id: "he", fraction: 0.12 },
      { id: "ch4", fraction: 0.22 },
    ),
  },
  "gas-water": {
    id: "gas-water",
    kind: "gas",
    bulk: mix(
      { id: "h2", fraction: 0.74 },
      { id: "he", fraction: 0.16 },
      { id: "h2o", fraction: 0.1 },
    ),
    atmosphere: mix(
      { id: "h2", fraction: 0.66 },
      { id: "he", fraction: 0.18 },
      { id: "nh3", fraction: 0.16 },
    ),
  },
  "moon-rock": {
    id: "moon-rock",
    kind: "moon",
    bulk: mix(
      { id: "silicate", fraction: 0.72 },
      { id: "iron", fraction: 0.2 },
      { id: "carbon", fraction: 0.08 },
    ),
    atmosphere: [],
  },
  "moon-ice": {
    id: "moon-ice",
    kind: "moon",
    bulk: mix(
      { id: "h2o", fraction: 0.62 },
      { id: "silicate", fraction: 0.28 },
      { id: "ch4", fraction: 0.1 },
    ),
    atmosphere: [],
  },
  "moon-ammonia": {
    id: "moon-ammonia",
    kind: "moon",
    bulk: mix(
      { id: "h2o", fraction: 0.45 },
      { id: "nh3", fraction: 0.3 },
      { id: "silicate", fraction: 0.25 },
    ),
    atmosphere: [],
  },
  "moon-he3": {
    id: "moon-he3",
    kind: "moon",
    bulk: mix(
      { id: "silicate", fraction: 0.7 },
      { id: "iron", fraction: 0.22 },
      { id: "he3", fraction: 0.08 },
    ),
    atmosphere: [],
  },
  "moon-deuterium": {
    id: "moon-deuterium",
    kind: "moon",
    bulk: mix(
      { id: "h2o", fraction: 0.55 },
      { id: "silicate", fraction: 0.3 },
      { id: "d", fraction: 0.15 },
    ),
    atmosphere: [],
  },
  "asteroid-silicate": {
    id: "asteroid-silicate",
    kind: "asteroid",
    bulk: mix(
      { id: "silicate", fraction: 0.68 },
      { id: "iron", fraction: 0.22 },
      { id: "carbon", fraction: 0.1 },
    ),
    atmosphere: [],
  },
  "asteroid-iron": {
    id: "asteroid-iron",
    kind: "asteroid",
    bulk: mix(
      { id: "iron", fraction: 0.58 },
      { id: "silicate", fraction: 0.32 },
      { id: "sulfur", fraction: 0.1 },
    ),
    atmosphere: [],
  },
  "asteroid-ice": {
    id: "asteroid-ice",
    kind: "asteroid",
    bulk: mix(
      { id: "h2o", fraction: 0.62 },
      { id: "silicate", fraction: 0.28 },
      { id: "carbon", fraction: 0.1 },
    ),
    atmosphere: [],
  },
  "asteroid-carbon": {
    id: "asteroid-carbon",
    kind: "asteroid",
    bulk: mix(
      { id: "carbon", fraction: 0.55 },
      { id: "silicate", fraction: 0.32 },
      { id: "iron", fraction: 0.13 },
    ),
    atmosphere: [],
  },
};

export const MATTER_PROFILE_IDS = Object.keys(MATTER_PROFILES) as MatterProfileId[];

export const MOON_PROFILE_IDS: MatterProfileId[] = [
  "moon-rock",
  "moon-ice",
  "moon-ammonia",
  "moon-he3",
  "moon-deuterium",
];

/** What each kind is allowed to carry. Atmosphere is always a subset of gas/exotic. */
export const KIND_ALLOW: Record<
  Exclude<PlanetKind, "barycenter">,
  { bulk: readonly SubstanceId[]; atmosphere: readonly SubstanceId[] }
> = {
  star: {
    bulk: ["h2", "he", "d", "he3"],
    atmosphere: ["h2", "he", "d", "he3", "lumen"],
  },
  rocky: {
    bulk: ["silicate", "iron", "carbon", "sulfur", "h2o"],
    atmosphere: ["n2", "co2", "ch4", "nh3"],
  },
  gas: {
    bulk: ["h2", "he", "nh3", "ch4", "h2o", "sulfur"],
    atmosphere: ["h2", "he", "nh3", "ch4"],
  },
  moon: {
    bulk: ["silicate", "iron", "carbon", "sulfur", "h2o", "ch4", "nh3", "he3", "d"],
    atmosphere: ["n2", "ch4", "co2"],
  },
  asteroid: {
    bulk: ["silicate", "iron", "carbon", "sulfur", "h2o"],
    atmosphere: ["n2", "ch4", "co2"],
  },
};

const ROCKY_BY_KICKER: Record<string, MatterProfileId> = {
  Home: "rocky-home",
  Workshop: "rocky-workshop",
  Signal: "rocky-signal",
  Archive: "rocky-archive",
  Twin: "rocky-twin",
};

export function cloneMix(src: Mix): Mix {
  return src.map((e) => ({ id: e.id, fraction: e.fraction }));
}

export function mixSum(src: Mix) {
  return src.reduce((n, e) => n + e.fraction, 0);
}

export function withMatter<T extends object>(
  body: T,
  id: MatterProfileId | null,
): T & { matter: MatterProfileId | null; bulk: Mix; atmosphere: Mix } {
  if (!id) return { ...body, matter: null, bulk: [], atmosphere: [] };
  const profile = MATTER_PROFILES[id];
  return {
    ...body,
    matter: id,
    bulk: cloneMix(profile.bulk),
    atmosphere: cloneMix(profile.atmosphere),
  };
}

export function clonePlanetMatter(p: Planet): Pick<Planet, "matter" | "bulk" | "atmosphere"> {
  return {
    matter: p.matter,
    bulk: cloneMix(p.bulk),
    atmosphere: cloneMix(p.atmosphere),
  };
}

/** Gold / ember palettes are warm. The blue-white palette (index 3) is hot. */
export function starProfileId(palIndex: number): MatterProfileId {
  return palIndex === 3 ? "star-hot" : "star-warm";
}

/** One gas palette → one recipe. Index matches GAS_PALETTES in world.ts. */
export function gasProfileId(palIndex: number): MatterProfileId {
  const ids: MatterProfileId[] = [
    "gas-ammonia",
    "gas-methane",
    "gas-ice",
    "gas-sulfur",
    "gas-water",
  ];
  return ids[Math.max(0, Math.min(ids.length - 1, palIndex))]!;
}

export function rockyProfileId(kicker: string): MatterProfileId {
  return ROCKY_BY_KICKER[kicker] ?? "rocky-home";
}

export function moonProfileId(rng: () => number): MatterProfileId {
  return MOON_PROFILE_IDS[Math.floor(rng() * MOON_PROFILE_IDS.length)]!;
}

export const ASTEROID_PROFILE_IDS: MatterProfileId[] = [
  "asteroid-silicate",
  "asteroid-iron",
  "asteroid-ice",
  "asteroid-carbon",
];

export function asteroidProfileId(rng: () => number): MatterProfileId {
  return ASTEROID_PROFILE_IDS[Math.floor(rng() * ASTEROID_PROFILE_IDS.length)]!;
}

export function mixLegal(
  kind: PlanetKind,
  layer: MatterLayer,
  src: Mix,
): { ok: boolean; reason?: string } {
  if (kind === "barycenter") {
    if (src.length === 0) return { ok: true };
    return { ok: false, reason: "barycenter must be empty" };
  }
  if (src.length === 0) {
    if (layer === "atmosphere") return { ok: true };
    return { ok: false, reason: `${kind} bulk cannot be empty` };
  }
  const allow = KIND_ALLOW[kind][layer];
  const sum = mixSum(src);
  if (Math.abs(sum - 1) > 1e-9) return { ok: false, reason: `${layer} fractions sum to ${sum}` };
  for (const e of src) {
    if (e.fraction <= 0) return { ok: false, reason: `${e.id} fraction must be > 0` };
    if (!allow.includes(e.id)) return { ok: false, reason: `${e.id} is not allowed in ${kind} ${layer}` };
    if (layer === "atmosphere") {
      const cls = SUBSTANCES[e.id].class;
      if (cls !== "gas" && cls !== "exotic") {
        return { ok: false, reason: `${e.id} (${cls}) cannot be atmosphere` };
      }
    }
  }
  return { ok: true };
}

export function profileLegal(id: MatterProfileId): { ok: boolean; reason?: string } {
  const p = MATTER_PROFILES[id];
  const bulk = mixLegal(p.kind, "bulk", p.bulk);
  if (!bulk.ok) return { ok: false, reason: `${id} bulk: ${bulk.reason}` };
  const atmo = mixLegal(p.kind, "atmosphere", p.atmosphere);
  if (!atmo.ok) return { ok: false, reason: `${id} atmosphere: ${atmo.reason}` };
  return { ok: true };
}

/** Fuel grades this mix could scoop later. Not wired to landing. */
export function fuelInMix(src: Mix): FuelKind[] {
  const out: FuelKind[] = [];
  for (const e of src) {
    const fuel = SUBSTANCES[e.id].fuelKind;
    if (fuel && !out.includes(fuel)) out.push(fuel);
  }
  return out;
}

/** Locked-orbit survey length. */
export const SCAN_SECONDS = 11;
/** Mass-spec x-axis. Peaks sit on unique m/z slots below this. */
export const MZ_MAX = 100;

/** Distinct m/z slots, mass-ish so the trace reads as a spectrograph. */
export const SUBSTANCE_MZ: Record<SubstanceId, number> = {
  h2: 2,
  he3: 3,
  he: 4,
  d: 6,
  carbon: 12,
  ch4: 16,
  nh3: 17,
  h2o: 18,
  n2: 28,
  sulfur: 32,
  co2: 44,
  iron: 56,
  silicate: 72,
  lumen: 88,
};

export type SpectrumPeak = {
  id: SubstanceId;
  mz: number;
  height: number;
  layer: MatterLayer;
  fuel: boolean;
};

export function canScan(p: Pick<Planet, "kind" | "matter">) {
  return p.kind !== "barycenter" && p.matter != null;
}

/** Largest-remainder percents so a mix still sums to 100. */
export function mixPercents(src: Mix): { id: SubstanceId; hud: string; pct: number }[] {
  if (src.length === 0) return [];
  const exact = src.map((e) => e.fraction * 100);
  const floors = exact.map((n) => Math.floor(n));
  let used = floors.reduce((n, v) => n + v, 0);
  const order = exact
    .map((n, i) => ({ i, frac: n - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < 100 && k < order.length * 2) {
    const slot = order[k % order.length]!;
    floors[slot.i]! += 1;
    used += 1;
    k += 1;
  }
  const out: { id: SubstanceId; hud: string; pct: number }[] = [];
  for (let i = 0; i < src.length; i++) {
    const pct = floors[i]!;
    if (pct <= 0) continue;
    const id = src[i]!.id;
    out.push({ id, hud: SUBSTANCES[id].hud, pct });
  }
  return out;
}

export function formatMix(src: Mix) {
  return mixPercents(src)
    .map((e) => `${e.hud} ${e.pct}`)
    .join(" · ");
}

export function bodyReadout(p: Pick<Planet, "atmosphere" | "bulk">): CompositionReadout {
  return {
    atmosphere: p.atmosphere.length ? formatMix(p.atmosphere) : null,
    bulk: p.bulk.length ? formatMix(p.bulk) : null,
  };
}

export function bodyPeaks(p: Pick<Planet, "bulk" | "atmosphere">): SpectrumPeak[] {
  const peaks: SpectrumPeak[] = [];
  for (const e of p.bulk) {
    peaks.push({
      id: e.id,
      mz: SUBSTANCE_MZ[e.id],
      height: e.fraction,
      layer: "bulk",
      fuel: SUBSTANCES[e.id].fuelKind != null,
    });
  }
  for (const e of p.atmosphere) {
    const clash = p.bulk.some((b) => b.id === e.id);
    peaks.push({
      id: e.id,
      mz: SUBSTANCE_MZ[e.id] + (clash ? 1.2 : 0),
      height: e.fraction,
      layer: "atmosphere",
      fuel: SUBSTANCES[e.id].fuelKind != null,
    });
  }
  return peaks;
}
