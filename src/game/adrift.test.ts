import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIRLOCK_DELAY_MS,
  FOOD_MONTH_MS,
  FOOD_MONTHS_MAX,
  FOOD_MONTHS_MIN,
  beginAdrift,
  splitFoodClock,
} from "./adrift.ts";
import { createSim, openAirLock, stepSim } from "./sim.ts";
import { createSystem, LAND_SPEED, SHIP_HULL, WARP_JUMP_SPEED } from "./world.ts";

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

function flightOn(sim: ReturnType<typeof createSim>) {
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.orbitLockId = null;
  sim.lagrangeLockKey = null;
  sim.crashedId = null;
  sim.crashKind = null;
  sim.adrift = false;
  sim.adriftStartedAt = 0;
  sim.foodUntil = 0;
}

function homeOf(sim: ReturnType<typeof createSim>) {
  const home = sim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  return home;
}

test("food clock splits years months days hours minutes seconds", () => {
  const month = 30 * 24 * 3600 * 1000;
  const parts = splitFoodClock(
    2 * 12 * month + 5 * month + 14 * 24 * 3600 * 1000 + 8 * 3600 * 1000 + 7 * 60 * 1000 + 6 * 1000,
  );
  assert.equal(parts.years, 2);
  assert.equal(parts.months, 5);
  assert.equal(parts.days, 14);
  assert.equal(parts.hours, 8);
  assert.equal(parts.minutes, 7);
  assert.equal(parts.seconds, 6);
});

test("empty tank in flight starts a rations clock between 8 and 12 months", () => {
  createSystem(3);
  const sim = createSim();
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = 8000;
  sim.ship.y = 8000;
  sim.ship.vx = 12;
  sim.ship.vy = -4;
  const before = Date.now();
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.adrift, true);
  assert.equal(sim.phase, "flight");
  const span = sim.foodUntil - sim.adriftStartedAt;
  assert.ok(span >= FOOD_MONTHS_MIN * FOOD_MONTH_MS);
  assert.ok(span < FOOD_MONTHS_MAX * FOOD_MONTH_MS);
  assert.ok(sim.adriftStartedAt >= before - 50);
});

test("adrift ignores yaw and thrust", () => {
  createSystem(3);
  const sim = createSim();
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = 8000;
  sim.ship.y = 8000;
  sim.ship.vx = 20;
  sim.ship.vy = 0;
  sim.ship.yaw = 0.4;
  stepSim(sim, 1 / 60, idle);
  const yaw = sim.ship.yaw;
  const vx = sim.ship.vx;
  stepSim(sim, 1 / 60, { steer: 1, forward: true, reverse: false, aimYaw: 1.2, aimThrust: true });
  assert.equal(sim.ship.yaw, yaw);
  assert.equal(sim.ship.thrusting, false);
  assert.ok(Math.abs(sim.ship.vx - vx) < 2);
});

test("a slow pad approach still saves an adrift craft", () => {
  createSystem(3);
  const sim = createSim();
  const home = homeOf(sim);
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = home.x;
  sim.ship.y = home.y - (home.radius + SHIP_HULL * 0.4);
  sim.ship.vx = home.vx;
  sim.ship.vy = home.vy;
  beginAdrift(sim, Date.now(), () => 0);
  assert.equal(sim.adrift, true);
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.landedId, home.id);
  assert.equal(sim.adrift, false);
  assert.ok(LAND_SPEED > 0);
});

test("a hard hit during adrift is still a crash", () => {
  createSystem(3);
  const sim = createSim();
  const home = homeOf(sim);
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = home.x;
  sim.ship.y = home.y;
  sim.ship.vx = home.vx + 220;
  sim.ship.vy = home.vy;
  beginAdrift(sim, Date.now(), () => 0);
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashKind, "wreck");
  assert.equal(sim.adrift, false);
});

test("adrift does not warp even at jump speed", () => {
  createSystem(3);
  const sim = createSim();
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = 20000;
  sim.ship.y = 20000;
  sim.ship.vx = 0;
  sim.ship.vy = WARP_JUMP_SPEED + 40;
  beginAdrift(sim, Date.now(), () => 0);
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.adrift, true);
});

test("open air lock is dead until a minute has passed", () => {
  createSystem(3);
  const sim = createSim();
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = 8000;
  sim.ship.y = 8000;
  beginAdrift(sim, Date.now(), () => 0);
  assert.equal(openAirLock(sim), false);
  assert.equal(sim.phase, "flight");
  sim.adriftStartedAt = Date.now() - AIRLOCK_DELAY_MS;
  assert.equal(openAirLock(sim), true);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashKind, "airlock");
  assert.ok(sim.lostCopy);
  assert.equal(sim.adrift, false);
});

test("waiting out the rations clock is a starve death", () => {
  createSystem(3);
  const sim = createSim();
  flightOn(sim);
  sim.ship.fuel = 0;
  sim.ship.x = 8000;
  sim.ship.y = 8000;
  sim.ship.vx = 8;
  sim.ship.vy = 2;
  beginAdrift(sim, Date.now(), () => 0);
  sim.foodUntil = Date.now() - 1;
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashKind, "starve");
  assert.ok(sim.lostCopy);
  assert.equal(sim.adrift, false);
});
