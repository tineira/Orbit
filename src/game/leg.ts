import type { CampaignState, Grant } from "./campaign.ts";
import { applyLoadout, syncFuelMass } from "./fuel.ts";
import { padHasFuel } from "./occupancy.ts";
import { chartStoryPlace, storyPlaceById } from "./place.ts";
import { shipDeltaV } from "./triggers.ts";
import type { EngineKind, FuelKind, NearbyHeading, Planet, TankKind } from "./types.ts";
import {
  createSystem,
  getSystem,
  WARP_BRAKE_SPEED,
  WARP_JUMP_SPEED,
  type Recipe,
} from "./world.ts";

export type LegStep = {
  recipe?: Recipe;
  /** Dry for the leg's fuel. Merged last so it wins over the base recipe. */
  bridge?: boolean;
  guarantee?: Recipe;
};

export type Leg = {
  id: string;
  from: string;
  to: string;
  /** Jumps from the origin place to the destination, counting the arrival. */
  length: [number, number];
  base: Recipe;
  /** Step 0 is the first generated system. -1 is the last generated system. */
  steps?: Record<number, LegStep>;
  /**
   * Grade a bridge must not refill.
   * The type sketch omitted this. Absent means methane pads.
   */
  fuel?: FuelKind;
};

/** Hand-test leg. Three jumps: a chart, a dry chart, then `probe-end`. */
export const PROBE_LEG: Leg = {
  id: "probe-leg",
  from: "probe",
  to: "probe-end",
  length: [3, 3],
  base: { nearby: { count: 2 } },
  fuel: "ch4",
  steps: {
    1: { bridge: true },
  },
};

const LEGS: Record<string, Leg> = {
  [PROBE_LEG.id]: PROBE_LEG,
};

export function legById(id: string): Leg | null {
  return LEGS[id] ?? null;
}

export function legFrom(placeId: string): Leg | null {
  for (const leg of Object.values(LEGS)) {
    if (leg.from === placeId) return leg;
  }
  return null;
}

export function pickLength(leg: Leg, salt: number): number {
  const lo = Math.trunc(Math.min(leg.length[0], leg.length[1]));
  const hi = Math.trunc(Math.max(leg.length[0], leg.length[1]));
  if (hi <= lo) return Math.max(1, lo);
  return lo + ((salt >>> 0) % (hi - lo + 1));
}

export function resolvedLength(leg: Leg, stored?: number): number {
  if (stored != null && Number.isInteger(stored) && stored >= 1) return stored;
  return pickLength(leg, 0);
}

/** Last generated step. Length 1 has none: the origin heading is the place. */
export function lastLegStep(length: number): number {
  return length - 2;
}

export function dryRecipe(fuel: FuelKind): Recipe {
  switch (fuel) {
    case "ch4":
      return { activePads: 0, home: "none", belt: "none" };
    case "nh3":
      return { gas: "ice" };
    case "h2":
      return { gas: "none" };
    case "ntr":
      return { home: "none", rocky: { roles: ["signal", "archive"] }, belt: "none" };
    case "d":
    case "he3":
      return { moons: [{ matter: "moon-ice" }, { matter: "moon-ice" }] };
    case "lumen":
      return { star: "warm" };
    case "hush":
      return {};
    default:
      return { activePads: 0, home: "none", belt: "none" };
  }
}

/** True when this chart still holds a canonical source for the grade. */
export function hasCanonicalRefill(planets: Planet[], fuel: FuelKind): boolean {
  switch (fuel) {
    case "ch4":
      return planets.some((p) => p.landable && padHasFuel(p));
    case "nh3":
      return planets.some(
        (p) => p.kind === "gas" && (p.matter === "gas-ammonia" || p.matter === "gas-water"),
      );
    case "h2":
      return planets.some((p) => p.kind === "gas");
    case "ntr":
      return planets.some((p) => p.kicker === "Workshop");
    case "d":
      return planets.some((p) => p.kind === "moon" && p.matter === "moon-deuterium");
    case "he3":
      return planets.some((p) => p.kind === "moon" && p.matter === "moon-he3");
    case "lumen":
      return planets.some((p) => p.kind === "star");
    case "hush":
      return planets.length >= 2;
    default:
      return false;
  }
}

function mergeRecipe(base: Recipe, extra: Recipe | undefined): Recipe {
  if (!extra) return base;
  return { ...base, ...extra };
}

export function stepRecipe(leg: Leg, step: number, length: number): Recipe {
  const last = lastLegStep(length);
  const keyed = leg.steps?.[step];
  const tail = step === last ? leg.steps?.[-1] : undefined;
  let recipe = mergeRecipe({ ...leg.base }, keyed?.recipe);
  recipe = mergeRecipe(recipe, tail?.recipe);
  recipe = mergeRecipe(recipe, keyed?.guarantee);
  recipe = mergeRecipe(recipe, tail?.guarantee);
  if (keyed?.bridge || tail?.bridge) recipe = mergeRecipe(recipe, dryRecipe(leg.fuel ?? "ch4"));
  return recipe;
}

const JUMP_DV = WARP_JUMP_SPEED - WARP_BRAKE_SPEED;

function fullTank(fuel: FuelKind, engine: EngineKind, tank: TankKind) {
  const ship = {
    fuel: 0,
    fuelCapacity: 0,
    fuelKind: fuel,
    dryMass: 0,
    mass: 0,
    engineIsp: 1,
    engineThrust: 1,
    engineKind: engine,
    tankKind: tank,
  };
  applyLoadout(ship);
  ship.fuel = ship.fuelCapacity;
  syncFuelMass(ship);
  return ship;
}

/** Full-tank rocket Δv divided by one jump (brake speed up to jump speed). */
export function jumpsPerTank(fuel: FuelKind, engine: EngineKind, tank: TankKind): number {
  return shipDeltaV(fullTank(fuel, engine, tank)) / JUMP_DV;
}

export function fullTankDeltaV(fuel: FuelKind, engine: EngineKind, tank: TankKind): number {
  return shipDeltaV(fullTank(fuel, engine, tank));
}

export function headingOpen(
  requires: string | undefined,
  id: string,
  state: Pick<CampaignState, "flags" | "modules" | "revealed">,
): boolean {
  if (!requires) return true;
  if (state.revealed.includes(id)) return true;
  if (state.flags.includes(requires)) return true;
  return state.modules.some((grant) => moduleId(grant) === requires);
}

function moduleId(grant: Grant): string | null {
  return "module" in grant ? grant.module : null;
}

type HeadingTarget = { place?: string; leg?: string };

function openPlace(id: string, state: CampaignState): HeadingTarget | null {
  const place = storyPlaceById(id);
  if (place && !headingOpen(place.headingRequires, place.id, state)) return null;
  return { place: id };
}

function headingForChart(campaign: CampaignState, aside: boolean): HeadingTarget | null {
  if (aside && campaign.leg) return { leg: campaign.leg.id };
  if (aside && campaign.place) return openPlace(campaign.place, campaign);
  if (campaign.leg && !campaign.place) {
    const leg = legById(campaign.leg.id);
    if (!leg) return null;
    const length = resolvedLength(leg, campaign.leg.length);
    if (campaign.leg.step >= lastLegStep(length)) return openPlace(leg.to, campaign);
    return { leg: leg.id };
  }
  if (campaign.place) {
    const leg = legFrom(campaign.place);
    if (!leg) return null;
    if (lastLegStep(Math.max(leg.length[0], leg.length[1])) < 0) return openPlace(leg.to, campaign);
    return { leg: leg.id };
  }
  return null;
}

function sameTarget(current: NearbyHeading["target"], next: HeadingTarget): boolean {
  return current?.place === next.place && current?.leg === next.leg;
}

/** Mark one rolled heading. Random charts never call this, so their headings stay untouched. */
export function stampCampaignHeadings(
  nearby: NearbyHeading[],
  campaign: CampaignState,
  aside: boolean,
): void {
  const target = headingForChart(campaign, aside);
  if (!target) return;
  if (nearby.some((heading) => sameTarget(heading.target, target))) return;
  const slot = nearby.find((heading) => heading.target == null);
  if (!slot) return;
  slot.target = { ...target };
  const label = target.place ?? target.leg;
  if (label) slot.name = label;
}

function chartPlace(campaign: CampaignState, placeId: string, seed: number) {
  const place = storyPlaceById(placeId);
  if (!place || !headingOpen(place.headingRequires, place.id, campaign)) {
    createSystem(seed);
    const onRoute = campaign.leg != null || campaign.place != null;
    return { aside: onRoute, placeId: null as string | null };
  }
  chartStoryPlace(place, false);
  campaign.place = place.id;
  campaign.leg = null;
  return { aside: false, placeId: place.id };
}

function chartLegHeading(campaign: CampaignState, legId: string, aside: boolean, seed: number) {
  const leg = legById(legId);
  if (!leg) {
    createSystem(seed);
    return { aside: false, placeId: null as string | null };
  }
  const current = campaign.leg;
  if (current && current.id === leg.id && aside) {
    const length = resolvedLength(leg, current.length);
    createSystem(current.seed, {}, null, null, stepRecipe(leg, current.step, length));
    campaign.place = null;
    return { aside: false, placeId: null };
  }
  if (current && current.id === leg.id) {
    const length = resolvedLength(leg, current.length);
    const next = current.step + 1;
    if (next > lastLegStep(length)) return chartPlace(campaign, leg.to, seed);
    createSystem(seed, {}, null, null, stepRecipe(leg, next, length));
    campaign.place = null;
    campaign.leg = { id: leg.id, step: next, seed: getSystem().seed, length };
    return { aside: false, placeId: null };
  }
  const length = pickLength(leg, seed);
  if (lastLegStep(length) < 0) return chartPlace(campaign, leg.to, seed);
  createSystem(seed, {}, null, null, stepRecipe(leg, 0, length));
  campaign.place = null;
  campaign.leg = { id: leg.id, step: 0, seed: getSystem().seed, length };
  return { aside: false, placeId: null };
}

/**
 * Chart the system a campaign warp lands on.
 * A heading with no target is a detour: the leg step and its seed stay put.
 */
export function chartCampaignWarp(
  campaign: CampaignState,
  heading: NearbyHeading | null,
  aside: boolean,
  seed: number,
  pal: [string, string, string] | null = null,
  starName: string | null = null,
): { aside: boolean; placeId: string | null } {
  if (heading?.target?.place) return chartPlace(campaign, heading.target.place, seed);
  if (heading?.target?.leg) return chartLegHeading(campaign, heading.target.leg, aside, seed);
  createSystem(seed, {}, pal, starName);
  const onRoute = campaign.leg != null || campaign.place != null;
  return { aside: onRoute, placeId: null };
}
