import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignShipFrom, newCampaign } from "./campaign.ts";
import { applyLoadout, sipField, syncFuelMass } from "./fuel.ts";
import { applyStoryBodies, PROBE_PLACE } from "./place.ts";
import {
  addGrade,
  chargeHush,
  coronaHullPerSec,
  H2_LEAK_RATE,
  leakH2,
  lumenLiters,
  NTR_REFINE_RATE,
  refineNtr,
  skimLiters,
  SKIM_PER_DENSITY,
  switchGrade,
} from "./refill.ts";
import { createSim, listLagrangePoints, stepSim } from "./sim.ts";
import type { EngineKind, FuelKind, TankKind } from "./types.ts";
import { createSystem, GAS_CLOUD_FACTOR, getPlanets, SHIP_FUEL_CAPACITY, SHIP_MASS } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function tank(fuel = 40, fuelKind: FuelKind = "ch4", engineKind: EngineKind = "v1", tankKind: TankKind = "fuel") {
  const ship = {
    fuel,
    fuelCapacity: SHIP_FUEL_CAPACITY,
    fuelKind,
    engineKind,
    tankKind,
    dryMass: SHIP_MASS,
    mass: SHIP_MASS,
    engineIsp: 1,
    engineThrust: 1,
    hull: 100,
  };
  applyLoadout(ship);
  ship.fuel = Math.min(fuel, ship.fuelCapacity);
  syncFuelMass(ship);
  return ship;
}

function fly(sim: ReturnType<typeof createSim>) {
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.takeoffIgnoreId = null;
  sim.gravityScale = 0;
  sim.flares = [];
  sim.flareWait = 1000;
}

function park(sim: ReturnType<typeof createSim>, body: { x: number; y: number; vx: number; vy: number; radius: number }, factor: number) {
  sim.ship.x = body.x + body.radius * factor;
  sim.ship.y = body.y;
  sim.ship.vx = body.vx;
  sim.ship.vy = body.vy;
}

function withTrap(sim: ReturnType<typeof createSim>) {
  sim.campaign = newCampaign({
    seed: 1,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
    modules: [{ module: "atmoTrap" }],
  });
}

test("skim rate scales with density and a new grade dumps the old one", () => {
  assert.equal(skimLiters(0), 0);
  assert.ok(skimLiters(0.48) > skimLiters(0.04));
  assert.equal(skimLiters(0.04), SKIM_PER_DENSITY * 0.04);
  const ship = tank(40);
  switchGrade(ship, "nh3");
  assert.equal(ship.fuelKind, "nh3");
  assert.equal(ship.fuel, 0);
  addGrade(ship, "nh3", 3);
  assert.equal(ship.fuel, 3);
});

test("without the trap a giant does not skim, and random charts are not LUMEN worlds", () => {
  createSystem(4);
  for (const body of getPlanets()) {
    assert.equal(body.lumenWorld, undefined);
    assert.equal(body.workshop, undefined);
  }
  const sim = createSim();
  const giant = sim.planets.find((p) => p.kind === "gas");
  assert.ok(giant);
  giant!.matter = "gas-ammonia";
  fly(sim);
  park(sim, giant!, (1 + GAS_CLOUD_FACTOR) / 2);
  const before = sim.ship.fuel;
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuelKind, "ch4");
  assert.equal(sim.ship.fuel, before);
});

test("the trap skims NH3 from the haze and H2 from deeper in", () => {
  createSystem(4);
  const sim = createSim();
  const giant = sim.planets.find((p) => p.kind === "gas");
  assert.ok(giant);
  giant!.matter = "gas-ammonia";
  fly(sim);
  withTrap(sim);
  sim.ship.tankKind = "cryo";
  applyLoadout(sim.ship);
  sim.ship.fuel = 0;
  syncFuelMass(sim.ship);

  park(sim, giant!, (GAS_CLOUD_FACTOR + 1.85) / 2);
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuelKind, "nh3");
  const haze = sim.ship.fuel;
  assert.ok(haze > 0);

  sim.ship.fuelKind = "ch4";
  sim.ship.fuel = 0;
  syncFuelMass(sim.ship);
  park(sim, giant!, (1 + GAS_CLOUD_FACTOR) / 2);
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuelKind, "h2");
  assert.ok(sim.ship.fuel > haze);
  const deep = sim.ship.fuel;
  park(sim, giant!, (GAS_CLOUD_FACTOR + 1.85) / 2);
  stepSim(sim, 1 / 30, idle);
  assert.equal(sim.ship.fuelKind, "h2");
  assert.equal(sim.ship.fuel, deep);

  giant!.matter = "gas-methane";
  sim.ship.fuelKind = "ch4";
  sim.ship.fuel = 10;
  syncFuelMass(sim.ship);
  park(sim, giant!, (GAS_CLOUD_FACTOR + 1.85) / 2);
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuelKind, "ch4");
  assert.equal(sim.ship.fuel, 10);
});

test("a skim does not dump a higher grade that still has liters", () => {
  const kept = tank(40, "ntr", "thermal", "cryo");
  addGrade(kept, "h2", 5);
  assert.equal(kept.fuelKind, "ntr");
  assert.equal(kept.fuel, 40);
  const empty = tank(0, "ntr", "thermal", "cryo");
  addGrade(empty, "nh3", 2);
  assert.equal(empty.fuelKind, "nh3");
  assert.equal(empty.fuel, 2);

  createSystem(4);
  const sim = createSim();
  const giant = sim.planets.find((p) => p.kind === "gas");
  assert.ok(giant);
  giant!.matter = "gas-ammonia";
  fly(sim);
  withTrap(sim);
  for (const load of [
    { fuelKind: "ntr" as const, engineKind: "thermal" as const, tankKind: "cryo" as const },
    { fuelKind: "lumen" as const, engineKind: "lumen" as const, tankKind: "hold" as const },
    { fuelKind: "hush" as const, engineKind: "coil" as const, tankKind: "hold" as const },
  ]) {
    sim.ship.fuelKind = load.fuelKind;
    sim.ship.engineKind = load.engineKind;
    sim.ship.tankKind = load.tankKind;
    applyLoadout(sim.ship);
    sim.ship.fuel = 40;
    syncFuelMass(sim.ship);
    park(sim, giant!, (1 + GAS_CLOUD_FACTOR) / 2);
    stepSim(sim, 0.5, idle);
    assert.equal(sim.ship.fuelKind, load.fuelKind);
    assert.equal(sim.ship.fuel, 40);
  }
});

test("H2 leaks from a Fuel tank and stays in Cryo", () => {
  const loose = tank(20, "h2", "v2", "fuel");
  leakH2(loose, 1);
  assert.ok(Math.abs(loose.fuel - (20 - H2_LEAK_RATE)) < 1e-9);
  const tight = tank(20, "h2", "v2", "cryo");
  leakH2(tight, 2);
  assert.equal(tight.fuel, 20);
  for (const kind of ["hold", "cistern"] as const) {
    const held = tank(20, "h2", "v2", kind);
    leakH2(held, 1);
    assert.equal(held.fuel, 20, kind);
  }

  createSystem(4);
  const sim = createSim();
  fly(sim);
  sim.ship.fuelKind = "h2";
  sim.ship.engineKind = "v2";
  sim.ship.tankKind = "long";
  applyLoadout(sim.ship);
  sim.ship.fuel = 30;
  syncFuelMass(sim.ship);
  sim.ship.x = 1e8;
  sim.ship.y = 1e8;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  stepSim(sim, 1, idle);
  assert.ok(Math.abs(sim.ship.fuel - (30 - H2_LEAK_RATE)) < 1e-6);
});

test("an abandoned moon of a giant installs Thermal and Cryo when the tank holds H2", () => {
  createSystem(4);
  const sim = createSim();
  const moon = sim.planets.find((p) => p.kind === "moon" && sim.planets.some((g) => g.id === p.parentId && g.kind === "gas"));
  assert.ok(moon);
  moon!.settlement = "abandoned";
  moon!.landable = true;
  fly(sim);
  sim.ship.fuelKind = "h2";
  sim.ship.engineKind = "v2";
  sim.ship.tankKind = "cryo";
  applyLoadout(sim.ship);
  sim.ship.fuel = 12;
  syncFuelMass(sim.ship);
  sim.ship.x = moon!.x;
  sim.ship.y = moon!.y;
  sim.ship.vx = moon!.vx;
  sim.ship.vy = moon!.vy;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.ship.engineKind, "thermal");
  assert.equal(sim.ship.tankKind, "cryo");
  assert.equal(sim.ship.fuelKind, "h2");

  createSystem(4);
  const plain = createSim();
  const other = plain.planets.find((p) => p.kind === "moon");
  assert.ok(other);
  other!.settlement = "active";
  other!.landable = true;
  fly(plain);
  plain.ship.fuelKind = "h2";
  plain.ship.engineKind = "v2";
  plain.ship.tankKind = "cryo";
  applyLoadout(plain.ship);
  plain.ship.fuel = 12;
  syncFuelMass(plain.ship);
  plain.ship.x = other!.x;
  plain.ship.y = other!.y;
  plain.ship.vx = other!.vx;
  plain.ship.vy = other!.vy;
  stepSim(plain, 0, idle);
  assert.equal(plain.ship.engineKind, "v2");
});

test("a Workshop refines H2 into NTR at a fixed rate", () => {
  const ship = tank(10, "h2", "v2", "cryo");
  const hold = { ntrHold: 0 };
  refineNtr(ship, 1, hold, true);
  assert.equal(ship.fuelKind, "h2");
  assert.ok(Math.abs(ship.fuel - (10 - NTR_REFINE_RATE)) < 1e-9);
  assert.equal(hold.ntrHold, NTR_REFINE_RATE);
  refineNtr(ship, 1, hold, true);
  assert.equal(ship.fuelKind, "ntr");
  assert.equal(ship.engineKind, "thermal");
  assert.ok(Math.abs(ship.fuel - 10) < 1e-6);

  const idleShip = tank(10, "ch4");
  refineNtr(idleShip, 2, { ntrHold: 0 }, true);
  assert.equal(idleShip.fuelKind, "ch4");
  assert.equal(idleShip.fuel, 10);

  createSystem(4);
  const sim = createSim();
  const shop = sim.planets.find((p) => p.kind === "rocky" && p.kicker !== "Home");
  assert.ok(shop);
  shop!.kicker = "Workshop";
  shop!.settlement = "abandoned";
  shop!.landable = true;
  fly(sim);
  sim.phase = "landed";
  sim.landedId = shop!.id;
  sim.ship.fuelKind = "h2";
  sim.ship.engineKind = "v2";
  sim.ship.tankKind = "cryo";
  applyLoadout(sim.ship);
  sim.ship.fuel = 10;
  syncFuelMass(sim.ship);
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuelKind, "h2");
  assert.ok(Math.abs(sim.ship.fuel - 5) < 1e-6);
  assert.equal(sim.ntrHold, 5);

  const parked = tank(4, "h2", "v2", "cryo");
  const away = { ntrHold: 3 };
  parked.fuel = 0;
  syncFuelMass(parked);
  refineNtr(parked, 1, away, false);
  assert.equal(parked.fuelKind, "h2");
  assert.equal(away.ntrHold, 3);
  refineNtr(parked, 1, away, true);
  assert.equal(parked.fuelKind, "ntr");
  assert.equal(parked.engineKind, "thermal");
  assert.equal(away.ntrHold, 0);

  createSystem(4);
  const plain = createSim();
  const rock = plain.planets.find((p) => p.kind === "rocky" && p.kicker !== "Workshop");
  assert.ok(rock);
  fly(plain);
  plain.phase = "landed";
  plain.landedId = rock!.id;
  plain.ntrHold = 4;
  plain.ship.fuelKind = "h2";
  plain.ship.engineKind = "v2";
  plain.ship.tankKind = "cryo";
  applyLoadout(plain.ship);
  plain.ship.fuel = 0;
  syncFuelMass(plain.ship);
  stepSim(plain, 0.5, idle);
  assert.equal(plain.ship.fuelKind, "h2");
  assert.equal(plain.ntrHold, 4);

  createSystem(4);
  const host = getPlanets().find((p) => p.kind === "rocky" && p.kicker !== "Workshop");
  assert.ok(host);
  const marked = {
    ...PROBE_PLACE,
    start: undefined,
    bodies: [{ ref: "shop", match: { kind: "rocky" as const, kicker: host!.kicker }, workshop: true }],
  };
  assert.deepEqual(applyStoryBodies(getPlanets(), marked), []);
  assert.equal(host!.workshop, true);
  const flagged = createSim();
  const shopBody = flagged.planets.find((p) => p.id === host!.id);
  assert.equal(shopBody?.workshop, true);
  assert.notEqual(shopBody?.kicker, "Workshop");
  fly(flagged);
  flagged.phase = "landed";
  flagged.landedId = shopBody!.id;
  flagged.ship.fuelKind = "h2";
  flagged.ship.engineKind = "v2";
  flagged.ship.tankKind = "cryo";
  applyLoadout(flagged.ship);
  flagged.ship.fuel = 10;
  syncFuelMass(flagged.ship);
  stepSim(flagged, 1, idle);
  assert.equal(flagged.ship.fuelKind, "h2");
  assert.ok(Math.abs(flagged.ship.fuel - 5) < 1e-6);
  assert.equal(flagged.ntrHold, 5);
});

test("the LUMEN world grants the drive, and a corona graze refills and heats", () => {
  createSystem(PROBE_PLACE.seed, {}, null, null, PROBE_PLACE.recipe);
  const place = {
    ...PROBE_PLACE,
    bodies: [
      ...PROBE_PLACE.bodies,
      { ref: "home", match: { kind: "rocky" as const, kicker: "Home" }, lumen: true },
    ],
  };
  assert.deepEqual(applyStoryBodies(getPlanets(), place), []);
  const marked = getPlanets().find((p) => p.kicker === "Home");
  assert.equal(marked?.lumenWorld, true);

  createSystem(4);
  const sim = createSim();
  const home = sim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  home!.lumenWorld = true;
  fly(sim);
  sim.gravityScale = 1;
  sim.ship.x = home!.x;
  sim.ship.y = home!.y;
  sim.ship.vx = home!.vx;
  sim.ship.vy = home!.vy;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.ship.engineKind, "lumen");
  assert.equal(sim.ship.fuelKind, "lumen");

  assert.ok(lumenLiters(0.02) > lumenLiters(0.005));
  assert.ok(coronaHullPerSec(0.02) > coronaHullPerSec(0.005));

  createSystem(4);
  const graze = createSim();
  const star = graze.planets.find((p) => p.kind === "star");
  assert.ok(star);
  fly(graze);
  graze.ship.fuelKind = "lumen";
  graze.ship.engineKind = "lumen";
  graze.ship.tankKind = "hold";
  applyLoadout(graze.ship);
  graze.ship.fuel = 5;
  graze.ship.hull = 80;
  syncFuelMass(graze.ship);
  park(graze, star!, 1.5);
  stepSim(graze, 0.5, idle);
  assert.ok(graze.ship.fuel > 5);
  assert.ok(graze.ship.hull < 80);

  createSystem(4);
  const cold = createSim();
  const coldStar = cold.planets.find((p) => p.kind === "star");
  assert.ok(coldStar);
  fly(cold);
  cold.ship.hull = 80;
  cold.ship.fuel = 40;
  park(cold, coldStar!, 1.5);
  stepSim(cold, 0.5, idle);
  assert.equal(cold.ship.fuelKind, "ch4");
  assert.equal(cold.ship.fuel, 40);
  assert.equal(cold.ship.hull, 80);
});

test("holding Lagrange charges HUSH and a well still sips", () => {
  const ship = tank(10, "hush", "coil", "hold");
  chargeHush(ship, 1);
  assert.ok(ship.fuel > 10);
  const sipped = tank(10, "hush", "coil", "hold");
  sipField(sipped, 1, 1);
  assert.ok(sipped.fuel < 10);

  createSystem(4);
  const sim = createSim();
  fly(sim);
  sim.gravityScale = 1;
  const point = listLagrangePoints(sim).find((pt) => pt.kind === "L4");
  assert.ok(point);
  sim.ship.fuelKind = "hush";
  sim.ship.engineKind = "coil";
  sim.ship.tankKind = "hold";
  applyLoadout(sim.ship);
  sim.ship.fuel = 10;
  syncFuelMass(sim.ship);
  sim.lagrangeLockKey = point!.key;
  sim.ship.x = point!.x;
  sim.ship.y = point!.y;
  sim.ship.vx = point!.vx;
  sim.ship.vy = point!.vy;
  stepSim(sim, 1 / 30, idle);
  assert.equal(sim.lagrangeLockKey, point!.key);
  assert.ok(sim.ship.fuel > 10);
});
