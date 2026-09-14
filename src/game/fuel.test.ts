import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLoadout,
  armedEngine,
  burnFuel,
  cycleEngine,
  cycleFuelKind,
  cycleTank,
  engineForce,
  engineGrade,
  fillGrade,
  fuelGrade,
  fuelMass,
  refillFuel,
  sipField,
  tankGrade,
  DEFAULT_ENGINE_KIND,
  DEFAULT_ENGINE_ISP,
  DEFAULT_ENGINE_THRUST,
  DEFAULT_FUEL_KIND,
  DEFAULT_TANK_KIND,
  ENGINE_ORDER,
  FUEL_GRADES,
  FUEL_KIND_ORDER,
  HULL_MASS,
  HUSH_WELL_FLOOR,
  TANK_ORDER,
} from "./fuel.ts";
import {
  CH4_FULL_MASS,
  FUEL_BURN_MAIN,
  FUEL_MAIN_SECONDS,
  RETRO_FORCE,
  SHIP_FUEL_CAPACITY,
  SHIP_MASS,
  STEP,
  THRUST_FORCE,
} from "./world.ts";
import type { FuelKind } from "./types.ts";

const ship = (fuel = SHIP_FUEL_CAPACITY, fuelKind: FuelKind = DEFAULT_FUEL_KIND) => {
  const s = {
    fuel,
    fuelCapacity: SHIP_FUEL_CAPACITY,
    fuelKind,
    engineKind: DEFAULT_ENGINE_KIND,
    tankKind: DEFAULT_TANK_KIND,
    dryMass: SHIP_MASS,
    mass: SHIP_MASS,
    engineIsp: DEFAULT_ENGINE_ISP,
    engineThrust: DEFAULT_ENGINE_THRUST,
  };
  applyLoadout(s);
  s.fuel = Math.min(fuel, s.fuelCapacity);
  applyLoadout(s);
  return s;
};
const idle = { forward: false, reverse: false, aimThrust: false };

test("coasting and yaw have no engine intent", () => {
  assert.equal(armedEngine(ship(), idle), null);
});

test("main and aim-thrust arm the main engine; reverse arms retro", () => {
  assert.equal(armedEngine(ship(), { ...idle, forward: true }), "main");
  assert.equal(armedEngine(ship(), { ...idle, aimThrust: true }), "main");
  assert.equal(armedEngine(ship(), { ...idle, reverse: true }), "retro");
  assert.equal(armedEngine(ship(), { forward: true, reverse: true, aimThrust: false }), "main");
});

test("empty tank never arms an engine", () => {
  const dry = ship(0);
  assert.equal(armedEngine(dry, { ...idle, forward: true }), null);
  assert.equal(armedEngine(dry, { ...idle, reverse: true }), null);
  assert.equal(armedEngine(dry, { ...idle, aimThrust: true }), null);
});

test("starter loadout is V1 + Fuel Tank 100 L and dry mass 1", () => {
  const s = ship();
  assert.equal(s.engineKind, "v1");
  assert.equal(engineGrade(s.engineKind).hud, "V1");
  assert.equal(s.tankKind, "fuel");
  assert.equal(tankGrade(s.tankKind).hud, "Fuel Tank");
  assert.equal(s.fuelCapacity, 100);
  assert.ok(Math.abs(s.dryMass - SHIP_MASS) < 1e-9);
  assert.ok(Math.abs(HULL_MASS + 0.15 + 0.1 - SHIP_MASS) < 1e-9);
});

test("CH4 drains a starting tank in FUEL_MAIN_SECONDS", () => {
  const s = ship();
  const force = engineForce(s, "main");
  burnFuel(s, 1, force);
  assert.ok(Math.abs(s.fuel - (SHIP_FUEL_CAPACITY - FUEL_BURN_MAIN)) < 1e-9);
  const full = ship();
  burnFuel(full, FUEL_MAIN_SECONDS, engineForce(full, "main"));
  assert.equal(full.fuel, 0);
});

test("volume burn follows thrust / (isp × density)", () => {
  for (const kind of Object.keys(FUEL_GRADES) as FuelKind[]) {
    const grade = fuelGrade(kind);
    const s = ship(SHIP_FUEL_CAPACITY, kind);
    burnFuel(s, FUEL_MAIN_SECONDS, engineForce(s, "main"));
    const usedFrac = grade.thrust / (grade.isp * grade.density);
    const expected = Math.max(0, SHIP_FUEL_CAPACITY * (1 - usedFrac));
    assert.ok(
      Math.abs(s.fuel - expected) < 1e-6,
      `${kind} left ${s.fuel}, expected ${expected}`,
    );
  }
});

test("retro drains by thrust ratio", () => {
  const main = ship();
  const retro = ship();
  burnFuel(main, STEP, engineForce(main, "main"));
  burnFuel(retro, STEP, engineForce(retro, "retro"));
  const ratio = (SHIP_FUEL_CAPACITY - retro.fuel) / (SHIP_FUEL_CAPACITY - main.fuel);
  assert.ok(Math.abs(ratio - RETRO_FORCE / THRUST_FORCE) < 1e-9);
});

test("burn clamps at empty", () => {
  const s = ship(0.0001);
  burnFuel(s, 1, engineForce(s, "main"));
  assert.equal(s.fuel, 0);
});

test("landing refill restores current tank volume", () => {
  const s = ship(18);
  s.tankKind = "cryo";
  applyLoadout(s);
  s.fuel = 18;
  applyLoadout(s);
  refillFuel(s);
  assert.equal(s.fuel, 200);
  assert.equal(s.fuelKind, "ch4");
});

test("fillGrade swaps the kind and tops the tank", () => {
  const s = ship(10, "he3");
  fillGrade(s, "ch4");
  assert.equal(s.fuelKind, "ch4");
  assert.equal(s.fuel, 100);
});

test("a bigger tank holds more volume at the same burn", () => {
  const small = ship();
  const big = ship();
  big.tankKind = "cryo";
  applyLoadout(big);
  big.fuel = big.fuelCapacity;
  applyLoadout(big);
  burnFuel(small, FUEL_MAIN_SECONDS, engineForce(small, "main"));
  burnFuel(big, FUEL_MAIN_SECONDS, engineForce(big, "main"));
  assert.equal(small.fuel, 0);
  assert.ok(Math.abs(big.fuel - 100) < 1e-6);
});

test("wet mass tracks fuel volume and density", () => {
  const full = ship();
  assert.ok(Math.abs(full.mass - (SHIP_MASS + CH4_FULL_MASS)) < 1e-9);
  assert.ok(Math.abs(fuelMass(full) - CH4_FULL_MASS) < 1e-9);
  const empty = ship(0);
  assert.ok(Math.abs(empty.mass - SHIP_MASS) < 1e-9);
  const hydro = ship(SHIP_FUEL_CAPACITY, "h2");
  assert.ok(fuelMass(hydro) < fuelMass(full));
  assert.ok(hydro.mass < full.mass);
});

test("engine Isp upgrade drains the tank slower", () => {
  const stock = ship();
  const tuned = ship();
  tuned.engineIsp = 2;
  burnFuel(stock, 1, engineForce(stock, "main"));
  burnFuel(tuned, 1, engineForce(tuned, "main"));
  const stockUsed = SHIP_FUEL_CAPACITY - stock.fuel;
  const tunedUsed = SHIP_FUEL_CAPACITY - tuned.fuel;
  assert.ok(Math.abs(tunedUsed * 2 - stockUsed) < 1e-9);
});

test("HUSH does not sip in deep space and does sip in a well", () => {
  const deep = ship(100, "hush");
  sipField(deep, 1, 0);
  sipField(deep, 1, HUSH_WELL_FLOOR);
  assert.equal(deep.fuel, 100);
  const well = ship(100, "hush");
  sipField(well, 1, 15);
  assert.ok(well.fuel < 100);
  const methane = ship(100, "ch4");
  sipField(methane, 1, 15);
  assert.equal(methane.fuel, 100);
});

test("dev cycles wrap fuel, engine, and tank", () => {
  const s = ship();
  cycleFuelKind(s, 1);
  assert.equal(s.fuelKind, FUEL_KIND_ORDER[1]);
  cycleFuelKind(s, -1);
  assert.equal(s.fuelKind, "ch4");
  cycleEngine(s, 1);
  assert.equal(s.engineKind, ENGINE_ORDER[1]);
  assert.equal(s.engineIsp, engineGrade("v2").isp);
  cycleEngine(s, -1);
  assert.equal(s.engineKind, "v1");
  cycleTank(s, 1);
  assert.equal(s.tankKind, TANK_ORDER[1]);
  assert.equal(s.fuelCapacity, tankGrade("long").volume);
  cycleTank(s, -1);
  assert.equal(s.tankKind, "fuel");
  assert.equal(s.fuelCapacity, 100);
});

test("HUD labels and names", () => {
  assert.equal(fuelGrade("ch4").hud, "CH4");
  assert.equal(fuelGrade("ch4").name, "Methane");
  assert.equal(fuelGrade("he3").hud, "He3");
  assert.equal(fuelGrade("lumen").hud, "LUMEN");
  assert.equal(fuelGrade("hush").hud, "HUSH");
});
