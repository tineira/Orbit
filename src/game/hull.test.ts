import assert from "node:assert/strict";
import { test } from "node:test";
import { beltPhase, moteAt, scanBeltHull } from "./belt.ts";
import {
  HULL_MAX,
  hullDamage,
  hullRepairRate,
  repairHull,
} from "./hull.ts";
import { bodyMu, createSim, enterWarp, stepSim } from "./sim.ts";
import { beltBands, createSystem, orbitShellAlts, ORBIT_LOCK_DWELL, STEP } from "./world.ts";
import type { Planet } from "./types.ts";

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
}

function circularAround(sim: ReturnType<typeof createSim>, p: Planet, alt: number) {
  const parent = p.parentId ? sim.planets.find((b) => b.id === p.parentId) : undefined;
  let ux = 1;
  let uy = 0;
  if (parent) {
    const dx = p.x - parent.x;
    const dy = p.y - parent.y;
    const d = Math.hypot(dx, dy) || 1;
    ux = dx / d;
    uy = dy / d;
  }
  const r = p.radius + alt;
  sim.ship.x = p.x + ux * r;
  sim.ship.y = p.y + uy * r;
  const v = Math.sqrt(Math.max(0, bodyMu(p, sim.gravityScale) / r));
  sim.ship.vx = p.vx + -uy * v;
  sim.ship.vy = p.vy + ux * v;
  flightOn(sim);
  sim.orbitLockCooldown = 0;
  sim.orbitDwell = 0;
}

test("dust never spends hull; a full hull survives one pebble", () => {
  assert.equal(hullDamage("dust", 12, 80), 0);
  assert.equal(hullDamage("chip", 4, 8), 0);
  const chip = hullDamage("chip", 4, 48);
  const pebble = hullDamage("pebble", 15, 80);
  assert.ok(chip > 0 && chip < 5, `chip ${chip}`);
  assert.ok(pebble > chip, `pebble ${pebble} vs chip ${chip}`);
  assert.ok(pebble < HULL_MAX);
  assert.ok(hullDamage("pebble", 15, 80) > hullDamage("pebble", 6, 48));
  assert.ok(hullDamage("pebble", 10, 80) > hullDamage("pebble", 10, 20));
});

test("repair is fastest on the pad, slower in orbit, slowest at Lagrange", () => {
  assert.ok(hullRepairRate("landed") > hullRepairRate("orbit"));
  assert.ok(hullRepairRate("orbit") > hullRepairRate("lagrange"));
  assert.equal(repairHull(40, 0, "landed"), 40);
  const land = repairHull(0, HULL_MAX / hullRepairRate("landed"), "landed");
  assert.ok(Math.abs(land - HULL_MAX) < 1e-6);
});

test("a fast chip graze spends hull without a crash", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const phase = beltPhase(sim.planets, belt.parentId);
  const chip = (() => {
    for (let i = 0; i < belt.motes; i++) {
      const m = moteAt(belt, parent.x, parent.y, phase, i);
      if (m.kind === "chip") return m;
    }
    throw new Error("no chip");
  })();
  flightOn(sim);
  sim.ship.x = chip.x + 6;
  sim.ship.y = chip.y;
  sim.ship.vx = -48;
  sim.ship.vy = 0;
  const before = sim.ship.hull;
  stepSim(sim, STEP, idle);
  assert.ok(sim.ship.hull < before, `hull ${sim.ship.hull}`);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.crashedId, null);
});

test("co-orbiting grit does not spend hull", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const phase = beltPhase(sim.planets, belt.parentId);
  const chip = (() => {
    for (let i = 0; i < belt.motes; i++) {
      const m = moteAt(belt, parent.x, parent.y, phase, i);
      if (m.kind === "chip") return m;
    }
    throw new Error("no chip");
  })();
  const lead = sim.planets.find((p) => p.kind === "asteroid" && p.parentId === belt.parentId)!;
  const dx = lead.x - parent.x;
  const dy = lead.y - parent.y;
  const r2 = dx * dx + dy * dy;
  const omega = (dx * (lead.vy - parent.vy) - dy * (lead.vx - parent.vx)) / r2;
  flightOn(sim);
  sim.ship.x = chip.x + 5;
  sim.ship.y = chip.y;
  sim.ship.vx = parent.vx + -Math.sin(chip.theta) * chip.rad * omega;
  sim.ship.vy = parent.vy + Math.cos(chip.theta) * chip.rad * omega;
  const hit = scanBeltHull(sim.ship, sim.planets, new Map(), 0, STEP, 0);
  const spent = hit.ticks.reduce((n, t) => n + t.damage, 0);
  assert.equal(spent, 0);
  stepSim(sim, STEP, idle);
  assert.equal(sim.ship.hull, HULL_MAX);
});

test("hull zero in the belt is a wreck with no body", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const phase = beltPhase(sim.planets, belt.parentId);
  const rock = (() => {
    for (let i = 0; i < belt.motes; i++) {
      const m = moteAt(belt, parent.x, parent.y, phase, i);
      if (m.kind === "pebble") return m;
    }
    throw new Error("no pebble");
  })();
  flightOn(sim);
  sim.ship.hull = 2;
  sim.ship.x = rock.x + 4;
  sim.ship.y = rock.y;
  sim.ship.vx = -48;
  sim.ship.vy = 0;
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashKind, "wreck");
  assert.equal(sim.crashedId, null);
  assert.equal(sim.ship.hull, 0);
});

test("a landed craft repairs faster than a locked orbit", () => {
  createSystem(1, { belt: true });
  const landed = createSim();
  landed.phase = "landed";
  landed.padZoomLock = false;
  landed.ship.hull = 40;
  assert.ok(landed.landedId);

  const orbit = createSim();
  const planet = orbit.planets.find((p) => p.kind === "rocky" && p.landable)!;
  const { minAlt, maxAlt } = orbitShellAlts(planet, orbit.planets);
  const alt = Math.min(maxAlt - 8, Math.max(minAlt + 6, 80));
  circularAround(orbit, planet, alt);
  const nLock = Math.ceil((ORBIT_LOCK_DWELL + 0.2) / STEP);
  for (let i = 0; i < nLock; i++) stepSim(orbit, STEP, idle);
  assert.equal(orbit.orbitLockId, planet.id);
  orbit.ship.hull = 40;

  for (let i = 0; i < 60; i++) {
    stepSim(landed, STEP, idle);
    stepSim(orbit, STEP, idle);
  }
  assert.ok(landed.ship.hull > 40, `landed ${landed.ship.hull}`);
  assert.ok(orbit.ship.hull > 40, `orbit ${orbit.ship.hull}`);
  assert.ok(orbit.orbitLockId, "orbit lock held");
  assert.ok(landed.ship.hull > orbit.ship.hull, `${landed.ship.hull} vs ${orbit.ship.hull}`);
});

test("flight does not repair", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  flightOn(sim);
  sim.ship.hull = 40;
  sim.ship.x = 80000;
  sim.ship.y = 0;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  for (let i = 0; i < 30; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.ship.hull, 40);
  assert.equal(sim.phase, "flight");
});

test("warp keeps hull", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  flightOn(sim);
  sim.ship.hull = 55;
  sim.ship.vx = 0;
  sim.ship.vy = -80;
  enterWarp(sim);
  assert.equal(sim.ship.hull, 55);
  assert.equal(sim.phase, "transit");
});
