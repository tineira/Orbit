import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPAIGN_STORAGE_KEY,
  campaignShipFrom,
  keepCampaignMarks,
  loadCampaign,
  newCampaign,
  saveCampaign,
  type CampaignState,
  type CampaignStorage,
} from "./campaign.ts";
import { syncFuelMass } from "./fuel.ts";
import { PROBE_PLACE, chartStoryPlace } from "./place.ts";
import { applyStoryStart, createSim, enterWarp, stepSim, takeoff } from "./sim.ts";
import {
  APPROACH_HYSTERESIS,
  approachCrossings,
  canReachJump,
  runTriggers,
  shipDeltaV,
  spokenLine,
  type ApproachLatch,
  type Trigger,
} from "./triggers.ts";
import { createSystem, getPlanets, getSystem, WARP_TRANSIT } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function freshLatch(): ApproachLatch {
  return { seen: new Set(), inside: new Set() };
}

function campaign(place: string | null = "probe"): CampaignState {
  return newCampaign({
    seed: 1,
    landedId: "pad",
    place,
    ship: { fuelKind: "ch4", engineKind: "v1", tankKind: "fuel", fuel: 40, hull: 100 },
  });
}

function memory(): { storage: CampaignStorage; mem: Map<string, string> } {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, value) => {
        mem.set(key, value);
      },
    },
  };
}

test("each trigger event can fire", () => {
  const triggers: Trigger[] = [
    { on: "enterSystem", effects: [{ text: "text:enter" }] },
    { on: "approach", ref: "rock", radius: 280, effects: [{ text: "text:near" }] },
    { on: "orbitLock", ref: "rock", effects: [{ halley: "halley-01" }] },
    { on: "land", ref: "rock", effects: [{ text: "text:land" }] },
    { on: "takeoff", ref: "rock", effects: [{ text: "text:leave" }] },
    { on: "warpAttempt", heading: "Vega", effects: [{ text: "text:short" }] },
    { on: "flag", flag: "leftRock", effects: [{ logFragment: 2 }] },
  ];
  const state = campaign();
  const effects = runTriggers("probe", triggers, [
    { on: "enterSystem" },
    { on: "approach", ref: "rock", radius: 280 },
    { on: "orbitLock", ref: "rock" },
    { on: "land", ref: "rock" },
    { on: "takeoff", ref: "rock" },
    { on: "warpAttempt", heading: "Vega" },
    { on: "flag", flag: "leftRock" },
  ], state);
  assert.equal(effects.length, 7);
  assert.deepEqual(
    state.firedTriggers,
    ["probe:0", "probe:1", "probe:2", "probe:3", "probe:4", "probe:5", "probe:6"],
  );
  const missed = runTriggers("probe", triggers, [{ on: "approach", ref: "rock", radius: 10 }], state);
  assert.deepEqual(missed, []);
});

test("once skips a second fire and once false does not", () => {
  const once: Trigger[] = [{ on: "enterSystem", effects: [{ text: "text:a" }] }];
  const state = campaign();
  assert.equal(runTriggers("probe", once, [{ on: "enterSystem" }], state).length, 1);
  assert.deepEqual(runTriggers("probe", once, [{ on: "enterSystem" }], state), []);
  assert.deepEqual(state.firedTriggers, ["probe:0"]);

  const repeat: Trigger[] = [{ on: "enterSystem", once: false, effects: [{ logFragment: 1 }] }];
  const open = campaign();
  assert.equal(runTriggers("probe", repeat, [{ on: "enterSystem" }], open).length, 1);
  assert.equal(runTriggers("probe", repeat, [{ on: "enterSystem" }], open).length, 1);
  assert.deepEqual(open.firedTriggers, []);
});

test("when.has and when.not gate a trigger", () => {
  const triggers: Trigger[] = [
    { on: "land", ref: "rock", when: { has: ["leftRock"] }, effects: [{ setFlag: "backRock" }] },
    { on: "takeoff", ref: "rock", when: { not: ["leftRock"] }, effects: [{ text: "text:first" }] },
  ];
  const blocked = campaign();
  assert.deepEqual(runTriggers("probe", triggers, [{ on: "land", ref: "rock" }], blocked), []);
  blocked.flags.push("leftRock");
  assert.deepEqual(runTriggers("probe", triggers, [{ on: "takeoff", ref: "rock" }], blocked), []);
  const landed = runTriggers("probe", triggers, [{ on: "land", ref: "rock" }], blocked);
  assert.equal(landed.length, 1);
  assert.ok(blocked.flags.includes("backRock"));

  const open = campaign();
  assert.equal(runTriggers("probe", triggers, [{ on: "takeoff", ref: "rock" }], open).length, 1);
});

test("setFlag chains to a flag trigger and revealHeading is stored", () => {
  const triggers: Trigger[] = [
    { on: "takeoff", ref: "rock", effects: [{ setFlag: "leftRock" }] },
    {
      on: "flag",
      flag: "leftRock",
      effects: [{ setFlag: "heard" }, { revealHeading: "leg-1" }, { grant: { module: "transceiver" } }],
    },
  ];
  const state = campaign();
  const effects = runTriggers("probe", triggers, [{ on: "takeoff", ref: "rock" }], state);
  assert.equal(effects.length, 4);
  assert.deepEqual(state.flags, ["leftRock", "heard"]);
  assert.deepEqual(state.revealed, ["leg-1"]);
  assert.deepEqual(state.firedTriggers, ["probe:0", "probe:1"]);
  assert.equal(state.modules.length, 0);
  keepCampaignMarks(state);
  state.ship.fuel = 1;
  assert.equal(state.checkpoint.ship.fuel, 40);
  assert.deepEqual(state.checkpoint.flags, ["leftRock", "heard"]);
  assert.deepEqual(state.checkpoint.revealed, ["leg-1"]);
});

test("a null manifest speaks nothing", () => {
  assert.equal(spokenLine({ halley: "halley-01" }, null, null), null);
  assert.equal(spokenLine({ thought: "thought-01" }, null, null), null);
  assert.equal(spokenLine({ text: "text:probe-leave" }, { "halley-01": { text: "fixture" } }, null), null);
  assert.deepEqual(spokenLine({ halley: "halley-01" }, { "halley-01": { text: "fixture" } }, null), {
    source: "ship",
    id: "halley-01",
    text: "fixture",
  });
  assert.deepEqual(spokenLine({ thought: "thought-01" }, null, { "thought-01": { text: "fixture" } }), {
    source: "thought",
    id: "thought-01",
    text: "fixture",
  });
});

test("approach latches inside without firing until the ship leaves and comes back", () => {
  const latch = freshLatch();
  const near = { ref: "rock", radius: 280, dist: 40 };
  assert.deepEqual(approachCrossings(latch, [near]), []);
  assert.equal(latch.inside.has("rock:280"), true);
  assert.deepEqual(approachCrossings(latch, [{ ref: "rock", radius: 280, dist: 300 }]), []);
  const exit = 280 * APPROACH_HYSTERESIS;
  assert.deepEqual(approachCrossings(latch, [{ ref: "rock", radius: 280, dist: exit }]), []);
  assert.equal(latch.inside.has("rock:280"), false);
  assert.deepEqual(approachCrossings(latch, [near]), [{ ref: "rock", radius: 280 }]);
  assert.deepEqual(approachCrossings(latch, [near]), []);

  const split = freshLatch();
  assert.deepEqual(
    approachCrossings(split, [
      { ref: "rock", radius: 100, dist: 10 },
      { ref: "rock", radius: 400, dist: 10 },
    ]),
    [],
  );
  assert.equal(split.inside.has("rock:100"), true);
  assert.equal(split.inside.has("rock:400"), true);
});

test("delta-v reaches a jump from a full methane tank and not from an empty one", () => {
  const ship = {
    fuel: 100,
    fuelKind: "ch4" as const,
    engineIsp: 1,
    dryMass: 1,
    mass: 1.35,
  };
  const dv = shipDeltaV(ship);
  assert.ok(dv > 1600 && dv < 1800, `dv ${dv}`);
  assert.equal(canReachJump(ship, 0), true);
  assert.equal(canReachJump({ ...ship, fuel: 0, mass: 1 }, 0), false);
  assert.equal(canReachJump({ ...ship, fuelKind: "hush", fuel: 1, mass: 1.02 }, 0), true);
  assert.equal(canReachJump({ ...ship, fuelKind: "hush", fuel: 0, mass: 1 }, 0), false);
});

test("probe takeoff fires once and a reload does not repeat it", () => {
  chartStoryPlace(PROBE_PLACE, true);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
    place: PROBE_PLACE.id,
  });
  applyStoryStart(sim, PROBE_PLACE);
  takeoff(sim);
  assert.ok(sim.campaignEvents.some((event) => event.on === "takeoff" && event.ref === "rock"));
  const effects = runTriggers(PROBE_PLACE.id, PROBE_PLACE.triggers, sim.campaignEvents.splice(0), sim.campaign!);
  assert.ok(effects.some((effect) => "text" in effect && effect.text === "text:probe-leave"));
  assert.ok(sim.campaign!.flags.includes("leftRock"));
  assert.deepEqual(sim.campaign!.firedTriggers, ["probe:0"]);
  const { storage, mem } = memory();
  assert.equal(saveCampaign(sim.campaign!, storage), true);
  const loaded = loadCampaign(storage);
  assert.ok(loaded);
  assert.equal(mem.has(CAMPAIGN_STORAGE_KEY), true);
  const again = runTriggers(PROBE_PLACE.id, PROBE_PLACE.triggers, [{ on: "takeoff", ref: "rock" }], loaded);
  assert.deepEqual(again, []);
  assert.deepEqual(loaded.firedTriggers, ["probe:0"]);
});

test("probe approach stays quiet on the pad, then fires once on the way back in", () => {
  chartStoryPlace(PROBE_PLACE, true);
  const rock = getPlanets().find((p) => p.placeRef === "rock");
  assert.ok(rock);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: rock.id,
    ship: campaignShipFrom(sim.ship),
    place: PROBE_PLACE.id,
  });
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = rock.x + 200;
  sim.ship.y = rock.y;
  sim.ship.vx = rock.vx;
  sim.ship.vy = rock.vy;
  stepSim(sim, 1 / 60, idle);
  assert.equal(
    sim.campaignEvents.some((event) => event.on === "approach"),
    false,
  );
  sim.ship.x = rock.x + 4000;
  sim.ship.y = rock.y;
  sim.ship.vx = rock.vx;
  sim.ship.vy = rock.vy;
  stepSim(sim, 1 / 60, idle);
  assert.equal(
    sim.campaignEvents.some((event) => event.on === "approach"),
    false,
  );
  sim.ship.x = rock.x + 200;
  sim.ship.y = rock.y;
  sim.ship.vx = rock.vx;
  sim.ship.vy = rock.vy;
  stepSim(sim, 1 / 60, idle);
  assert.ok(sim.campaignEvents.some((event) => event.on === "approach" && event.ref === "rock"));
});

test("landing on the probe rock queues a land event", () => {
  chartStoryPlace(PROBE_PLACE, true);
  const rock = getPlanets().find((p) => p.placeRef === "rock");
  assert.ok(rock);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
    place: PROBE_PLACE.id,
  });
  sim.campaignPlaceId = PROBE_PLACE.id;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.takeoffIgnoreId = null;
  sim.ship.x = rock.x;
  sim.ship.y = rock.y;
  sim.ship.vx = rock.vx;
  sim.ship.vy = rock.vy;
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.phase, "landed");
  assert.ok(sim.campaignEvents.some((event) => event.on === "land" && event.ref === "rock"));
});

test("an empty tank aimed at a heading queues one warp attempt", () => {
  createSystem(1);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: 1,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
    place: null,
  });
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  const heading = sim.nearby[0];
  assert.ok(heading);
  const aim = (fuel: number) => {
    sim.ship.fuel = fuel;
    syncFuelMass(sim.ship);
    sim.ship.x = 80000;
    sim.ship.y = 80000;
    sim.ship.vx = Math.cos(heading.angle) * 200;
    sim.ship.vy = Math.sin(heading.angle) * 200;
    sim.warpBlockHeading = null;
    sim.campaignEvents.length = 0;
    stepSim(sim, 1 / 60, idle);
  };
  aim(0);
  const attempts = sim.campaignEvents.filter((event) => event.on === "warpAttempt");
  assert.deepEqual(
    attempts.map((event) => (event.on === "warpAttempt" ? event.heading : "")),
    [heading.name],
  );
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.campaignEvents.filter((event) => event.on === "warpAttempt").length, 1);

  aim(100);
  assert.equal(
    sim.campaignEvents.some((event) => event.on === "warpAttempt"),
    false,
  );

  heading.requires = "sealed";
  aim(100);
  assert.ok(sim.campaignEvents.some((event) => event.on === "warpAttempt" && event.heading === heading.name));
  sim.campaign!.flags.push("sealed");
  aim(100);
  assert.equal(
    sim.campaignEvents.some((event) => event.on === "warpAttempt"),
    false,
  );
});

test("finishing a warp queues enterSystem", () => {
  createSystem(2);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: 2,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
  });
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  enterWarp(sim);
  stepSim(sim, WARP_TRANSIT + 1, idle);
  assert.equal(sim.phase, "flight");
  assert.ok(sim.campaignEvents.some((event) => event.on === "enterSystem"));
});

test("random mode takeoff queues nothing", () => {
  createSystem(3);
  const sim = createSim();
  assert.equal(sim.campaign, null);
  takeoff(sim);
  assert.deepEqual(sim.campaignEvents, []);
});
