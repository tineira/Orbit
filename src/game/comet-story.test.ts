import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignShipFrom, newCampaign, type CampaignState } from "./campaign.ts";
import { COMET_NUCLEUS_R, cometRequireMet } from "./comet.ts";
import {
  COMET_ARRIVE_S,
  COMET_HOLD_S,
  COMET_REENTRY_DIST,
  COMET_SCENE_EDGE,
  NUCLEUS_R,
  surfacePoint,
  surfaceVelocity,
} from "./comet-scene.ts";
import { applyLoadout, syncFuelMass } from "./fuel.ts";
import { PROBE_END, PROBE_PLACE } from "./place.ts";
import { deliverHush } from "./refill.ts";
import { createSim, enterCometScene, stepSim, takeoff, type Sim } from "./sim.ts";
import { runTriggers, type Trigger } from "./triggers.ts";
import type { EngineKind, FuelKind, TankKind } from "./types.ts";
import { createSystem, getMinimapWorldR, getSystem, SHIP_FUEL_CAPACITY, SHIP_HULL, SHIP_MASS, STEP } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function boot(seed = 1) {
  createSystem(seed);
  const sim = createSim();
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = 28000;
  sim.ship.y = 28000;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  return sim;
}

function attach(sim: Sim, place = "probe") {
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: null,
    place,
    ship: campaignShipFrom(sim.ship),
  });
  sim.campaignPlaceId = place;
}

function flyby(sim: Sim) {
  const R = getMinimapWorldR();
  sim.comet = { x: R - 5, y: 0, vx: 5000, vy: 0, radius: COMET_NUCLEUS_R, mass: 1 };
  sim.cometEntered = true;
  sim.cometSpent = true;
  stepSim(sim, STEP, idle);
}

function withProbe(run: () => void) {
  const saved = {
    cometRequires: PROBE_PLACE.cometRequires,
    cometCiv: PROBE_PLACE.cometCiv,
    cometRef: PROBE_PLACE.cometRef,
    triggers: PROBE_PLACE.triggers,
  };
  try {
    run();
  } finally {
    PROBE_PLACE.cometRequires = saved.cometRequires;
    PROBE_PLACE.cometCiv = saved.cometCiv;
    PROBE_PLACE.cometRef = saved.cometRef;
    PROBE_PLACE.triggers = saved.triggers;
  }
}

function quiet(sim: Sim) {
  const scene = sim.cometScene!;
  scene.jets = [];
  scene.rocks = [];
  scene.gas = [];
  scene.bursts = [];
  scene.p.burstEvery = 1e9;
  scene.burstClock = 1e9;
  scene.p.fallRate = 0;
}

function drop(sim: Sim) {
  const scene = sim.cometScene!;
  quiet(sim);
  const pt = surfacePoint(scene, 0.4, SHIP_HULL + 0.4);
  const g = surfaceVelocity(pt.x, pt.y);
  sim.ship.x = pt.x;
  sim.ship.y = pt.y;
  sim.ship.vx = g.x - Math.cos(pt.w) * 4;
  sim.ship.vy = g.y - Math.sin(pt.w) * 4;
  sim.phase = "flight";
  for (let i = 0; i < 40 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
}

function openMarked(sim: Sim, card: NonNullable<Sim["cometMark"]>) {
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  sim.warpTarget = {
    angle: 0,
    color: "#e24b3a",
    pal: ["#e24b3a", "#e24b3a", "#e24b3a"],
    name: "Comet",
    kind: "comet",
    comet: card,
  };
  enterCometScene(sim);
  quiet(sim);
}

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
  };
  applyLoadout(ship);
  ship.fuel = fuel;
  syncFuelMass(ship);
  return ship;
}

function marks(place = "probe"): CampaignState {
  return newCampaign({
    seed: 1,
    landedId: null,
    place,
    ship: { fuelKind: "ch4", engineKind: "v1", tankKind: "fuel", fuel: 40, hull: 100 },
  });
}

test("free flight still leaves a comet heading, with no story card", () => {
  const sim = boot(11);
  flyby(sim);
  assert.equal(sim.comet, null);
  assert.equal(sim.cometHeading?.kind, "comet");
  assert.equal(sim.cometHeading?.name, "Comet");
  assert.equal(sim.cometHeading?.comet, undefined);
});

test("a campaign chart with no comet ask leaves no heading", () => {
  withProbe(() => {
    const sim = boot(1);
    attach(sim);
    flyby(sim);
    assert.equal(sim.comet, null);
    assert.equal(sim.cometHeading, null);
  });
});

test("a leg step has no place, so the flyby leaves no heading", () => {
  const sim = boot(1);
  attach(sim, "probe");
  sim.campaign!.place = null;
  flyby(sim);
  assert.equal(sim.cometHeading, null);
});

test("cometRequires gates the leftover heading", () => {
  withProbe(() => {
    PROBE_PLACE.cometRequires = { fuel: "lumen" };
    const dry = boot(1);
    attach(dry);
    dry.ship.fuelKind = "lumen";
    dry.ship.fuel = 0;
    flyby(dry);
    assert.equal(dry.cometHeading, null, "empty LUMEN is not LUMEN in the tank");

    const other = boot(1);
    attach(other);
    other.ship.fuelKind = "ch4";
    other.ship.fuel = 40;
    flyby(other);
    assert.equal(other.cometHeading, null);

    const lit = boot(1);
    attach(lit);
    lit.ship.fuelKind = "lumen";
    lit.ship.fuel = 1;
    flyby(lit);
    assert.equal(lit.cometHeading?.kind, "comet");
    assert.deepEqual(lit.cometHeading?.comet?.requires, { fuel: "lumen" });
  });
});

test("a module or a flag is the ask when the card says so", () => {
  withProbe(() => {
    PROBE_PLACE.cometRequires = { module: "hushDetector" };
    const bare = boot(1);
    attach(bare);
    flyby(bare);
    assert.equal(bare.cometHeading, null);

    const armed = boot(1);
    attach(armed);
    armed.campaign!.modules.push({ module: "hushDetector" });
    flyby(armed);
    assert.equal(armed.cometHeading?.kind, "comet");

    PROBE_PLACE.cometRequires = "hasV2";
    const unmarked = boot(1);
    attach(unmarked);
    flyby(unmarked);
    assert.equal(unmarked.cometHeading, null);

    const marked = boot(1);
    attach(marked);
    marked.campaign!.flags.push("hasV2");
    flyby(marked);
    assert.deepEqual(marked.cometHeading?.comet?.requires, "hasV2");
  });
});

test("the comet actor can carry the ask when the chart is not the card", () => {
  withProbe(() => {
    PROBE_PLACE.cometRequires = { fuel: "ch4" };
    const sim = boot(4);
    attach(sim);
    assert.notEqual(getSystem().seed, PROBE_PLACE.seed);
    sim.ship.fuelKind = "lumen";
    sim.ship.fuel = 5;
    const R = getMinimapWorldR();
    sim.comet = {
      x: R - 5,
      y: 0,
      vx: 5000,
      vy: 0,
      radius: COMET_NUCLEUS_R,
      mass: 1,
      card: { requires: { fuel: "lumen" }, civ: true, ref: "g" },
    };
    sim.cometEntered = true;
    stepSim(sim, STEP, idle);
    assert.equal(sim.cometHeading?.comet?.civ, true);
    assert.equal(sim.cometHeading?.comet?.ref, "g");
    assert.deepEqual(sim.cometHeading?.comet?.requires, { fuel: "lumen" });

    const unmet = boot(4);
    attach(unmet);
    unmet.ship.fuelKind = "ch4";
    unmet.ship.fuel = 40;
    unmet.comet = {
      x: getMinimapWorldR() - 5,
      y: 0,
      vx: 5000,
      vy: 0,
      radius: COMET_NUCLEUS_R,
      mass: 1,
      card: { requires: { fuel: "lumen" } },
    };
    unmet.cometEntered = true;
    stepSim(unmet, STEP, idle);
    assert.equal(unmet.comet, null);
    assert.equal(unmet.cometHeading, null);
  });
});

test("a card with civ copies civ and the landedFor ref onto the heading", () => {
  withProbe(() => {
    PROBE_PLACE.cometCiv = true;
    PROBE_PLACE.cometRef = "e-comet";
    const sim = boot(1);
    attach(sim);
    flyby(sim);
    assert.equal(sim.cometHeading?.comet?.civ, true);
    assert.equal(sim.cometHeading?.comet?.ref, "e-comet");
    assert.equal(sim.cometHeading?.comet?.requires, undefined);

    PROBE_PLACE.cometCiv = undefined;
    PROBE_PLACE.cometRef = undefined;
    PROBE_PLACE.triggers = [
      ...PROBE_PLACE.triggers,
      { on: "landedFor", ref: "comet", seconds: 120, effects: [{ revealHeading: "probe-end" }] },
    ];
    const fromTrigger = boot(1);
    attach(fromTrigger);
    flyby(fromTrigger);
    assert.equal(fromTrigger.cometHeading?.comet?.civ, undefined);
    assert.equal(fromTrigger.cometHeading?.comet?.ref, "comet");
    assert.equal(fromTrigger.cometHeading?.comet?.requires, undefined);
  });
});

test("engine and tank asks read the ship, and a flag reads the campaign", () => {
  const ship = starter();
  const campaign = marks();
  assert.equal(cometRequireMet(ship, campaign, { engine: "v1" }), true);
  assert.equal(cometRequireMet(ship, campaign, { engine: "coil" }), false);
  assert.equal(cometRequireMet(ship, campaign, { tank: "fuel" }), true);
  assert.equal(cometRequireMet(ship, campaign, { tank: "hold" }), false);
  assert.equal(cometRequireMet(ship, campaign, "hasV2"), false);
  campaign.flags.push("hasV2");
  assert.equal(cometRequireMet(ship, campaign, "hasV2"), true);
});

test("deliverHush grants HUSH, Coil, and Hold without refilling", () => {
  const ship = starter(40);
  deliverHush(ship);
  assert.equal(ship.fuelKind, "hush");
  assert.equal(ship.engineKind, "coil");
  assert.equal(ship.tankKind, "hold");
  assert.equal(ship.fuel, 40);
  assert.equal(ship.fuelCapacity, 320);
  deliverHush(ship);
  assert.equal(ship.fuel, 40);
});

test("landing on a civ comet grants HUSH only with hushDetector", () => {
  const sim = boot(1);
  attach(sim);
  sim.ship.fuel = 40;
  openMarked(sim, { civ: true, ref: "comet" });
  assert.equal(sim.warpTarget, null);
  assert.equal(sim.cometMark?.civ, true);
  drop(sim);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.ship.fuelKind, "ch4", "civ without the module does not grant");

  const armed = boot(1);
  attach(armed);
  armed.campaign!.modules.push({ module: "hushDetector" });
  armed.ship.fuel = 40;
  openMarked(armed, { civ: true, ref: "comet" });
  drop(armed);
  assert.equal(armed.phase, "landed");
  assert.equal(armed.ship.fuelKind, "hush");
  assert.equal(armed.ship.engineKind, "coil");
  assert.equal(armed.ship.tankKind, "hold");
  assert.equal(armed.ship.fuel, 40);

  const plain = boot(1);
  attach(plain);
  plain.campaign!.modules.push({ module: "hushDetector" });
  plain.ship.fuel = 40;
  openMarked(plain, { ref: "comet" });
  drop(plain);
  assert.equal(plain.ship.fuelKind, "ch4", "the module without civ does not grant");
});

test("civ and ref ride out on the parked comet and come back on re-entry", () => {
  const sim = boot(1);
  attach(sim);
  sim.campaign!.modules.push({ module: "hushDetector" });
  openMarked(sim, { civ: true, ref: "comet" });
  const scene = sim.cometScene!;
  scene.done = true;
  scene.arrived = true;
  scene.travel = 0;
  sim.phase = "flight";
  sim.ship.x = COMET_SCENE_EDGE + 1;
  sim.ship.y = 0;
  sim.ship.vx = 40;
  sim.ship.vy = 0;
  stepSim(sim, STEP, idle);
  const parked = sim.comet?.parked;
  assert.ok(parked);
  assert.equal(parked?.civ, true);
  assert.equal(parked?.ref, "comet");

  const c = sim.comet!;
  const k = c.radius / NUCLEUS_R;
  sim.ship.x = c.x + COMET_REENTRY_DIST * k * 0.5;
  sim.ship.y = c.y;
  sim.ship.vx = c.vx;
  sim.ship.vy = c.vy;
  stepSim(sim, STEP, idle);
  assert.equal(sim.cometScene?.arrived, true);
  assert.equal(sim.cometMark?.civ, true);
  assert.equal(sim.cometMark?.ref, "comet");

  sim.ship.fuelKind = "ch4";
  sim.ship.engineKind = "v1";
  sim.ship.tankKind = "fuel";
  applyLoadout(sim.ship);
  sim.ship.fuel = 12;
  syncFuelMass(sim.ship);
  drop(sim);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.ship.fuelKind, "hush");
  assert.equal(sim.ship.engineKind, "coil");
  assert.equal(sim.ship.tankKind, "hold");
  assert.equal(sim.ship.fuel, 12);
});

test("landedFor matches the ref once the seconds are met, and only once", () => {
  const triggers: Trigger[] = [
    { on: "landedFor", ref: "comet", seconds: 10, effects: [{ revealHeading: "probe-end" }] },
  ];
  const state = marks();
  assert.equal(runTriggers("probe", triggers, [{ on: "landedFor", ref: "comet", seconds: 9.9 }], state).length, 0);
  assert.equal(state.firedTriggers.length, 0);
  const hit = runTriggers("probe", triggers, [{ on: "landedFor", ref: "comet", seconds: 10 }], state);
  assert.equal(hit.length, 1);
  assert.deepEqual(state.revealed, ["probe-end"]);
  assert.equal(runTriggers("probe", triggers, [{ on: "landedFor", ref: "comet", seconds: 11 }], state).length, 0);
  const other = marks();
  assert.equal(runTriggers("probe", triggers, [{ on: "landedFor", ref: "other", seconds: 40 }], other).length, 0);
});

test("taking off before the seconds resets the sit", () => {
  withProbe(() => {
    PROBE_PLACE.triggers = [
      ...PROBE_PLACE.triggers,
      { on: "landedFor", ref: "comet", seconds: 30, effects: [{ revealHeading: "probe-end" }] },
    ];
    const sim = boot(1);
    attach(sim);
    openMarked(sim, { civ: true, ref: "comet" });
    drop(sim);
    assert.equal(sim.phase, "landed");
    for (let i = 0; i < 20; i++) stepSim(sim, STEP, idle);
    assert.ok(sim.cometScene!.held < 30);
    assert.equal(sim.campaignEvents.some((event) => event.on === "landedFor"), false);
    takeoff(sim);
    assert.equal(sim.phase, "flight");
    assert.equal(sim.cometScene!.held, 0);
    assert.equal(sim.campaignEvents.some((event) => event.on === "landedFor"), false);
    drop(sim);
    for (let i = 0; i < 20; i++) stepSim(sim, STEP, idle);
    assert.equal(sim.campaignEvents.some((event) => event.on === "landedFor"), false);
    assert.equal(sim.phase, "landed");
  });
});

test("landedFor fires at its seconds, and the jump waits until the scene has arrived", () => {
  assert.equal(COMET_HOLD_S, 120);
  withProbe(() => {
    PROBE_PLACE.triggers = [
      ...PROBE_PLACE.triggers,
      { on: "landedFor", ref: "comet", seconds: 1, effects: [{ revealHeading: "probe-end" }] },
    ];
    const sim = boot(1);
    attach(sim);
    openMarked(sim, { ref: "comet" });
    drop(sim);
    sim.cometScene!.anchored = true;
    for (let i = 0; i < 90 && !sim.campaignEvents.some((event) => event.on === "landedFor"); i++) {
      stepSim(sim, STEP, idle);
    }
    const event = sim.campaignEvents.find((item) => item.on === "landedFor");
    assert.equal(event?.on, "landedFor");
    if (event?.on === "landedFor") assert.ok(event.seconds >= 1);
    assert.equal(sim.phase, "landed");
    assert.equal(sim.cometScene?.done, false, "the scene hold is still the 120 s timer");
    const effects = runTriggers(PROBE_PLACE.id, PROBE_PLACE.triggers, sim.campaignEvents.splice(0), sim.campaign!);
    assert.equal(effects.some((effect) => "revealHeading" in effect && effect.revealHeading === "probe-end"), true);
    assert.ok(sim.campaign!.revealed.includes("probe-end"));

    sim.cometScene!.held = COMET_HOLD_S - 0.05;
    for (let i = 0; i < 10 && !sim.cometScene?.done; i++) stepSim(sim, STEP, idle);
    assert.equal(sim.phase, "landed");
    assert.equal(sim.cometScene?.done, true);
    assert.equal(sim.cometScene?.arrived, false);

    for (let i = 0; i < 60 * (COMET_ARRIVE_S + 2) && sim.phase === "landed"; i++) stepSim(sim, STEP, idle);
    assert.equal(sim.phase, "transit");
    assert.equal(sim.cometScene, null);
    assert.equal(sim.warpTarget?.target?.place, "probe-end");
    assert.equal(sim.warpTarget?.name, "probe-end");

    for (let i = 0; i < 60 * 8 && sim.phase === "transit"; i++) stepSim(sim, STEP, idle);
    assert.equal(sim.phase, "flight");
    assert.equal(sim.campaign?.place, PROBE_END.id);
    assert.equal(getSystem().seed, PROBE_END.seed);
  });
});
