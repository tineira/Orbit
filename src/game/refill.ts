import type { CampaignModule, Grant } from "./campaign.ts";
import { grant, legalizeLoadout, syncFuelMass } from "./fuel.ts";
import type { FuelKind, TankKind } from "./types.ts";

/**
 * Liters per second at atmosphere density 1. Real haze is ~0.04, deep cloud ~0.48.
 * The rate is not locked; it scales with the same density the drag uses.
 */
export const SKIM_PER_DENSITY = 25;
/** H2 left in a Fuel or Long tank. Cryo, Hold, and Cistern hold it. */
export const H2_LEAK_RATE = 1.5;
/** Workshop turns H2 into NTR at this many liters per second. */
export const NTR_REFINE_RATE = 5;
/** Corona liters per second at star-corona density 1. */
export const LUMEN_PER_DENSITY = 150;
/** Hull points per second at star-corona density 1. Deeper is hotter. */
export const CORONA_HULL_PER_DENSITY = 400;
/** Lagrange hold, liters per second. `sipField` still drains in a well. */
export const HUSH_CHARGE_RATE = 2;

const TIGHT_H2_TANKS = new Set<TankKind>(["cryo", "hold", "cistern"]);

/** Low to high. A skim may replace a lower grade. It never dumps a higher one that still has liters. */
const GRADE_RANK: Record<FuelKind, number> = {
  ch4: 0,
  nh3: 1,
  h2: 2,
  ntr: 3,
  d: 4,
  he3: 5,
  lumen: 6,
  hush: 7,
};

type Fueled = {
  fuel: number;
  fuelCapacity: number;
  fuelKind: FuelKind;
  engineKind: "v1" | "v2" | "thermal" | "torch" | "lumen" | "coil";
  tankKind: TankKind;
  dryMass: number;
  mass: number;
  engineIsp: number;
  engineThrust: number;
};

export function campaignHasModule(modules: Grant[] | undefined, id: CampaignModule): boolean {
  return !!modules?.some((item) => "module" in item && item.module === id);
}

/** One tank, one grade. A new grade dumps whatever was aboard. */
export function switchGrade(ship: Fueled, kind: FuelKind) {
  if (ship.fuelKind === kind) return;
  ship.fuelKind = kind;
  ship.fuel = 0;
  syncFuelMass(ship);
}

export function addGrade(ship: Fueled, kind: FuelKind, liters: number) {
  if (liters <= 0) return;
  if (ship.fuelKind !== kind) {
    if (ship.fuel > 1e-9 && GRADE_RANK[ship.fuelKind] > GRADE_RANK[kind]) return;
    switchGrade(ship, kind);
  }
  ship.fuel = Math.min(ship.fuelCapacity, ship.fuel + liters);
  syncFuelMass(ship);
}

export function skimLiters(density: number): number {
  return SKIM_PER_DENSITY * Math.max(0, density);
}

export function lumenLiters(density: number): number {
  return LUMEN_PER_DENSITY * Math.max(0, density);
}

export function coronaHullPerSec(density: number): number {
  return CORONA_HULL_PER_DENSITY * Math.max(0, density);
}

/** H2 in a tank that is not Cryo, Hold, or Cistern. */
export function leakH2(ship: Fueled, dt: number) {
  if (ship.fuelKind !== "h2" || dt <= 0) return;
  if (TIGHT_H2_TANKS.has(ship.tankKind)) return;
  ship.fuel = Math.max(0, ship.fuel - H2_LEAK_RATE * dt);
  syncFuelMass(ship);
}

export function chargeHush(ship: Fueled, dt: number) {
  if (ship.fuelKind !== "hush" || dt <= 0) return;
  ship.fuel = Math.min(ship.fuelCapacity, ship.fuel + HUSH_CHARGE_RATE * dt);
  syncFuelMass(ship);
}

function finishNtr(ship: Fueled, hold: { ntrHold: number }) {
  const kept = hold.ntrHold;
  hold.ntrHold = 0;
  ship.fuelKind = "ntr";
  ship.engineKind = "thermal";
  ship.fuel = kept;
  legalizeLoadout(ship);
}

/** Convert H2 already in the tank. `hold.ntrHold` keeps the liters refined so far. */
export function refineNtr(ship: Fueled, dt: number, hold: { ntrHold: number }, active: boolean) {
  if (ship.fuelKind !== "h2" || !active) return;
  if (ship.fuel <= 1e-9 && hold.ntrHold > 0) {
    finishNtr(ship, hold);
    return;
  }
  if (ship.fuel <= 0 || dt <= 0) return;
  const step = Math.min(ship.fuel, NTR_REFINE_RATE * dt);
  ship.fuel -= step;
  hold.ntrHold += step;
  syncFuelMass(ship);
  if (ship.fuel <= 1e-9) finishNtr(ship, hold);
}

/** Abandoned moon of a giant, with hydrogen aboard. */
export function deliverMoonOutpost(ship: Fueled) {
  grant(ship, { engine: "thermal" });
  grant(ship, { tank: "cryo" });
}

/** Story LUMEN world. Random charts never set the flag. */
export function deliverLumen(ship: Fueled) {
  grant(ship, { engine: "lumen" });
}
