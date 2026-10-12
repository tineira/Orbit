import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignShipFrom, newCampaign } from "./campaign.ts";
import {
  applyLoadout,
  beginCampaignPadRefill,
  beginPadRefill,
  grant,
  PAD_CELL_HINT,
  syncFuelMass,
} from "./fuel.ts";
import { headingOpen, stampCampaignHeadings } from "./leg.ts";
import { applyBodyGrant, PROBE_END } from "./place.ts";
import { createSim, shipIsRefueling, stepSim } from "./sim.ts";
import type { EngineKind, FuelKind, NearbyHeading, TankKind } from "./types.ts";
import { createSystem, getSystem, SHIP_FUEL_CAPACITY, SHIP_MASS } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function starter(fuel = 40) {
  const ship: {
    fuel: number;
    fuelCapacity: number;
    fuelKind: FuelKind;
    engineKind: EngineKind;
    tankKind: TankKind;
    dryMass: number;
    mass: number;
    engineIsp: number;
    engineThrust: number;
    hull: number;
  } = {
    fuel,
    fuelCapacity: SHIP_FUEL_CAPACITY,
    fuelKind: "ch4",
    engineKind: "v1",
    tankKind: "fuel",
    dryMass: SHIP_MASS,
    mass: SHIP_MASS,
    engineIsp: 1,
    engineThrust: 1,
    hull: 100,
  };
  applyLoadout(ship);
  ship.fuel = fuel;
  syncFuelMass(ship);
  return ship;
}

function campaignFor(sim: ReturnType<typeof createSim>) {
  return newCampaign({
    seed: getSystem().seed,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
  });
}

function heading(): NearbyHeading {
  return {
    angle: 1,
    color: "#fff",
    pal: ["#fff", "#ddd", "#bbb"],
    name: "Kindle",
    kind: "star",
  };
}

test("an engine grant keeps that engine and the fuel that fits", () => {
  const v2 = starter();
  assert.equal(grant(v2, { engine: "v2" }), true);
  assert.equal(v2.engineKind, "v2");
  assert.equal(v2.fuelKind, "ch4");
  assert.equal(v2.tankKind, "fuel");
  assert.equal(v2.fuel, 40);

  const thermal = starter();
  assert.equal(grant(thermal, { engine: "thermal" }), true);
  assert.equal(thermal.engineKind, "thermal");
  assert.equal(thermal.fuelKind, "h2");
  assert.equal(thermal.tankKind, "cryo");
  assert.equal(thermal.fuel, 40);

  const torch = starter();
  assert.equal(grant(torch, { engine: "torch" }), true);
  assert.equal(torch.engineKind, "torch");
  assert.equal(torch.fuelKind, "d");
  assert.equal(torch.tankKind, "cryo");

  const lumen = starter();
  assert.equal(grant(lumen, { engine: "lumen" }), true);
  assert.equal(lumen.engineKind, "lumen");
  assert.equal(lumen.fuelKind, "lumen");
  assert.equal(lumen.tankKind, "hold");

  const coil = starter();
  assert.equal(grant(coil, { engine: "coil" }), true);
  assert.equal(coil.engineKind, "coil");
  assert.equal(coil.fuelKind, "hush");
  assert.equal(coil.tankKind, "hold");
  assert.equal(coil.fuel, 40);
});

test("a tank grant keeps that tank and clamps the fuel to it", () => {
  const longer = starter();
  assert.equal(grant(longer, { tank: "long" }), true);
  assert.equal(longer.tankKind, "long");
  assert.equal(longer.fuelKind, "ch4");
  assert.equal(longer.engineKind, "v1");
  assert.equal(longer.fuel, 40);

  const held = starter();
  held.tankKind = "long";
  applyLoadout(held);
  held.fuel = 150;
  syncFuelMass(held);
  assert.equal(grant(held, { tank: "fuel" }), true);
  assert.equal(held.tankKind, "fuel");
  assert.equal(held.fuel, 100);
  assert.equal(held.engineKind, "v1");

  const cryo = starter();
  assert.equal(grant(cryo, { tank: "cryo" }), true);
  assert.equal(cryo.tankKind, "cryo");
  assert.equal(cryo.engineKind, "v1");
  assert.equal(cryo.fuelKind, "nh3");
  assert.equal(cryo.fuel, 40);

  const wide = starter();
  assert.equal(grant(wide, { tank: "hold" }), true);
  assert.equal(wide.tankKind, "hold");
  assert.equal(wide.fuelKind, "ch4");
  const cistern = starter();
  assert.equal(grant(cistern, { tank: "cistern" }), true);
  assert.equal(cistern.tankKind, "cistern");
  assert.equal(cistern.fuelKind, "ch4");
});

test("each module is stored once", () => {
  createSystem(1);
  const sim = createSim();
  const ship = sim.ship;
  const state = newCampaign({ seed: 1, landedId: null, ship: campaignShipFrom(ship) });
  applyBodyGrant(ship, { module: "transceiver" }, state);
  applyBodyGrant(ship, { module: "transceiver" }, state);
  applyBodyGrant(ship, { module: "atmoTrap" }, state);
  applyBodyGrant(ship, { module: "hushDetector" }, state);
  applyBodyGrant(ship, { module: "hushDetector" }, state);
  assert.deepEqual(
    state.modules.map((item) => ("module" in item ? item.module : "")),
    ["transceiver", "atmoTrap", "hushDetector"],
  );
  assert.equal(ship.engineKind, "v1");
});

test("transceiver opens a heading that asks for it", () => {
  const previous = PROBE_END.headingRequires;
  PROBE_END.headingRequires = "transceiver";
  try {
    createSystem(1);
    const sim = createSim();
    const ship = sim.ship;
    const state = newCampaign({
      seed: 1,
      landedId: null,
      ship: campaignShipFrom(ship),
      place: "probe-end",
    });
    const nearby = [heading()];
    assert.equal(headingOpen("transceiver", "probe-end", state), false);
    stampCampaignHeadings(nearby, state, true);
    assert.equal(nearby[0]!.target?.place, undefined);

    applyBodyGrant(ship, { module: "atmoTrap" }, state);
    assert.equal(headingOpen("transceiver", "probe-end", state), false);
    applyBodyGrant(ship, { module: "transceiver" }, state);
    assert.equal(headingOpen("transceiver", "probe-end", state), true);
    stampCampaignHeadings(nearby, state, true);
    assert.equal(nearby[0]!.target?.place, "probe-end");
    assert.equal(nearby[0]!.name, "probe-end");
  } finally {
    PROBE_END.headingRequires = previous;
  }
});

test("a campaign pad keeps the engine and tank, and warns when the cell is illegal", () => {
  const legal = starter(20);
  legal.engineKind = "v2";
  legal.tankKind = "long";
  legal.fuelKind = "nh3";
  applyLoadout(legal);
  legal.fuel = 20;
  syncFuelMass(legal);
  assert.equal(beginCampaignPadRefill(legal), true);
  assert.equal(legal.fuelKind, "ch4");
  assert.equal(legal.fuel, 0);
  assert.equal(legal.engineKind, "v2");
  assert.equal(legal.tankKind, "long");

  const illegal = starter();
  illegal.fuelKind = "h2";
  illegal.engineKind = "thermal";
  illegal.tankKind = "cryo";
  illegal.fuel = 40;
  applyLoadout(illegal);
  illegal.fuel = 40;
  syncFuelMass(illegal);
  assert.equal(beginCampaignPadRefill(illegal), false);
  assert.equal(illegal.engineKind, "thermal");
  assert.equal(illegal.tankKind, "cryo");
  assert.equal(illegal.fuelKind, "h2");
  assert.equal(illegal.fuel, 40);

  const dumped = starter(80);
  dumped.fuelKind = "he3";
  dumped.engineKind = "torch";
  dumped.tankKind = "cryo";
  applyLoadout(dumped);
  beginPadRefill(dumped);
  assert.equal(dumped.fuelKind, "ch4");
  assert.equal(dumped.engineKind, "v1");
  assert.equal(dumped.tankKind, "long");
});

test("landing in campaign does not downgrade a granted engine", () => {
  createSystem(1, { camp: true });
  const sim = createSim();
  const camp = sim.planets.find((p) => p.unlocksEngine === "v2");
  assert.ok(camp);
  sim.ship.fuelKind = "h2";
  sim.ship.engineKind = "thermal";
  sim.ship.tankKind = "cryo";
  sim.ship.fuel = 40;
  applyLoadout(sim.ship);
  sim.ship.fuel = 40;
  syncFuelMass(sim.ship);
  sim.campaign = campaignFor(sim);
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.takeoffIgnoreId = null;
  sim.ship.x = camp!.x;
  sim.ship.y = camp!.y;
  sim.ship.vx = camp!.vx;
  sim.ship.vy = camp!.vy;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.ship.engineKind, "thermal");
  assert.equal(sim.ship.tankKind, "cryo");
  assert.equal(sim.ship.fuelKind, "h2");
  assert.equal(sim.ship.fuel, 40);
  assert.equal(sim.orbitHint, PAD_CELL_HINT);
  stepSim(sim, 1, idle);
  assert.equal(sim.ship.fuel, 40);
  assert.equal(shipIsRefueling(sim), false);

  createSystem(1);
  const homeSim = createSim();
  const home = homeSim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  homeSim.ship.fuelKind = "nh3";
  homeSim.ship.engineKind = "v2";
  homeSim.ship.tankKind = "long";
  homeSim.ship.fuel = 50;
  applyLoadout(homeSim.ship);
  homeSim.ship.fuel = 50;
  syncFuelMass(homeSim.ship);
  homeSim.campaign = campaignFor(homeSim);
  homeSim.phase = "flight";
  homeSim.padZoomLock = false;
  homeSim.landedId = null;
  homeSim.takeoffIgnoreId = null;
  homeSim.ship.x = home!.x;
  homeSim.ship.y = home!.y;
  homeSim.ship.vx = home!.vx;
  homeSim.ship.vy = home!.vy;
  stepSim(homeSim, 0, idle);
  assert.equal(homeSim.phase, "landed");
  assert.equal(homeSim.ship.engineKind, "v2");
  assert.equal(homeSim.ship.tankKind, "long");
  assert.equal(homeSim.ship.fuelKind, "ch4");
  assert.equal(homeSim.ship.fuel, 0);
  stepSim(homeSim, 1, idle);
  assert.ok(homeSim.ship.fuel > 2);
  assert.equal(homeSim.ship.engineKind, "v2");
  assert.equal(shipIsRefueling(homeSim), true);
});
