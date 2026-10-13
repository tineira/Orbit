import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignShipFrom, newCampaign, writeCheckpoint, type CampaignState, type Grant } from "./campaign.ts";
import { PHASE1_CIV, PHASE1_LEGS, PHASE1_PLACES, PHASE1_SHIPS } from "./campaign/phase1.ts";
import { applyLoadout, syncFuelMass } from "./fuel.ts";
import {
  chartCampaignWarp,
  hasCanonicalRefill,
  jumpsPerTank,
  lastLegStep,
  legById,
  legFrom,
  legStarName,
  stampCampaignHeadings,
  stepRecipe,
} from "./leg.ts";
import {
  applyBodyGrant,
  chartStoryPlace,
  cometCardFromPlace,
  storyHeadingName,
  storyPlaceById,
  type StoryPlace,
} from "./place.ts";
import { applyCampaignBoot, createSim, stepSim } from "./sim.ts";
import { runTriggers, shipDeltaV, type GameEvent } from "./triggers.ts";
import type { FuelKind, NearbyHeading, Ship } from "./types.ts";
import {
  createSystem,
  getPlanets,
  getSystem,
  MASSIVE_STAR_ATMO_FACTOR,
  WARP_BRAKE_SPEED,
  WARP_JUMP_SPEED,
} from "./world.ts";

const JUMP_DV = WARP_JUMP_SPEED - WARP_BRAKE_SPEED;

function place(id: string): StoryPlace {
  const found = storyPlaceById(id);
  assert.ok(found, id);
  return found;
}

function leg(id: string) {
  const found = legById(id);
  assert.ok(found, id);
  return found;
}

function paperShip(fuel: number): Ship {
  const ship: Ship = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    yaw: 0,
    mass: 1,
    dryMass: 1,
    fuel,
    fuelCapacity: 100,
    fuelKind: "ch4",
    engineKind: "v1",
    tankKind: "fuel",
    engineIsp: 1,
    engineThrust: 1,
    thrusting: false,
    reverse: false,
    hull: 100,
  };
  applyLoadout(ship);
  ship.fuel = fuel;
  syncFuelMass(ship);
  return ship;
}

function campaign(salt = 1): CampaignState {
  return newCampaign({
    salt,
    seed: 1,
    landedId: null,
    ship: { fuelKind: "ch4", engineKind: "v1", tankKind: "fuel", fuel: 12, hull: 100 },
  });
}

/** H2 from a deep skim (atmo trap + a gas giant) and a Workshop to refine it. */
function canRefineNtr(modules: Grant[]): boolean {
  if (!modules.some((grant) => "module" in grant && grant.module === "atmoTrap")) return false;
  const planets = getPlanets();
  const gas = planets.some((planet) => planet.kind === "gas" && planet.radius > 0);
  const shop = planets.some((planet) => planet.kicker === "Workshop" || planet.workshop === true);
  return gas && shop;
}

/** Leave D on a full NTR tank and take the headings this salt actually stamps. */
function crossLeg4(salt: number): number {
  const state = newCampaign({
    salt,
    seed: 55,
    landedId: null,
    place: "star-d",
    flags: ["cometHeading"],
    modules: [{ module: "atmoTrap" }],
    ship: { fuelKind: "ntr", engineKind: "thermal", tankKind: "cryo", fuel: 100, hull: 100 },
  });
  createSystem(55, {}, null, "Nu Pictoris", { nearby: { count: 3 } });
  stampCampaignHeadings(getSystem().nearby, state, false);
  let route = getSystem().nearby.find((item) => item.target?.leg === "leg-4");
  assert.ok(route, `salt ${salt} has no leg heading`);
  const full = jumpsPerTank("ntr", "thermal", "cryo");
  let range = full;
  let length = 0;
  let hops = 0;
  while (state.place !== "star-massive-1") {
    assert.ok(range >= 1, `salt ${salt} hop ${hops} range ${range}`);
    range -= 1;
    hops += 1;
    assert.ok(hops < 6, `salt ${salt} never arrived`);
    chartCampaignWarp(state, route, false, route.roll ?? 0, null, route.name);
    if (state.leg) {
      if (length === 0) length = state.leg.length ?? 0;
      if (state.leg.step === 0) assert.equal(canRefineNtr(state.modules), false, `salt ${salt} bridge`);
      if (length >= 3 && state.leg.step > 0) {
        assert.equal(canRefineNtr(state.modules), true, `salt ${salt} step ${state.leg.step}`);
        range = full;
      }
    }
    if (state.place === "star-massive-1") break;
    stampCampaignHeadings(getSystem().nearby, state, false);
    const next = getSystem().nearby.find(
      (item) => item.target?.leg === "leg-4" || item.target?.place === "star-massive-1",
    );
    assert.ok(next, `salt ${salt} lost the route`);
    route = next;
  }
  assert.equal(hops, length, `salt ${salt} hops`);
  assert.ok(length === 2 || length === 3, `salt ${salt} length ${length}`);
  return length;
}

function fire(card: StoryPlace, state: CampaignState, event: GameEvent) {
  return runTriggers(card.id, card.triggers, [event], state);
}

function land(card: StoryPlace, ref: string, ship: Ship, state: CampaignState) {
  const effects = fire(card, state, { on: "land", ref });
  const body = getPlanets().find((planet) => planet.placeRef === ref);
  assert.ok(body, ref);
  applyBodyGrant(ship, body.grant, state);
  return effects;
}

function refill(legId: string, step: number, length: number, fuel: FuelKind, seed: number) {
  const found = leg(legId);
  createSystem(seed, {}, null, null, stepRecipe(found, step, length));
  return hasCanonicalRefill(getPlanets(), fuel);
}

function heading(target: NearbyHeading["target"], name = "route"): NearbyHeading {
  return {
    angle: 0,
    color: "#fff",
    pal: ["#fff", "#ddd", "#bbb"],
    name,
    kind: "star",
    target,
  };
}

test("phase 1 walks marks and grants in order, and each leg fits the ship earned before it", () => {
  for (const card of PHASE1_PLACES) {
    for (const trigger of card.triggers) {
      for (const effect of trigger.effects) {
        if ("halley" in effect) assert.match(effect.halley, /^[a-z0-9:-]+$/);
        if ("thought" in effect) assert.match(effect.thought, /^[a-z0-9:-]+$/);
        if ("text" in effect) assert.match(effect.text, /^[a-z0-9:-]+$/);
      }
    }
  }

  const ship = paperShip(12);
  const state = campaign();
  assert.ok(shipDeltaV(ship) < JUMP_DV, "twelve liters cannot buy a jump");
  assert.ok(jumpsPerTank("ch4", "v1", "fuel") >= 1);

  const starA = place("star-a");
  assert.deepEqual(chartStoryPlace(starA, true), []);
  fire(starA, state, { on: "approach", ref: "a2", radius: 480 });
  fire(starA, state, { on: "approach", ref: "a2", radius: 200 });
  land(starA, "a1", ship, state);
  fire(starA, state, { on: "orbitLock", ref: "a3" });
  assert.deepEqual(state.flags, ["sawCrew", "sawWall", "hasV2", "stationHeading"]);
  assert.deepEqual(state.revealed, ["star-b"]);
  assert.equal(ship.fuelKind, "ch4");
  assert.equal(ship.engineKind, "v2");
  assert.equal(ship.tankKind, "fuel");
  const afterA = jumpsPerTank("ch4", "v2", "fuel");
  assert.ok(afterA >= 1, `leg 1 needs one hop, got ${afterA}`);

  const leg1 = leg("leg-1");
  assert.equal(leg1.from, "star-a");
  assert.equal(leg1.to, "star-b");
  assert.deepEqual(leg1.length, [3, 4]);
  assert.deepEqual(leg1.codes, [115, 386]);
  assert.equal(leg1.fuel, "ch4");
  for (const seed of [1, 8, 21]) {
    for (const step of [0, 1, 2]) {
      assert.equal(refill("leg-1", step, 4, "ch4", seed), true, `leg 1 ${step} ${seed}`);
    }
  }

  const starB = place("star-b");
  assert.equal(starB.headingRequires, "stationHeading");
  assert.deepEqual(chartStoryPlace(starB, true), []);
  fire(starB, state, { on: "enterSystem" });
  fire(starB, state, { on: "approach", ref: "b1", radius: 360 });
  land(starB, "b2", ship, state);
  assert.deepEqual(state.flags, [
    "sawCrew",
    "sawWall",
    "hasV2",
    "stationHeading",
    "sawList",
    "hasTransceiver",
  ]);
  assert.deepEqual(state.revealed, ["star-b", "star-c"]);
  assert.ok(afterA < 2, `methane V2 cannot cross two dry hops, got ${afterA}`);

  const leg2 = leg("leg-2");
  assert.equal(leg2.from, "star-b");
  assert.equal(leg2.to, "star-c");
  assert.deepEqual(leg2.length, [4, 5]);
  assert.deepEqual(leg2.codes, [388, 920]);
  assert.equal(leg2.fuel, "nh3");
  const leg2State = campaign();
  chartCampaignWarp(leg2State, heading({ leg: "leg-2" }), false, 4, null, null);
  assert.equal(leg2State.leg?.step, 0);
  const trap = getPlanets()
    .filter((planet) => planet.kind === "asteroid" && planet.landable)
    .sort((a, b) => b.radius - a.radius)[0];
  assert.ok(trap);
  assert.deepEqual(trap.grant, { module: "atmoTrap" });
  applyBodyGrant(ship, trap.grant, state);
  const afterTrap = jumpsPerTank("nh3", "v2", "fuel");
  assert.ok(afterTrap >= 1, `ammonia hops need one jump, got ${afterTrap}`);
  for (const seed of [1, 8, 21]) {
    assert.equal(refill("leg-2", 1, 5, "ch4", seed), false, `leg 2 ch4 ${seed}`);
    assert.equal(refill("leg-2", 1, 5, "nh3", seed), true, `leg 2 nh3 ${seed}`);
    assert.equal(refill("leg-2", 2, 4, "ch4", seed), false, `leg 2 ch4 step 2 ${seed}`);
    assert.equal(refill("leg-2", 2, 4, "nh3", seed), true, `leg 2 nh3 step 2 ${seed}`);
  }

  const starC = place("star-c");
  assert.equal(starC.headingRequires, "transceiver");
  assert.deepEqual(chartStoryPlace(starC, true), []);
  fire(starC, state, { on: "approach", ref: "c1", radius: 500 });
  fire(starC, state, { on: "approach", ref: "c1", radius: 180 });
  land(starC, "c1", ship, state);
  assert.ok(state.flags.includes("childhood"));
  assert.ok(state.flags.includes("hasLongTank"));
  assert.ok(state.revealed.includes("star-d"));
  assert.equal(ship.fuelKind, "ch4");
  assert.equal(ship.engineKind, "v2");
  assert.equal(ship.tankKind, "long");
  const beforeLong = jumpsPerTank("nh3", "v2", "fuel");
  const afterLong = jumpsPerTank("ch4", "v2", "long");
  assert.ok(beforeLong < 2, `ammonia fuel tank ${beforeLong}`);
  assert.ok(afterLong >= 2, `long tank crosses one dry system, got ${afterLong}`);

  const leg3 = leg("leg-3");
  assert.equal(leg3.from, "star-c");
  assert.equal(leg3.to, "star-d");
  assert.deepEqual(leg3.length, [4, 5]);
  assert.deepEqual(leg3.codes, [922, 1205]);
  assert.equal(leg3.fuel, "ch4");
  const afterMoon = jumpsPerTank("h2", "thermal", "cryo");
  assert.ok(afterMoon >= 1 && afterMoon < 2, `hydrogen needs the ice giant each hop, got ${afterMoon}`);
  for (const seed of [1, 5, 8]) {
    assert.equal(refill("leg-3", 0, 4, "ch4", seed), false, `leg 3 bridge ch4 ${seed}`);
    assert.equal(refill("leg-3", 0, 4, "nh3", seed), false, `leg 3 bridge nh3 ${seed}`);
    assert.equal(refill("leg-3", 2, 4, "h2", seed), true, `leg 3 ice ${seed}`);
    assert.equal(refill("leg-3", 2, 5, "ch4", seed), false, `leg 3 later ch4 ${seed}`);
  }

  const starD = place("star-d");
  assert.equal(starD.headingRequires, "hasLongTank");
  assert.deepEqual(chartStoryPlace(starD, true), []);
  fire(starD, state, { on: "orbitLock", ref: "d1" });
  fire(starD, state, { on: "land", ref: "d1" });
  assert.ok(state.flags.includes("cometHeading"));
  assert.ok(state.revealed.includes("star-massive-1"));

  const leg4 = leg("leg-4");
  assert.equal(leg4.from, "star-d");
  assert.equal(leg4.to, "star-massive-1");
  assert.deepEqual(leg4.length, [2, 3]);
  assert.deepEqual(leg4.codes, [1207, 1539]);
  assert.equal(leg4.fuel, "ntr");
  const beforeNtr = jumpsPerTank("ch4", "v2", "long");
  const afterNtr = jumpsPerTank("ntr", "thermal", "cryo");
  assert.ok(beforeNtr < 2.2, `long methane ${beforeNtr} stays under 2.2`);
  assert.ok(afterNtr >= 2.2, `ntr ${afterNtr} clears 2.2`);
  assert.ok(afterNtr >= 2 && afterNtr < 3, `ntr ${afterNtr} crosses length 2 and not length 3`);
  const step1 = stepRecipe(leg4, 1, 3);
  assert.equal(step1.gas, "ammonia");
  assert.equal(step1.rocky?.roles?.includes("workshop"), true);
  const lengths = new Set<number>();
  for (let salt = 0; salt < 48; salt++) lengths.add(crossLeg4(salt));
  assert.equal(lengths.has(2), true);
  assert.equal(lengths.has(3), true);

  const starE = place("star-massive-1");
  assert.equal(starE.headingRequires, "cometHeading");
  const early = fire(starE, state, { on: "landedFor", ref: "comet", seconds: 119 });
  assert.equal(early.length, 0);
  assert.equal(state.flags.includes("knowsTruth"), false);
  const held = fire(starE, state, { on: "landedFor", ref: "comet", seconds: 120 });
  assert.equal(held.some((effect) => "revealHeading" in effect && effect.revealHeading === "star-f"), true);
  assert.ok(state.flags.includes("knowsTruth"));
  assert.equal(legFrom("star-massive-1"), null);

  const starF = place("star-f");
  assert.equal(starF.headingRequires, undefined);
  assert.deepEqual(chartStoryPlace(starF, true), []);
  const arrived = fire(starF, state, { on: "enterSystem" });
  assert.equal(arrived.some((effect) => "halleyGlitch" in effect && effect.halleyGlitch === 4), true);
  assert.ok(state.flags.includes("halleyGlitchF"));
  land(starF, "f1", ship, state);
  fire(starF, state, { on: "takeoff", ref: "f1" });
  assert.ok(state.flags.includes("hasDetector"));
  assert.ok(state.flags.includes("hushMarked"));
  assert.equal(state.revealed.includes("star-g"), false);
  assert.equal(legFrom("star-f"), null);
  assert.equal(storyPlaceById("star-g"), null);

  assert.deepEqual(state.flags, [
    "sawCrew",
    "sawWall",
    "hasV2",
    "stationHeading",
    "sawList",
    "hasTransceiver",
    "childhood",
    "hasLongTank",
    "cometHeading",
    "knowsTruth",
    "halleyGlitchF",
    "hasDetector",
    "hushMarked",
  ]);
  assert.deepEqual(state.revealed, [
    "star-b",
    "star-c",
    "star-d",
    "star-massive-1",
    "star-f",
  ]);
  assert.deepEqual(state.modules, [
    { module: "transceiver" },
    { module: "atmoTrap" },
    { module: "hushDetector" },
  ]);
});

test("F has no star name, cards A–E use the closed names, and leg stars are LV codes", () => {
  assert.equal(PHASE1_SHIPS.patna, "pcss-patna");
  assert.equal(PHASE1_SHIPS.tremolino, "pcss-tremolino");
  assert.equal(PHASE1_SHIPS.torrens, "pcss-torrens");
  assert.equal(PHASE1_CIV, "civ");

  assert.equal(storyHeadingName("star-a"), "Eta Caeli");
  assert.equal(storyHeadingName("star-b"), "Theta Pyxidis");
  assert.equal(storyHeadingName("star-c"), "Kappa Fornacis");
  assert.equal(storyHeadingName("star-d"), "Nu Pictoris");
  assert.equal(storyHeadingName("star-massive-1"), "Mu Doradus");
  assert.equal(storyHeadingName("star-f"), "");
  assert.equal(storyPlaceById("star-g"), null);
  assert.equal(storyHeadingName("probe-end"), "probe-end");

  const names: Record<string, { star: string; ref: string; code: string; nickname: string }> = {
    "star-a": { star: "Eta Caeli", ref: "a2", code: "LV-114", nickname: "Lethe" },
    "star-b": { star: "Theta Pyxidis", ref: "b1", code: "LV-387", nickname: "Styx" },
    "star-c": { star: "Kappa Fornacis", ref: "c1", code: "LV-921", nickname: "Cocytus" },
    "star-d": { star: "Nu Pictoris", ref: "d1", code: "LV-1206", nickname: "Marlow's Rest" },
    "star-massive-1": { star: "Mu Doradus", ref: "e1", code: "LV-1540", nickname: "Phlegethon" },
  };
  for (const [id, expect] of Object.entries(names)) {
    const card = place(id);
    assert.equal(card.starName, expect.star);
    assert.deepEqual(chartStoryPlace(card, true), []);
    assert.equal(getSystem().name, expect.star);
    const body = getPlanets().find((planet) => planet.placeRef === expect.ref);
    assert.ok(body, expect.ref);
    assert.equal(body.name, expect.code);
    assert.equal(body.title, expect.nickname);
  }

  const starA = place("star-a");
  chartStoryPlace(starA, true);
  const rocks = getPlanets().filter((planet) => planet.kind === "asteroid");
  assert.ok(rocks.length >= 3);
  assert.equal(rocks[0]?.landable, true);
  assert.equal(rocks[1]?.landable, true);
  assert.equal(rocks[2]?.landable, true);
  const retrograde = getPlanets().find((planet) => planet.placeRef === "a3");
  assert.ok(retrograde?.orbitW != null && retrograde.orbitW < 0);

  const starE = place("star-massive-1");
  chartStoryPlace(starE, true);
  const star = getPlanets().find((planet) => planet.kind === "star");
  const lumen = getPlanets().find((planet) => planet.placeRef === "e1");
  assert.ok(star && lumen?.orbitR != null);
  const peri = lumen.orbitR * (1 - (lumen.orbitE ?? 0));
  assert.ok(peri > star.radius * MASSIVE_STAR_ATMO_FACTOR, `peri ${peri}`);
  const landed = starE.triggers.find((trigger) => trigger.on === "landedFor");
  assert.ok(landed && landed.on === "landedFor" && landed.seconds === 120);
  assert.deepEqual(cometCardFromPlace(starE), {
    requires: { fuel: "lumen" },
    scene: "perihelion",
    ref: "comet",
  });

  const starF = place("star-f");
  assert.equal(starF.starName, "");
  assert.deepEqual(chartStoryPlace(starF, true), []);
  assert.equal(getSystem().name, "");
  assert.equal(getPlanets().find((planet) => planet.kind === "star")?.name, "");
  assert.deepEqual(cometCardFromPlace(starF), {
    requires: { module: "hushDetector" },
    civ: true,
    scene: "marked",
    ref: "comet",
  });
  const glitch = starF.triggers.find((trigger) => trigger.on === "enterSystem");
  assert.ok(glitch);
  assert.equal(glitch.effects.some((effect) => "halleyGlitch" in effect && effect.halleyGlitch === 4), true);

  createSystem(1, {}, null, "");
  assert.equal(getSystem().name, "");
  createSystem(1);
  assert.notEqual(getSystem().name, "");
  for (const seed of [1, 2, 3, 4, 5]) {
    createSystem(seed);
    assert.ok(getSystem().name.length > 0, `seed ${seed}`);
    assert.ok(getSystem().nearby.every((item) => item.roll == null && item.target == null));
  }

  const named: [string, string, string][] = [
    ["star-b", "Theta Pyxidis", "leg-1"],
    ["star-c", "Kappa Fornacis", "leg-2"],
    ["star-d", "Nu Pictoris", "leg-3"],
    ["star-massive-1", "Mu Doradus", "leg-4"],
  ];
  for (const [id, starName, legId] of named) {
    const found = leg(legId);
    const length = found.length[0];
    createSystem(9, {}, null, null, { nearby: { count: 2 } });
    const state = campaign();
    state.leg = { id: legId, step: lastLegStep(length), seed: getSystem().seed, length };
    stampCampaignHeadings(getSystem().nearby, state, false);
    assert.equal(
      getSystem().nearby.some((item) => item.target?.place === id),
      false,
      `${id} stays shut`,
    );
    state.revealed.push(id);
    stampCampaignHeadings(getSystem().nearby, state, false);
    assert.equal(getSystem().nearby.find((item) => item.target?.place === id)?.name, starName);
  }

  createSystem(4, {}, null, null, { nearby: { count: 3 } });
  const before = getSystem().nearby.map((item) => item.name);
  const state = campaign();
  state.place = "star-a";
  stampCampaignHeadings(getSystem().nearby, state, false);
  const route = getSystem().nearby.find((item) => item.target?.leg === "leg-1");
  assert.ok(route?.roll != null);
  const leg1 = leg("leg-1");
  assert.equal(route.name, legStarName(leg1, route.roll));
  const code = Number(route.name.slice(3));
  assert.ok(code >= leg1.codes![0] && code <= leg1.codes![1], route.name);
  assert.equal(getSystem().nearby.filter((item, index) => item.name !== before[index]).length, 1);

  chartCampaignWarp(state, route, false, route.roll, null, null);
  assert.equal(getSystem().name, route.name);
  assert.equal(state.leg?.step, 0);
  assert.equal(state.leg?.seed, route.roll);
  const stepSeed = state.leg.seed;
  const detour = getSystem().nearby[0];
  assert.ok(detour);
  chartCampaignWarp(state, detour, false, 77, null, null);
  assert.equal(state.leg?.step, 0);
  assert.equal(state.leg?.seed, stepSeed);
  stampCampaignHeadings(getSystem().nearby, state, true);
  const back = getSystem().nearby.find((item) => item.target?.leg === "leg-1");
  assert.ok(back);
  assert.equal(back.roll, undefined);
  assert.equal(back.name, legStarName(leg1, stepSeed));

  for (const found of PHASE1_LEGS) {
    for (const seed of [1, 2, 99, 1000, 0x4c56]) {
      const name = legStarName(found, seed);
      assert.ok(name);
      const n = Number(name.slice(3));
      assert.equal(name, `LV-${n}`);
      assert.ok(n >= found.codes![0] && n <= found.codes![1], `${found.id} ${name}`);
    }
  }
  assert.equal(legStarName(leg("probe-leg"), 1), null);

  createSystem(2, {}, null, null, { nearby: { count: 2 } });
  const probe = campaign();
  probe.place = "probe";
  stampCampaignHeadings(getSystem().nearby, probe, false);
  const probeHeading = getSystem().nearby.find((item) => item.target?.leg === "probe-leg");
  assert.equal(probeHeading?.name, "probe-leg");
  assert.equal(probeHeading?.roll, undefined);
});

function legHeading(legId: string) {
  return getSystem().nearby.find((item) => item.target?.leg === legId);
}

test("two playthroughs roll different legs, and one save keeps its systems", () => {
  function firstRoll(salt: number) {
    const state = campaign(salt);
    state.place = "star-a";
    createSystem(8, {}, null, "Eta Caeli", { nearby: { count: 2 } });
    stampCampaignHeadings(getSystem().nearby, state, false);
    const route = legHeading("leg-1");
    assert.ok(route?.roll != null && route.name);
    chartCampaignWarp(state, route, false, route.roll, null, route.name);
    return { roll: route.roll, name: getSystem().name, length: state.leg?.length };
  }
  const a = firstRoll(1);
  const b = firstRoll(2);
  assert.notEqual(a.roll, b.roll);
  assert.equal(firstRoll(1).name, a.name);
  assert.equal(firstRoll(1).length, a.length);
  assert.equal(firstRoll(1).roll, a.roll);
});

test("recharting a leg step keeps the LV name and the step grant", () => {
  const state = campaign(4);
  state.place = "star-b";
  createSystem(21, {}, null, "Theta Pyxidis", { nearby: { count: 3 } });
  stampCampaignHeadings(getSystem().nearby, state, false);
  const route = legHeading("leg-2");
  assert.ok(route?.roll != null);
  chartCampaignWarp(state, route, false, route.roll, null, route.name);
  assert.equal(state.leg?.step, 0);
  const name = getSystem().name;
  assert.match(name, /^LV-/);
  const trap = getPlanets()
    .filter((planet) => planet.kind === "asteroid" && planet.landable)
    .sort((a, b) => b.radius - a.radius)[0];
  assert.ok(trap);
  assert.deepEqual(trap.grant, { module: "atmoTrap" });
  stampCampaignHeadings(getSystem().nearby, state, false);
  const next = legHeading("leg-2");
  assert.ok(next?.roll != null);
  const nextName = next.name;
  const nextRoll = next.roll;
  writeCheckpoint(state, {
    seed: state.leg!.seed,
    landedId: trap.id,
    ship: state.ship,
    place: null,
    leg: state.leg,
  });
  createSystem(3);
  const sim = createSim();
  sim.campaign = state;
  applyCampaignBoot(sim);
  assert.equal(getSystem().name, name);
  const again = getPlanets()
    .filter((planet) => planet.kind === "asteroid" && planet.landable)
    .sort((a, b) => b.radius - a.radius)[0];
  assert.ok(again);
  assert.deepEqual(again.grant, { module: "atmoTrap" });
  const restamped = legHeading("leg-2");
  assert.equal(restamped?.name, nextName);
  assert.equal(restamped?.roll, nextRoll);
});

const fly = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function flyCampaign(id: string, salt = 3) {
  const card = place(id);
  chartStoryPlace(card, false);
  const sim = createSim();
  sim.campaign = newCampaign({
    salt,
    seed: getSystem().seed,
    landedId: null,
    place: card.id,
    ship: campaignShipFrom(sim.ship),
  });
  sim.campaignPlaceId = card.id;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = 50000;
  sim.ship.y = 20000;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  return sim;
}

test("a campaign place spawns its comet and sets the card", () => {
  const e = flyCampaign("star-massive-1");
  assert.equal(Boolean(e.comet), false);
  stepSim(e, 1 / 60, fly);
  const grazed = e.comet;
  assert.ok(grazed);
  assert.equal(e.cometSpent, true);
  assert.deepEqual(grazed.card, cometCardFromPlace(place("star-massive-1")));
  stepSim(e, 1 / 60, fly);
  assert.equal(e.cometSpent, true);

  const free = createSim();
  free.phase = "flight";
  free.padZoomLock = false;
  stepSim(free, 1 / 60, fly);
  assert.equal(free.comet, null);

  const f = flyCampaign("star-f");
  stepSim(f, 1 / 60, fly);
  const passer = f.comet;
  assert.ok(passer);
  assert.equal(passer.card, undefined);
  assert.equal(passer.unmarked, true);
  assert.equal(Boolean(f.cometHeading), false);
  let left = false;
  for (let i = 0; i < 900 && !left; i++) {
    stepSim(f, 1 / 30, fly);
    if (!f.comet && !f.cometHeading) left = true;
  }
  assert.equal(left, true, "an unmarked comet leaves no heading");
  for (let i = 0; i < 30 && !f.comet; i++) stepSim(f, 1 / 60, fly);
  const next = f.comet;
  assert.ok(next, "another comet comes");
  assert.equal(next.card, undefined);
  f.campaign!.flags.push("hushMarked");
  f.campaign!.modules.push({ module: "hushDetector" });
  stepSim(f, 1 / 60, fly);
  assert.deepEqual(f.comet?.card, cometCardFromPlace(place("star-f")));
  let heading = false;
  for (let i = 0; i < 900 && !heading; i++) {
    stepSim(f, 1 / 30, fly);
    if (f.cometHeading) heading = true;
  }
  assert.equal(heading, true);
  const marked = f.cometHeading;
  assert.ok(marked);
  assert.deepEqual(marked.comet, cometCardFromPlace(place("star-f")));
  stepSim(f, 1 / 60, fly);
  assert.equal(Boolean(f.comet), false);
});
