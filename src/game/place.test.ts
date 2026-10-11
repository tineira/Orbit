import assert from "node:assert/strict";
import { test } from "node:test";
import { padHasFuel } from "./occupancy.ts";
import {
  applyStoryBodies,
  chartStoryPlace,
  placeFromSearch,
  PROBE_PLACE,
  storyPlaceById,
  type StoryPlace,
} from "./place.ts";
import { applyStoryStart, createSim, listLagrangePoints, rebootSim, stepSim } from "./sim.ts";
import { createSystem, getPlanets, getSystem } from "./world.ts";
import { newCampaign, campaignShipFrom } from "./campaign.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

test("place search is a campaign door", () => {
  assert.equal(placeFromSearch(""), null);
  assert.equal(placeFromSearch("?campaign"), null);
  assert.equal(placeFromSearch("?place=probe"), "probe");
  assert.equal(storyPlaceById("probe")?.id, "probe");
  assert.equal(storyPlaceById("nope"), null);
});

test("a missing match is an error and a random chart grows no place fields", () => {
  createSystem(1, {}, null, null, PROBE_PLACE.recipe);
  const bad: StoryPlace = {
    ...PROBE_PLACE,
    bodies: [{ ref: "nope", match: { kind: "asteroid", kicker: "Nope" } }],
  };
  const misses = applyStoryBodies(getPlanets(), bad);
  assert.equal(misses.length, 2);
  assert.match(misses[0]!, /nope/);
  assert.throws(() => chartStoryPlace(bad, true), /nope/);

  createSystem(3);
  for (const p of getPlanets()) {
    assert.equal(p.placeRef, undefined);
    assert.equal(p.pad, undefined);
    assert.equal(p.grant, undefined);
    if (p.orbitW != null) assert.ok(p.orbitW > 0, p.id);
  }
});

test("the probe place starts off Home on a retrograde rock whose pad works", () => {
  createSystem(PROBE_PLACE.seed, {}, null, null, PROBE_PLACE.recipe);
  const plain = getPlanets().find((p) => p.kind === "asteroid" && p.kicker === "Rock");
  assert.ok(plain);
  const plainVx = plain.vx;
  const plainVy = plain.vy;
  const plainW = plain.orbitW ?? 0;
  assert.ok(plainW > 0);

  assert.deepEqual(chartStoryPlace(PROBE_PLACE, true), []);
  const rock = getPlanets().find((p) => p.placeRef === "rock");
  const home = getPlanets().find((p) => p.kicker === "Home");
  assert.ok(rock && home);
  assert.equal(rock.kind, "asteroid");
  assert.equal(rock.settlement, "abandoned");
  assert.equal(rock.civ, "human");
  assert.equal(padHasFuel(rock), true);
  assert.equal(padHasFuel({ settlement: "active", pad: "off" }), false);
  assert.ok((rock.orbitW ?? 0) < 0);
  assert.ok(Math.abs(rock.orbitW! + plainW) < 1e-9);
  assert.ok(Math.abs(rock.vx + plainVx) < 1e-6);
  assert.ok(Math.abs(rock.vy + plainVy) < 1e-6);

  const moon = getPlanets().find((p) => p.kind === "moon");
  assert.ok(moon);
  const parent = getPlanets().find((p) => p.id === moon.parentId);
  assert.ok(parent);
  const gap = Math.hypot(moon.x - parent.x, moon.y - parent.y);
  assert.ok((moon.orbitW ?? 0) > 0);

  const sim = createSim();
  sim.campaign = newCampaign({
    seed: getSystem().seed,
    landedId: null,
    ship: campaignShipFrom(sim.ship),
    place: PROBE_PLACE.id,
  });
  applyStoryStart(sim, PROBE_PLACE);
  assert.equal(sim.phase, "title");
  assert.equal(sim.landedId, rock.id);
  assert.notEqual(sim.landedId, home.id);
  assert.equal(sim.ship.fuel, 40);
  assert.equal(sim.ship.engineKind, "v2");
  assert.equal(sim.campaign?.checkpoint.place, "probe");
  assert.equal(sim.campaign?.checkpoint.landedId, rock.id);
  assert.equal(sim.campaign?.checkpoint.ship.fuel, 40);

  const points = listLagrangePoints(sim).filter((pt) => pt.planetId === moon.id);
  assert.ok(points.length >= 4, `moon lagrange ${points.length}`);

  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = 0;
  sim.ship.y = 0;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  const rockA = rock.orbitA ?? 0;
  const moonA = moon.orbitA ?? 0;
  for (let i = 0; i < 90; i++) stepSim(sim, 1 / 30, idle);
  const steppedRock = sim.planets.find((p) => p.placeRef === "rock");
  const steppedMoon = sim.planets.find((p) => p.id === moon.id);
  const steppedParent = sim.planets.find((p) => p.id === parent.id);
  assert.ok(steppedRock && steppedMoon && steppedParent);
  const dA = Math.atan2(Math.sin((steppedRock.orbitA ?? 0) - rockA), Math.cos((steppedRock.orbitA ?? 0) - rockA));
  assert.ok(dA < 0, `rock moved ${dA}`);
  const moonDA = Math.atan2(
    Math.sin((steppedMoon.orbitA ?? 0) - moonA),
    Math.cos((steppedMoon.orbitA ?? 0) - moonA),
  );
  assert.ok(moonDA > 0, `moon moved ${moonDA}`);
  const steppedGap = Math.hypot(steppedMoon.x - steppedParent.x, steppedMoon.y - steppedParent.y);
  assert.ok(Math.abs(steppedGap - gap) < gap * 0.2, `moon gap ${steppedGap} vs ${gap}`);

  const again = chartStoryPlace(PROBE_PLACE, true);
  assert.deepEqual(again, []);
  const second = getPlanets().find((p) => p.placeRef === "rock");
  assert.equal(second?.id, rock.id);
  assert.equal(second?.orbitW, rock.orbitW);

  createSystem(8);
  sim.planets = getPlanets().map((p) => ({ ...p }));
  rebootSim(sim);
  assert.equal(getSystem().seed, PROBE_PLACE.seed);
  assert.equal(sim.landedId, rock.id);
  assert.ok((sim.planets.find((p) => p.id === rock.id)?.orbitW ?? 0) < 0);
  assert.equal(sim.ship.engineKind, "v2");
  assert.equal(sim.ship.fuel, 40);
});

test("a retrograde moon still has Lagrange points", () => {
  createSystem(PROBE_PLACE.seed, {}, null, null, PROBE_PLACE.recipe);
  const planets = getPlanets();
  const moon = planets.find((p) => p.kind === "moon");
  assert.ok(moon?.orbitW && moon.orbitW > 0);
  moon.orbitW = -moon.orbitW;
  const parent = planets.find((p) => p.id === moon.parentId);
  assert.ok(parent);
  moon.vx = parent.vx - (moon.vx - parent.vx);
  moon.vy = parent.vy - (moon.vy - parent.vy);
  const sim = createSim();
  const points = listLagrangePoints(sim).filter((pt) => pt.planetId === moon.id);
  assert.ok(points.length >= 4, `retrograde moon lagrange ${points.length}`);
  assert.ok(points.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.vx)));
});
