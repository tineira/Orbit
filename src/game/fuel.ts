import type { EngineKind, FuelKind, Ship, TankKind } from "./types.ts";
import { CH4_FULL_MASS, FUEL_BURN_MAIN, RETRO_FORCE, SHIP_FUEL_CAPACITY, THRUST_FORCE } from "./world.ts";

export const DEFAULT_FUEL_KIND: FuelKind = "ch4";
export const DEFAULT_ENGINE_KIND: EngineKind = "v1";
export const DEFAULT_TANK_KIND: TankKind = "fuel";
export const DEFAULT_ENGINE_ISP = 1;
export const DEFAULT_ENGINE_THRUST = 1;
/** Hull only. Dry mass is hull + engine + tank. Starter loadout still sums to SHIP_MASS (1). */
export const HULL_MASS = 0.75;

export type FuelDrain = "thrust" | "field";

export type FuelGrade = {
  kind: FuelKind;
  hud: string;
  name: string;
  /** Specific impulse vs CH4. Higher → less mass (and volume) per unit thrust. */
  isp: number;
  /** Main/retro force vs CH4. Higher → can brake a deeper well. */
  thrust: number;
  /** Mass per volume vs CH4. Lower → the same tank holds less mass (H2 is bulky). */
  density: number;
  drain: FuelDrain;
};

export const FUEL_GRADES: Record<FuelKind, FuelGrade> = {
  ch4: { kind: "ch4", hud: "CH4", name: "Methane", isp: 1, thrust: 1, density: 1, drain: "thrust" },
  nh3: { kind: "nh3", hud: "NH3", name: "Ammonia", isp: 1.3, thrust: 1, density: 0.73, drain: "thrust" },
  h2: { kind: "h2", hud: "H2", name: "Hydrogen", isp: 1.8, thrust: 0.9, density: 0.14, drain: "thrust" },
  ntr: { kind: "ntr", hud: "NTR", name: "Nuclear thermal", isp: 4, thrust: 0.75, density: 0.14, drain: "thrust" },
  d: { kind: "d", hud: "D", name: "Deuterium", isp: 8, thrust: 1.2, density: 0.9, drain: "thrust" },
  he3: { kind: "he3", hud: "He3", name: "Helium-3", isp: 18, thrust: 1.6, density: 0.25, drain: "thrust" },
  lumen: { kind: "lumen", hud: "LUMEN", name: "Lumen", isp: 40, thrust: 2.2, density: 1.4, drain: "thrust" },
  hush: { kind: "hush", hud: "HUSH", name: "Hush", isp: 200, thrust: 3, density: 0.02, drain: "field" },
};

export type EngineGrade = {
  kind: EngineKind;
  hud: string;
  name: string;
  isp: number;
  thrust: number;
  dryMass: number;
};

export const ENGINES: Record<EngineKind, EngineGrade> = {
  v1: { kind: "v1", hud: "V1", name: "Chemical", isp: 1, thrust: 1, dryMass: 0.15 },
  v2: { kind: "v2", hud: "V2", name: "Chemical II", isp: 1.2, thrust: 1.15, dryMass: 0.16 },
  thermal: { kind: "thermal", hud: "Thermal", name: "Nuclear thermal", isp: 2, thrust: 0.8, dryMass: 0.22 },
  torch: { kind: "torch", hud: "Torch", name: "Fusion torch", isp: 2.2, thrust: 1.5, dryMass: 0.28 },
  lumen: { kind: "lumen", hud: "Lumen", name: "Lumen drive", isp: 3, thrust: 2, dryMass: 0.32 },
  coil: { kind: "coil", hud: "Coil", name: "Hush coil", isp: 1, thrust: 2.2, dryMass: 0.12 },
};

export type TankGrade = {
  kind: TankKind;
  hud: string;
  volume: number;
  dryMass: number;
};

export const TANKS: Record<TankKind, TankGrade> = {
  fuel: { kind: "fuel", hud: "Fuel Tank", volume: 100, dryMass: 0.1 },
  long: { kind: "long", hud: "Long Tank", volume: 160, dryMass: 0.15 },
  cryo: { kind: "cryo", hud: "Cryo Tank", volume: 200, dryMass: 0.22 },
  hold: { kind: "hold", hud: "Hold", volume: 320, dryMass: 0.28 },
  cistern: { kind: "cistern", hud: "Cistern", volume: 500, dryMass: 0.42 },
};

export const FUEL_KIND_ORDER = Object.keys(FUEL_GRADES) as FuelKind[];
export const ENGINE_ORDER = Object.keys(ENGINES) as EngineKind[];
export const TANK_ORDER = Object.keys(TANKS) as TankKind[];

/** Combustible matrix: fuel × engine, with the tanks that cell allows. Walk order is E. */
export type DriveCell = {
  fuel: FuelKind;
  engine: EngineKind;
  tanks: readonly TankKind[];
};

const CHEM_TANKS = ["fuel", "long", "hold", "cistern"] as const;
const NH3_TANKS = ["fuel", "long", "cryo", "hold"] as const;
const CRYO_TANKS = ["cryo", "hold", "cistern"] as const;
const FIELD_TANKS = ["hold", "cistern"] as const;

export const DRIVE_CELLS: readonly DriveCell[] = [
  { fuel: "ch4", engine: "v1", tanks: CHEM_TANKS },
  { fuel: "ch4", engine: "v2", tanks: CHEM_TANKS },
  { fuel: "nh3", engine: "v1", tanks: NH3_TANKS },
  { fuel: "nh3", engine: "v2", tanks: NH3_TANKS },
  { fuel: "h2", engine: "v1", tanks: CRYO_TANKS },
  { fuel: "h2", engine: "v2", tanks: CRYO_TANKS },
  { fuel: "h2", engine: "thermal", tanks: CRYO_TANKS },
  { fuel: "ntr", engine: "thermal", tanks: CRYO_TANKS },
  { fuel: "d", engine: "torch", tanks: CRYO_TANKS },
  { fuel: "he3", engine: "torch", tanks: CRYO_TANKS },
  { fuel: "lumen", engine: "lumen", tanks: FIELD_TANKS },
  { fuel: "hush", engine: "coil", tanks: FIELD_TANKS },
];

/** Ignore deep-space gravity noise. HUSH only sips inside a real well. */
export const HUSH_WELL_FLOOR = 0.05;
/** Volume per second per unit of |g| above the floor. */
export const HUSH_WELL_BURN = 0.007;

type Fueled = Pick<
  Ship,
  | "fuel"
  | "fuelCapacity"
  | "fuelKind"
  | "dryMass"
  | "mass"
  | "engineIsp"
  | "engineThrust"
  | "engineKind"
  | "tankKind"
>;

export function fuelGrade(kind: FuelKind): FuelGrade {
  return FUEL_GRADES[kind] ?? FUEL_GRADES.ch4;
}

export function engineGrade(kind: EngineKind): EngineGrade {
  return ENGINES[kind] ?? ENGINES.v1;
}

export function tankGrade(kind: TankKind): TankGrade {
  return TANKS[kind] ?? TANKS.fuel;
}

function wrapItem<T>(list: readonly T[], current: T, dir: number): T {
  const i = list.indexOf(current);
  const n = list.length;
  const at = i < 0 ? 0 : i;
  return list[(at + dir + n * 8) % n]!;
}

export function driveCell(fuel: FuelKind, engine: EngineKind): DriveCell | null {
  return DRIVE_CELLS.find((c) => c.fuel === fuel && c.engine === engine) ?? null;
}

function snapTank(current: TankKind, allowed: readonly TankKind[]): TankKind {
  if (allowed.includes(current)) return current;
  const vol = tankGrade(current).volume;
  let best = allowed[0]!;
  let bestD = Infinity;
  for (const k of allowed) {
    const d = Math.abs(tankGrade(k).volume - vol);
    if (d < bestD || (d === bestD && tankGrade(k).volume < tankGrade(best).volume)) {
      best = k;
      bestD = d;
    }
  }
  return best;
}

/** Force a legal fuel × engine × tank. Does not refill. */
export function legalizeLoadout(ship: Fueled) {
  let cell = driveCell(ship.fuelKind, ship.engineKind);
  if (!cell) {
    cell = DRIVE_CELLS.find((c) => c.fuel === ship.fuelKind) ?? DRIVE_CELLS[0]!;
    ship.fuelKind = cell.fuel;
    ship.engineKind = cell.engine;
  }
  ship.tankKind = snapTank(ship.tankKind, cell.tanks);
  applyLoadout(ship);
}

export function applyLoadout(ship: Fueled) {
  const engine = engineGrade(ship.engineKind);
  const tank = tankGrade(ship.tankKind);
  ship.engineIsp = engine.isp;
  ship.engineThrust = engine.thrust;
  ship.fuelCapacity = tank.volume;
  if (ship.fuel > tank.volume) ship.fuel = tank.volume;
  ship.dryMass = HULL_MASS + engine.dryMass + tank.dryMass;
  syncFuelMass(ship);
}

export function cycleFuelKind(ship: Fueled, dir: number) {
  fillGrade(ship, wrapItem(FUEL_KIND_ORDER, ship.fuelKind, dir));
}

export function cycleEngine(ship: Fueled, dir: number) {
  ship.engineKind = wrapItem(ENGINE_ORDER, ship.engineKind, dir);
  applyLoadout(ship);
}

export function cycleTank(ship: Fueled, dir: number) {
  const cell = driveCell(ship.fuelKind, ship.engineKind);
  if (!cell) {
    legalizeLoadout(ship);
    return cycleTank(ship, dir);
  }
  ship.tankKind = wrapItem(cell.tanks, ship.tankKind, dir);
  applyLoadout(ship);
}

/** E: next legal fuel×engine. Same fuel keeps volume; a new grade fills. Tank snaps if illegal. */
export function cycleDrive(ship: Fueled, dir: number) {
  const i = DRIVE_CELLS.findIndex((c) => c.fuel === ship.fuelKind && c.engine === ship.engineKind);
  const n = DRIVE_CELLS.length;
  const at = i < 0 ? 0 : i;
  const next = DRIVE_CELLS[(at + dir + n * 8) % n]!;
  const sameFuel = next.fuel === ship.fuelKind;
  ship.engineKind = next.engine;
  if (sameFuel) {
    ship.tankKind = snapTank(ship.tankKind, next.tanks);
    applyLoadout(ship);
    return;
  }
  ship.tankKind = snapTank(ship.tankKind, next.tanks);
  fillGrade(ship, next.fuel);
  applyLoadout(ship);
}

export function effectiveIsp(ship: Pick<Ship, "fuelKind" | "engineIsp">) {
  return fuelGrade(ship.fuelKind).isp * ship.engineIsp;
}

export function effectiveThrust(ship: Pick<Ship, "fuelKind" | "engineThrust">) {
  return fuelGrade(ship.fuelKind).thrust * ship.engineThrust;
}

export function engineForce(ship: Pick<Ship, "fuelKind" | "engineThrust">, which: "main" | "retro") {
  const base = which === "main" ? THRUST_FORCE : RETRO_FORCE;
  return base * effectiveThrust(ship);
}

export function fuelMass(ship: Pick<Ship, "fuel" | "fuelKind">) {
  return ship.fuel * fuelGrade(ship.fuelKind).density * (CH4_FULL_MASS / SHIP_FUEL_CAPACITY);
}

export function syncFuelMass(ship: Pick<Ship, "fuel" | "fuelKind" | "dryMass" | "mass">) {
  ship.mass = ship.dryMass + fuelMass(ship);
}

/** Pad pump, litres per second. A starter CH4 tank takes ~33 s to top off. */
export const PAD_REFILL_RATE = 3;

export function refillFuel(ship: Fueled) {
  ship.fuel = ship.fuelCapacity;
  syncFuelMass(ship);
}

export function fillGrade(ship: Fueled, kind: FuelKind) {
  ship.fuelKind = kind;
  ship.fuel = ship.fuelCapacity;
  syncFuelMass(ship);
}

/** Snap to this engine if the current fuel cell allows it. Does not refill. */
export function installEngine(ship: Fueled, engine: EngineKind) {
  const cell = driveCell(ship.fuelKind, engine);
  if (!cell) return false;
  ship.engineKind = engine;
  ship.tankKind = snapTank(ship.tankKind, cell.tanks);
  applyLoadout(ship);
  return true;
}

/** Pads load methane. Other grades dump; leftover CH4 keeps pumping from here. */
export function beginPadRefill(ship: Fueled) {
  if (ship.fuelKind !== DEFAULT_FUEL_KIND) {
    ship.fuelKind = DEFAULT_FUEL_KIND;
    ship.fuel = 0;
  }
  const cell = driveCell(ship.fuelKind, ship.engineKind);
  if (!cell) ship.engineKind = DEFAULT_ENGINE_KIND;
  const tanks = (cell ?? driveCell(DEFAULT_FUEL_KIND, ship.engineKind) ?? DRIVE_CELLS[0]!).tanks;
  ship.tankKind = snapTank(ship.tankKind, tanks);
  applyLoadout(ship);
}

export function pumpPadRefill(ship: Fueled, dt: number) {
  if (ship.fuelKind !== DEFAULT_FUEL_KIND) return;
  if (ship.fuel >= ship.fuelCapacity) return;
  ship.fuel = Math.min(ship.fuelCapacity, ship.fuel + PAD_REFILL_RATE * dt);
  syncFuelMass(ship);
}

export function armedEngine(
  ship: Pick<Ship, "fuel">,
  controls: { forward: boolean; reverse: boolean; aimThrust: boolean },
): "main" | "retro" | null {
  if (ship.fuel <= 0) return null;
  if (controls.forward || controls.aimThrust) return "main";
  if (controls.reverse) return "retro";
  return null;
}

export function burnFuel(ship: Fueled, dt: number, force: number) {
  const grade = fuelGrade(ship.fuelKind);
  const isp = Math.max(1e-6, grade.isp * ship.engineIsp);
  const density = Math.max(1e-6, grade.density);
  const volumeDot = FUEL_BURN_MAIN * (force / THRUST_FORCE) / (isp * density);
  ship.fuel = Math.max(0, ship.fuel - volumeDot * dt);
  syncFuelMass(ship);
}

/** HUSH only: drain volume while a gravity well is pulling. Other grades no-op. */
export function sipField(ship: Fueled, dt: number, wellAccel: number) {
  if (ship.fuelKind !== "hush" || ship.fuel <= 0) return;
  const g = Math.max(0, wellAccel - HUSH_WELL_FLOOR);
  if (g <= 0) return;
  ship.fuel = Math.max(0, ship.fuel - HUSH_WELL_BURN * g * dt);
  syncFuelMass(ship);
}
