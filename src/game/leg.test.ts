import assert from "node:assert/strict";
import { test } from "node:test";
import {
  campaignShipFrom,
  newCampaign,
  saveCampaign,
  loadCampaign,
  writeCheckpoint,
  type CampaignState,
  type CampaignStorage,
} from "./campaign.ts";
import {
  PROBE_LEG,
  chartCampaignWarp,
  dryRecipe,
  fullTankDeltaV,
  hasCanonicalRefill,
  headingOpen,
  jumpsPerTank,
  stampCampaignHeadings,
  stepRecipe,
} from "./leg.ts";
import { PROBE_END, PROBE_PLACE, chartStoryPlace } from "./place.ts";
import { bindCampaignChart, createSim, stepSim } from "./sim.ts";
import type { EngineKind, FuelKind, NearbyHeading, TankKind } from "./types.ts";
import { createSystem, getPlanets, getSystem, WARP_TRANSIT } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

const ship = { fuelKind: "ch4" as const, engineKind: "v1" as const, tankKind: "fuel" as const, fuel: 40, hull: 100 };

function campaign(place: string | null): CampaignState {
  return newCampaign({
    seed: 1,
    landedId: null,
    place,
    ship,
  });
}

function memory(): CampaignStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
  };
}

function follow(state: CampaignState, aside: boolean, seed: number, advancing: boolean) {
  const heading = getSystem().nearby.find((item) => (item.target != null) === advancing) ?? null;
  assert.ok(heading, advancing ? "missing route heading" : "missing detour heading");
  const charted = chartCampaignWarp(state, heading, aside, seed);
  stampCampaignHeadings(getSystem().nearby, state, charted.aside);
  return charted;
}

test("jumps per tank stay within 5% of the bridge table", () => {
  const table: { fuel: FuelKind; engine: EngineKind; tank: TankKind; dv: number; jumps: number }[] = [
    { fuel: "ch4", engine: "v1", tank: "fuel", dv: 1700, jumps: 1.2 },
    { fuel: "ch4", engine: "v2", tank: "fuel", dv: 2020, jumps: 1.4 },
    { fuel: "ch4", engine: "v2", tank: "long", dv: 2880, jumps: 2.0 },
    { fuel: "nh3", engine: "v2", tank: "long", dv: 2880, jumps: 2.0 },
    { fuel: "h2", engine: "v2", tank: "cryo", dv: 1020, jumps: 0.7 },
    { fuel: "h2", engine: "thermal", tank: "cryo", dv: 1610, jumps: 1.1 },
    { fuel: "ntr", engine: "thermal", tank: "cryo", dv: 3580, jumps: 2.5 },
    { fuel: "ch4", engine: "v2", tank: "hold", dv: 4500, jumps: 3.2 },
    { fuel: "ntr", engine: "thermal", tank: "hold", dv: 5350, jumps: 3.8 },
  ];
  for (const row of table) {
    const dv = fullTankDeltaV(row.fuel, row.engine, row.tank);
    const jumps = jumpsPerTank(row.fuel, row.engine, row.tank);
    assert.ok(Math.abs(dv - row.dv) / row.dv <= 0.05, `${row.fuel} ${row.engine} ${row.tank} dv ${dv}`);
    assert.ok(
      Math.abs(jumps - row.jumps) / row.jumps <= 0.05,
      `${row.fuel} ${row.engine} ${row.tank} jumps ${jumps}`,
    );
  }
});

test("a leg of length N reaches the place in N jumps", () => {
  chartStoryPlace(PROBE_PLACE, false);
  const state = campaign(PROBE_PLACE.id);
  stampCampaignHeadings(getSystem().nearby, state, false);
  let aside = false;
  let sawBridge = false;
  const jumps = PROBE_LEG.length[0];
  for (let i = 0; i < jumps; i++) {
    aside = follow(state, aside, 200 + i, true).aside;
    if (state.leg?.step === 1) {
      sawBridge = true;
      assert.equal(hasCanonicalRefill(getPlanets(), "ch4"), false);
    }
  }
  assert.equal(sawBridge, true);
  assert.equal(aside, false);
  assert.equal(state.place, PROBE_END.id);
  assert.equal(state.leg, null);
  assert.equal(getSystem().seed, PROBE_END.seed);
});

test("a detour keeps the leg step and the way back", () => {
  chartStoryPlace(PROBE_PLACE, false);
  const state = campaign(PROBE_PLACE.id);
  stampCampaignHeadings(getSystem().nearby, state, false);
  let aside = follow(state, false, 11, true).aside;
  const step = state.leg?.step;
  const legSeed = state.leg?.seed;
  assert.equal(step, 0);
  assert.equal(typeof legSeed, "number");
  aside = follow(state, aside, 99, false).aside;
  assert.equal(aside, true);
  assert.equal(state.leg?.step, step);
  assert.equal(state.leg?.seed, legSeed);
  assert.notEqual(getSystem().seed, legSeed);
  aside = follow(state, aside, 100, true).aside;
  assert.equal(aside, false);
  assert.equal(state.leg?.step, step);
  assert.equal(state.leg?.seed, legSeed);
  assert.equal(getSystem().seed, legSeed);
  aside = follow(state, aside, 101, true).aside;
  assert.equal(state.leg?.step, 1);
  assert.notEqual(state.leg?.seed, legSeed);
  assert.equal(aside, false);
});

test("a bridge has no refill for the leg fuel", () => {
  const fuels: FuelKind[] = ["ch4", "nh3", "h2", "ntr", "d", "he3"];
  for (const fuel of fuels) {
    for (const seed of [1, 8, 21]) {
      createSystem(seed, {}, null, null, dryRecipe(fuel));
      assert.equal(hasCanonicalRefill(getPlanets(), fuel), false, `${fuel} ${seed}`);
    }
  }
  for (const seed of [1, 2, 7, 19, 42]) {
    createSystem(seed, {}, null, null, stepRecipe(PROBE_LEG, 1, 3));
    assert.equal(hasCanonicalRefill(getPlanets(), "ch4"), false, `probe bridge ${seed}`);
  }
  createSystem(1, {}, null, null, dryRecipe("lumen"));
  assert.equal(hasCanonicalRefill(getPlanets(), "lumen"), true);
});

test("a gated place heading stays hidden until the mark, the module, or a reveal", () => {
  PROBE_END.headingRequires = "sealed";
  try {
    createSystem(4, {}, null, null, stepRecipe(PROBE_LEG, 1, 3));
    const state = campaign(null);
    state.leg = { id: PROBE_LEG.id, step: 1, seed: getSystem().seed, length: 3 };
    stampCampaignHeadings(getSystem().nearby, state, false);
    assert.equal(
      getSystem().nearby.some((heading) => heading.target?.place === PROBE_END.id),
      false,
    );
    assert.equal(headingOpen("sealed", PROBE_END.id, state), false);
    state.revealed.push(PROBE_END.id);
    stampCampaignHeadings(getSystem().nearby, state, false);
    assert.equal(
      getSystem().nearby.some((heading) => heading.target?.place === PROBE_END.id),
      true,
    );
  } finally {
    PROBE_END.headingRequires = undefined;
  }
});

test("a leg length survives a save", () => {
  const state = campaign(null);
  state.leg = { id: PROBE_LEG.id, step: 1, seed: 9, length: 3 };
  writeCheckpoint(state, { seed: 9, landedId: null, ship: state.ship, place: null, leg: state.leg });
  const store = memory();
  assert.equal(saveCampaign(state, store), true);
  const loaded = loadCampaign(store);
  assert.equal(loaded?.leg?.length, 3);
  assert.equal(loaded?.checkpoint.leg?.length, 3);
});

test("random charts do not grow a story target", () => {
  createSystem(3);
  const headings: NearbyHeading[] = getSystem().nearby;
  assert.ok(headings.length > 0);
  assert.ok(headings.every((heading) => heading.target == null));
});

test("punchWarp follows the leg heading", () => {
  chartStoryPlace(PROBE_PLACE, false);
  const sim = createSim();
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: null,
    place: PROBE_PLACE.id,
    ship: campaignShipFrom(sim.ship),
  });
  sim.campaignPlaceId = PROBE_PLACE.id;
  bindCampaignChart(sim);
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  const heading = sim.nearby.find((item) => item.target?.leg === PROBE_LEG.id);
  assert.ok(heading);
  assert.equal(heading.name, PROBE_LEG.id);
  sim.ship.x = 80000;
  sim.ship.y = 80000;
  sim.ship.vx = Math.cos(heading.angle) * 1600;
  sim.ship.vy = Math.sin(heading.angle) * 1600;
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.phase, "transit");
  stepSim(sim, WARP_TRANSIT + 1, idle);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.campaign?.place, null);
  assert.equal(sim.campaign?.leg?.id, PROBE_LEG.id);
  assert.equal(sim.campaign?.leg?.step, 0);
  assert.equal(sim.campaignAside, false);
});
