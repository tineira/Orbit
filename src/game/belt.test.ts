import assert from "node:assert/strict";
import { test } from "node:test";
import { beltPhase, moteAt, moteKind, scanBeltHull } from "./belt.ts";
import { createSim, stepSim } from "./sim.ts";
import { beltBands, createSystem } from "./world.ts";

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

test("mote placement is deterministic", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const phase = beltPhase(sim.planets, belt.parentId);
  const a = moteAt(belt, parent.x, parent.y, phase, 17);
  const b = moteAt(belt, parent.x, parent.y, phase, 17);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.sz, b.sz);
  assert.equal(moteKind(a.u), a.kind);
});

test("a fast chip graze ticks the hull without a crash", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const phase = beltPhase(sim.planets, belt.parentId);
  let chip = moteAt(belt, parent.x, parent.y, phase, 0);
  for (let i = 0; i < belt.motes; i++) {
    const m = moteAt(belt, parent.x, parent.y, phase, i);
    if (m.kind === "chip") {
      chip = m;
      break;
    }
  }
  assert.equal(chip.kind, "chip");
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = chip.x + 6;
  sim.ship.y = chip.y;
  sim.ship.vx = -48;
  sim.ship.vy = 0;
  const cool = new Map<string, number>();
  const hit = scanBeltHull(sim.ship, sim.planets, cool, 0, 0);
  assert.ok(hit.ticks.length >= 1);
  assert.equal(hit.ticks[0]!.kind, "chip");
  assert.ok(hit.ticks[0]!.volume > 0.012);
  assert.ok(hit.ticks[0]!.damage > 0);
  const again = scanBeltHull(sim.ship, sim.planets, cool, hit.tickWait, 0);
  assert.equal(again.ticks.length, 0);

  sim.beltHitCool = cool;
  sim.beltTickWait = hit.tickWait;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.crashedId, null);
});

test("co-orbiting through grit stays quiet", () => {
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
  sim.ship.x = chip.x + 5;
  sim.ship.y = chip.y;
  sim.ship.vx = parent.vx + -Math.sin(chip.theta) * chip.rad * omega;
  sim.ship.vy = parent.vy + Math.cos(chip.theta) * chip.rad * omega;
  const hit = scanBeltHull(sim.ship, sim.planets, new Map(), 0, 0.05, 0);
  assert.equal(hit.ticks.length, 0);
  assert.ok(hit.dust < 0.02, `co-orbiting dust bed should be silent, got ${hit.dust}`);
});

test("away from the belt there is no grit", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  sim.ship.x = 0;
  sim.ship.y = 0;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  const hit = scanBeltHull(sim.ship, sim.planets, new Map(), 0, 0.05, 0);
  assert.equal(hit.ticks.length, 0);
  assert.equal(hit.dust, 0);
});

test("resting on a rock ticks once and re-arms only after separating", () => {
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
  const cool = new Map<string, number>();
  sim.ship.x = rock.x + 4;
  sim.ship.y = rock.y;
  sim.ship.vx = -48;
  sim.ship.vy = 0;

  // Settle: every touching mote fires its first hit, then holds.
  let wait = 0;
  let rain = 0;
  let settled = 0;
  for (let i = 0; i < 30; i++) {
    const hit = scanBeltHull(sim.ship, sim.planets, cool, wait, 1 / 60, rain);
    wait = hit.tickWait;
    rain = hit.rainWait;
    settled += hit.ticks.filter((t) => t.kind !== "dust").length;
  }
  assert.ok(settled >= 1, "expected at least one contact tick");

  // Parked in contact for 2 s: the same rock must stay silent.
  let repeats = 0;
  for (let i = 0; i < 120; i++) {
    const hit = scanBeltHull(sim.ship, sim.planets, cool, wait, 1 / 60, rain);
    wait = hit.tickWait;
    rain = hit.rainWait;
    repeats += hit.ticks.filter((t) => t.kind !== "dust").length;
  }
  assert.equal(repeats, 0, `expected no repeat ticks while touching, got ${repeats}`);

  // Separate long enough for the hold to expire, then come back.
  const backX = sim.ship.x;
  sim.ship.x = rock.x + 400;
  for (let i = 0; i < 60; i++) {
    const hit = scanBeltHull(sim.ship, sim.planets, cool, wait, 1 / 60, rain);
    wait = hit.tickWait;
    rain = hit.rainWait;
  }
  sim.ship.x = backX;
  let rehit = 0;
  for (let i = 0; i < 10; i++) {
    const hit = scanBeltHull(sim.ship, sim.planets, cool, wait, 1 / 60, rain);
    wait = hit.tickWait;
    rain = hit.rainWait;
    rehit += hit.ticks.filter((t) => t.kind !== "dust").length;
  }
  assert.ok(rehit >= 1, "expected the rock to hit again after separating");
});

test("crossing the belt peppers invisible grit at speed", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const belt = beltBands(sim.planets)[0]!;
  const parent = sim.planets.find((p) => p.id === belt.parentId)!;
  const ang = 0.4;
  const e = belt.orbitE;
  const a = belt.orbitR;
  const oneE2 = Math.max(0, 1 - e * e);
  const rr = e < 1e-8 ? a : (a * oneE2) / (1 + e * Math.cos(ang - belt.orbitPeri));
  sim.ship.x = parent.x + Math.cos(ang) * rr;
  sim.ship.y = parent.y + Math.sin(ang) * rr;
  sim.ship.vx = parent.vx + 55;
  sim.ship.vy = parent.vy;
  const cool = new Map<string, number>();
  let wait = 0;
  let rain = 0;
  let dust = 0;
  for (let i = 0; i < 50; i++) {
    const hit = scanBeltHull(sim.ship, sim.planets, cool, wait, 1 / 60, rain);
    wait = hit.tickWait;
    rain = hit.rainWait;
    dust += hit.ticks.filter((t) => t.kind === "dust").length;
  }
  assert.ok(dust >= 4, `expected invisible grit, got ${dust}`);
});
