import assert from "node:assert/strict";
import { test } from "node:test";
import { armedEngine, burnFuel, refillFuel } from "./fuel.ts";
import { FUEL_MAIN_SECONDS, RETRO_FORCE, SHIP_FUEL, STEP, THRUST_FORCE } from "./world.ts";

const ship = (fuel = SHIP_FUEL) => ({ fuel });
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

test("main engine drains a full tank in FUEL_MAIN_SECONDS", () => {
  const s = ship();
  burnFuel(s, 1, THRUST_FORCE);
  assert.ok(Math.abs(s.fuel - (SHIP_FUEL - 1 / FUEL_MAIN_SECONDS)) < 1e-9);
  const full = ship();
  burnFuel(full, FUEL_MAIN_SECONDS, THRUST_FORCE);
  assert.equal(full.fuel, 0);
});

test("retro drains by thrust ratio", () => {
  const main = ship();
  const retro = ship();
  burnFuel(main, STEP, THRUST_FORCE);
  burnFuel(retro, STEP, RETRO_FORCE);
  const ratio = (SHIP_FUEL - retro.fuel) / (SHIP_FUEL - main.fuel);
  assert.ok(Math.abs(ratio - RETRO_FORCE / THRUST_FORCE) < 1e-9);
});

test("burn clamps at empty", () => {
  const s = ship(0.0001);
  burnFuel(s, 1, THRUST_FORCE);
  assert.equal(s.fuel, 0);
});

test("landing refill restores a full tank", () => {
  const s = ship(0.18);
  refillFuel(s);
  assert.equal(s.fuel, SHIP_FUEL);
});
