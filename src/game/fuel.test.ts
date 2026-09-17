import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLoadout,
  armedEngine,
  burnFuel,
  cycleDrive,
  cycleEngine,
  cycleFuelKind,
  cycleTank,
  DRIVE_CELLS,
  driveCell,
  engineForce,
  engineGrade,
  fillGrade,
  fuelGrade,
  fuelMass,
  beginPadRefill,
  PAD_REFILL_RATE,
  pumpPadRefill,
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
  createSystem,
  FUEL_BURN_MAIN,
  FUEL_MAIN_SECONDS,
  RETRO_FORCE,
  SHIP_FUEL_CAPACITY,
  SHIP_MASS,
  STEP,
  THRUST_FORCE,
} from "./world.ts";
import { createSim, shipIsRefueling, shipIsRepairing, stepSim } from "./sim.ts";
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

test("the pad pumps CH4 at 3 L/s and clamps at the tank", () => {
  const s = ship(10);
  pumpPadRefill(s, 1);
  assert.ok(Math.abs(s.fuel - (10 + PAD_REFILL_RATE)) < 1e-9);
  pumpPadRefill(s, 100);
  assert.equal(s.fuel, s.fuelCapacity);
  assert.equal(PAD_REFILL_RATE, 3);
});

test("the pad dumps other grades and loads methane from empty", () => {
  const s = ship(80, "he3");
  beginPadRefill(s);
  assert.equal(s.fuelKind, "ch4");
  assert.equal(s.fuel, 0);
  pumpPadRefill(s, 2);
  assert.ok(Math.abs(s.fuel - 2 * PAD_REFILL_RATE) < 1e-9);
  const ch4 = ship(40);
  beginPadRefill(ch4);
  assert.equal(ch4.fuel, 40);
});

test("shipIsRefueling is only a methane pad below capacity", () => {
  createSystem(1);
  const sim = createSim();
  sim.phase = "landed";
  sim.padZoomLock = false;
  assert.ok(sim.landedId);
  sim.ship.fuel = 10;
  assert.equal(shipIsRefueling(sim), true);
  sim.ship.fuel = sim.ship.fuelCapacity;
  assert.equal(shipIsRefueling(sim), false);
  sim.ship.fuel = 10;
  sim.ship.fuelKind = "he3";
  assert.equal(shipIsRefueling(sim), false);
  sim.ship.fuelKind = "ch4";
  sim.phase = "flight";
  assert.equal(shipIsRefueling(sim), false);
});

test("dry belt rocks are not refueling", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const rock = sim.planets.find((p) => p.kind === "asteroid" && p.landable);
  assert.ok(rock);
  rock!.kicker = "Rock";
  rock!.settlement = "unexplored";
  rock!.civ = null;
  sim.phase = "landed";
  sim.padZoomLock = false;
  sim.landedId = rock!.id;
  sim.ship.fuel = 10;
  assert.equal(shipIsRefueling(sim), false);
  rock!.kicker = "Camp";
  rock!.settlement = "active";
  rock!.civ = "human";
  assert.equal(shipIsRefueling(sim), true);
});

test("a landing pumps CH4 over time instead of topping off", () => {
  createSystem(1);
  const sim = createSim();
  sim.phase = "landed";
  sim.padZoomLock = false;
  sim.ship.fuel = 10;
  beginPadRefill(sim.ship);
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  assert.ok(Math.abs(sim.ship.fuel - (10 + PAD_REFILL_RATE)) < 1e-6);
  assert.ok(sim.ship.fuel < sim.ship.fuelCapacity);
});

test("abandoned non-Home pads stay dry while hull repairs; Home still pumps", () => {
  createSystem(1, { settlement: "abandoned" });
  const sim = createSim();
  const rocky = sim.planets.find((p) => p.kind === "rocky" && p.kicker !== "Home" && p.landable);
  assert.ok(rocky);
  assert.equal(rocky!.settlement, "abandoned");
  sim.phase = "landed";
  sim.padZoomLock = false;
  sim.landedId = rocky!.id;
  sim.ship.fuel = 10;
  sim.ship.hull = 40;
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  assert.equal(sim.ship.fuel, 10);
  assert.ok(sim.ship.hull > 40);
  assert.equal(shipIsRefueling(sim), false);
  assert.equal(shipIsRepairing(sim), true);

  const home = sim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  assert.equal(home!.settlement, "active");
  sim.landedId = home!.id;
  sim.ship.fuel = 10;
  beginPadRefill(sim.ship);
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  assert.ok(Math.abs(sim.ship.fuel - (10 + PAD_REFILL_RATE)) < 1e-6);
  assert.equal(shipIsRefueling(sim), true);
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

test("the combustible matrix has 12 legal cells and no CH4×Thermal", () => {
  assert.equal(DRIVE_CELLS.length, 12);
  assert.ok(driveCell("ch4", "v1"));
  assert.ok(driveCell("ch4", "v2"));
  assert.equal(driveCell("ch4", "thermal"), null);
  assert.ok(driveCell("h2", "thermal"));
  assert.ok(driveCell("ntr", "thermal"));
  assert.equal(driveCell("ntr", "v1"), null);
  assert.ok(driveCell("d", "torch"));
  assert.ok(driveCell("he3", "torch"));
  assert.ok(driveCell("lumen", "lumen"));
  assert.ok(driveCell("hush", "coil"));
  assert.equal(driveCell("hush", "v1"), null);
  assert.ok(!driveCell("ch4", "v1")!.tanks.includes("cryo"));
  assert.ok(driveCell("h2", "v1")!.tanks.includes("cryo"));
  assert.deepEqual(driveCell("lumen", "lumen")!.tanks, ["hold", "cistern"]);
});

test("E walks engines on a fuel then the next fuel's least engine", () => {
  const s = ship();
  cycleDrive(s, 1);
  assert.equal(s.fuelKind, "ch4");
  assert.equal(s.engineKind, "v2");
  cycleDrive(s, 1);
  assert.equal(s.fuelKind, "nh3");
  assert.equal(s.engineKind, "v1");
  assert.equal(s.fuel, s.fuelCapacity);
  for (let i = 0; i < DRIVE_CELLS.length - 3; i++) cycleDrive(s, 1);
  assert.equal(s.fuelKind, "hush");
  assert.equal(s.engineKind, "coil");
  cycleDrive(s, 1);
  assert.equal(s.fuelKind, "ch4");
  assert.equal(s.engineKind, "v1");
  cycleDrive(s, -1);
  assert.equal(s.fuelKind, "hush");
  assert.equal(s.engineKind, "coil");
});

test("E snaps an illegal tank; T skips tanks the cell forbids", () => {
  const s = ship();
  s.tankKind = "cistern";
  applyLoadout(s);
  cycleDrive(s, 1);
  cycleDrive(s, 1);
  assert.equal(s.fuelKind, "nh3");
  assert.equal(s.tankKind, "hold");
  assert.equal(s.fuelCapacity, tankGrade("hold").volume);
  const nh3 = ship();
  nh3.fuelKind = "nh3";
  nh3.engineKind = "v1";
  nh3.tankKind = "fuel";
  applyLoadout(nh3);
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    cycleTank(nh3, 1);
    seen.add(nh3.tankKind);
  }
  assert.deepEqual([...seen].sort(), ["cryo", "fuel", "hold", "long"]);
});

test("the pad dumps a torch onto CH4 and a methane-legal engine", () => {
  const s = ship(80, "he3");
  s.engineKind = "torch";
  s.tankKind = "cryo";
  applyLoadout(s);
  beginPadRefill(s);
  assert.equal(s.fuelKind, "ch4");
  assert.equal(s.fuel, 0);
  assert.equal(s.engineKind, "v1");
  assert.equal(s.tankKind, "long");
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
