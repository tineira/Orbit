import assert from "node:assert/strict";
import { test } from "node:test";
import { asteroidLandedRadius, ASTEROID_LAND_PROTRUDE, padHasFuel, surfaceRadius, worldAngleFromLanded, wrapPi } from "./asteroid.ts";
import { createSim, listLagrangePoints, stepSim, takeoff } from "./sim.ts";
import { beginPadRefill, PAD_REFILL_RATE } from "./fuel.ts";
import { beltBands, BELT_MOTES_MAX, BELT_MOTES_MIN, chartFlagsFromSearch, createSystem, SHIP_HULL } from "./world.ts";
import type { Planet } from "./types.ts";

function shape(over: Partial<Planet> = {}): Planet {
  return {
    id: "rock-0",
    name: "Clast",
    kind: "asteroid",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 30,
    mass: 80,
    surfaceG: 2,
    landable: true,
    rotate: 0,
    spin: 0,
    colorA: "#9a9084",
    colorB: "#3e3832",
    atmo: "rgba(0,0,0,0)",
    kicker: "Rock",
    title: "Clast",
    body: "",
    matter: "asteroid-silicate",
    bulk: [],
    atmosphere: [],
    shapeSeed: 11,
    padAngle: 0,
    ...over,
  };
}

test("chart flags parse belt independently of twins", () => {
  assert.deepEqual(chartFlagsFromSearch("?twins"), { twins: "on" });
  assert.deepEqual(chartFlagsFromSearch("?belt"), { belt: true });
  assert.deepEqual(chartFlagsFromSearch("?belt=0"), { belt: false });
  assert.deepEqual(chartFlagsFromSearch("?twins=tight&belt=1"), { twins: "tight", belt: true });
});

test("?belt always charts a sparse belt with one landable primary", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sys = createSystem(seed, { belt: true });
    const rocks = sys.planets.filter((p) => p.kind === "asteroid");
    assert.ok(rocks.length >= 5 && rocks.length <= 7, `seed ${seed} count ${rocks.length}`);
    const landable = rocks.filter((p) => p.landable);
    assert.ok(landable.length >= 1 && landable.length <= 2, `seed ${seed} landable`);
    for (const p of rocks) {
      assert.equal(p.atmosphere.length, 0, p.name);
      assert.ok(p.shapeSeed != null, p.name);
      if (!p.landable) {
        assert.equal(p.kicker, "Shard");
        assert.equal(p.deny, "Too small to land");
      }
    }
    assert.ok(landable.some((p) => p.radius >= 26));
  }
});

test("belt=false never charts asteroids", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sys = createSystem(seed, { belt: false });
    assert.equal(sys.planets.some((p) => p.kind === "asteroid"), false, String(seed));
  }
});

test("belt dust density varies by chart between min and max", () => {
  const counts = new Set<number>();
  for (let seed = 1; seed <= 20; seed++) {
    const sys = createSystem(seed, { belt: true });
    const bands = beltBands(sys.planets);
    assert.equal(bands.length, 1, String(seed));
    const n = bands[0]!.motes;
    assert.ok(n >= BELT_MOTES_MIN && n <= BELT_MOTES_MAX, `seed ${seed} motes ${n}`);
    counts.add(n);
  }
  assert.ok(counts.size > 1);
});

test("asteroids do not host Lagrange points", () => {
  createSystem(3, { belt: true });
  const sim = createSim();
  for (const pt of listLagrangePoints(sim)) {
    const host = sim.planets.find((p) => p.id === pt.planetId);
    assert.ok(host);
    assert.notEqual(host!.kind, "asteroid");
  }
});

test("lump radius stays near the mean and flattens on one face", () => {
  const p = shape({ padAngle: 0, rotate: 0, shapeSeed: 19 });
  const pad = surfaceRadius(p, 0);
  const far = surfaceRadius(p, Math.PI);
  assert.ok(pad < p.radius * 1.05);
  assert.ok(far > pad);
  assert.ok(pad > p.radius * 0.68);
  assert.ok(far <= p.radius * 1.22 + 1e-9);
});

test("a landed craft sits with about 30% past the local surface", () => {
  const p = shape({ radius: 34, padAngle: 0, rotate: 0, shapeSeed: 19 });
  const surface = surfaceRadius(p, 0);
  const at = asteroidLandedRadius(p, 0);
  assert.ok(at < surface);
  const noseOut = at + 13 - surface;
  assert.ok(Math.abs(noseOut / 23 - ASTEROID_LAND_PROTRUDE) < 0.02);
});

test("a landed craft tracks the body's spin", () => {
  createSystem(1);
  const sim = createSim();
  const home = sim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  sim.phase = "landed";
  sim.landedId = home!.id;
  const ang0 = sim.landedAngle;
  const rot0 = home!.rotate;
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  const body = sim.planets.find((p) => p.id === home!.id)!;
  assert.ok(Math.abs(body.rotate - rot0 - (sim.landedAngle - ang0)) < 1e-6);
  assert.ok(Math.abs(body.rotate - rot0 - body.spin) < 1e-6);
});

test("landedAngle 0 is world-up", () => {
  assert.ok(Math.abs(worldAngleFromLanded(0) + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(worldAngleFromLanded(Math.PI / 2)) < 1e-9);
});

test("a landed craft stays nested on a spinning asteroid", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const rock = sim.planets.find((p) => p.kind === "asteroid" && p.landable);
  assert.ok(rock);
  rock!.spin = 0.8;
  sim.phase = "landed";
  sim.landedId = rock!.id;
  sim.landedAngle = 0.4;
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  const body = sim.planets.find((p) => p.id === rock!.id)!;
  const dx = sim.ship.x - body.x;
  const dy = sim.ship.y - body.y;
  const d = Math.hypot(dx, dy);
  const want = asteroidLandedRadius(body, Math.atan2(dy, dx));
  assert.ok(Math.abs(d - want) < 1e-6);
});

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

test("takeoff from an asteroid ignores hull until the craft is clear", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const rock = sim.planets.find((p) => p.kind === "asteroid" && p.landable);
  assert.ok(rock);
  sim.phase = "landed";
  sim.landedId = rock!.id;
  sim.landedAngle = 0.4;
  stepSim(sim, 0, idle);
  takeoff(sim);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.takeoffIgnoreId, rock!.id);
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.crashedId, null);
  const body = sim.planets.find((p) => p.id === rock!.id)!;
  const dx = sim.ship.x - body.x;
  const dy = sim.ship.y - body.y;
  const d = Math.hypot(dx, dy);
  const min = surfaceRadius(body, Math.atan2(dy, dx)) + SHIP_HULL;
  assert.ok(d < min);
  sim.ship.x = body.x + 4000;
  sim.ship.y = body.y;
  stepSim(sim, 0, idle);
  assert.equal(sim.takeoffIgnoreId, null);
  sim.ship.x = body.x;
  sim.ship.y = body.y;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashedId, rock!.id);
});

test("a slow hit on a shard still crashes; it is not a pad", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const shard = sim.planets.find((p) => p.kind === "asteroid" && !p.landable);
  assert.ok(shard);
  sim.phase = "flight";
  sim.landedId = null;
  sim.orbitLockId = null;
  const body = sim.planets.find((p) => p.id === shard!.id)!;
  sim.ship.x = body.x + body.radius + SHIP_HULL * 0.4;
  sim.ship.y = body.y;
  sim.ship.vx = body.vx;
  sim.ship.vy = body.vy;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashedId, shard!.id);
});

test("empty rocks do not pump methane; camps do", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const rock = sim.planets.find((p) => p.kind === "asteroid" && p.landable);
  assert.ok(rock);
  rock!.kicker = "Rock";
  sim.phase = "landed";
  sim.landedId = rock!.id;
  sim.ship.fuel = 10;
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  assert.equal(sim.ship.fuel, 10);

  rock!.kicker = "Camp";
  beginPadRefill(sim.ship);
  stepSim(sim, 1, {
    steer: 0,
    forward: false,
    reverse: false,
    aimYaw: null,
    aimThrust: false,
  });
  assert.ok(Math.abs(sim.ship.fuel - (10 + PAD_REFILL_RATE)) < 1e-6);
});

test("padHasFuel is only camps on asteroids", () => {
  assert.equal(padHasFuel({ kind: "rocky", kicker: "Home" }), true);
  assert.equal(padHasFuel({ kind: "asteroid", kicker: "Rock" }), false);
  assert.equal(padHasFuel({ kind: "asteroid", kicker: "Camp" }), true);
  assert.equal(padHasFuel({ kind: "asteroid", kicker: "Shard" }), false);
});

test("wrapPi stays in (-pi, pi]", () => {
  assert.ok(Math.abs(wrapPi(Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapPi(Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapPi(0)) < 1e-12);
  assert.ok(Math.abs(wrapPi(3 * Math.PI) - Math.PI) < 1e-9 || Math.abs(wrapPi(3 * Math.PI) + Math.PI) < 1e-9);
});
