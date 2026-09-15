import type { CrashKind, LostCopy } from "./types.ts";

/** 30-day months so the clock is a ship instrument, not a calendar. */
export const FOOD_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const FOOD_MONTHS_MIN = 8;
export const FOOD_MONTHS_MAX = 12;
export const AIRLOCK_DELAY_MS = 60_000;
export const FUEL_EMPTY = 1e-9;

export type FoodClock = {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type AdriftHost = {
  adrift: boolean;
  adriftStartedAt: number;
  foodUntil: number;
  phase: string;
  ship: { fuel: number; thrusting: boolean; reverse: boolean };
};

const AIRLOCK_COPY: LostCopy[] = [
  {
    kicker: "Air lock",
    title: "You opened it",
    body: "The latch was the last control that still answered. Vacuum does not negotiate.",
  },
  {
    kicker: "Hatch",
    title: "You chose the dark",
    body: "The cabin had months left. You did not wait for them.",
  },
  {
    kicker: "Equalize",
    title: "Pressure went first",
    body: "The lock opened on a sky with no ground. The air left. You followed.",
  },
];

const STARVE_COPY: LostCopy[] = [
  {
    kicker: "Stores empty",
    title: "The clock was honest",
    body: "The rations ended on the second they promised. The hull will outlast you. The dark will outlast the hull.",
  },
  {
    kicker: "Rations",
    title: "You waited",
    body: "There was no rescue on the other side of the count. There was only the last day, then none.",
  },
  {
    kicker: "Quiet",
    title: "Nothing left to wait for",
    body: "The years, the months, the days ran out. The ship kept going. You did not.",
  },
];

export function isCoastDeath(kind: CrashKind | null) {
  return kind === "lost" || kind === "airlock" || kind === "starve";
}

export function usesLostCard(kind: CrashKind | null) {
  return isCoastDeath(kind);
}

export function tankEmpty(fuel: number) {
  return fuel <= FUEL_EMPTY;
}

export function splitFoodClock(ms: number): FoodClock {
  let sec = Math.max(0, Math.floor(ms / 1000));
  const seconds = sec % 60;
  sec = Math.floor(sec / 60);
  const minutes = sec % 60;
  sec = Math.floor(sec / 60);
  const hours = sec % 24;
  sec = Math.floor(sec / 24);
  const days = sec % 30;
  sec = Math.floor(sec / 30);
  const months = sec % 12;
  const years = Math.floor(sec / 12);
  return { years, months, days, hours, minutes, seconds };
}

export function foodSpanMs(rng = Math.random) {
  const months = FOOD_MONTHS_MIN + rng() * (FOOD_MONTHS_MAX - FOOD_MONTHS_MIN);
  return months * FOOD_MONTH_MS;
}

export function beginAdrift(sim: AdriftHost, now = Date.now(), rng = Math.random) {
  if (sim.adrift) return;
  sim.adrift = true;
  sim.adriftStartedAt = now;
  sim.foodUntil = now + foodSpanMs(rng);
  sim.ship.thrusting = false;
  sim.ship.reverse = false;
}

export function endAdrift(sim: AdriftHost) {
  sim.adrift = false;
  sim.adriftStartedAt = 0;
  sim.foodUntil = 0;
}

export function maybeBeginAdrift(sim: AdriftHost, now = Date.now()) {
  if (sim.phase !== "flight") return;
  if (sim.adrift) return;
  if (!tankEmpty(sim.ship.fuel)) return;
  beginAdrift(sim, now);
}

export function adriftStarved(sim: AdriftHost, now = Date.now()) {
  return sim.adrift && sim.phase === "flight" && now >= sim.foodUntil;
}

export function canOpenAirLock(sim: AdriftHost, now = Date.now()) {
  return sim.adrift && sim.phase === "flight" && now - sim.adriftStartedAt >= AIRLOCK_DELAY_MS;
}

export function pickAirlockCopy(rng = Math.random): LostCopy {
  return AIRLOCK_COPY[Math.floor(rng() * AIRLOCK_COPY.length)]!;
}

export function pickStarveCopy(rng = Math.random): LostCopy {
  return STARVE_COPY[Math.floor(rng() * STARVE_COPY.length)]!;
}
