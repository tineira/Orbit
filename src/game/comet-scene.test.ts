import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMET_CRASH_NUCLEUS,
  COMET_CRASH_ROCKS,
  COMET_ENTRY_DIST,
  COMET_ARRIVE_S,
  COMET_HOLD_S,
  COMET_SCENE_EDGE,
  COMET_SUN,
  COMET_TRAVEL,
  angleGap,
  caveFloorR,
  caveRimR,
  caveWallContact,
  nucleusRadiusAt,
  siteLit,
  COMET_VIEW_UNITS,
  COMET_VIEW_UNITS_FAR,
  cometViewUnits,
  sceneGasHits,
  NUCLEUS_GRAV_K,
  makeCometScene,
  sceneAccel,
  sceneRockHits,
  startArrival,
  stepCometScene,
  sunDot,
  surfacePoint,
  surfaceVelocity,
  type CometScene,
} from "./comet-scene.ts";
import { HULL_MAX } from "./hull.ts";
import { applyDebugComet, cometSceneScale, createSim, enterCometScene, enterWarp, gravityAt, hullSafeKind, stepSim, takeoff } from "./sim.ts";
import { createSystem, LAND_SPEED, SHIP_HULL, STEP, WARP_JUMP_SPEED } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

/** A quiet scene: no jets, outbursts or fallback, so a test sees only what it sets up. */
function quiet(scene: CometScene) {
  scene.jets = [];
  scene.rocks = [];
  scene.gas = [];
  scene.bursts = [];
  scene.p.burstEvery = 1e9;
  scene.burstClock = 1e9;
  scene.p.fallRate = 0;
  return scene;
}

function sceneSim() {
  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  enterCometScene(sim, "inbound", 42);
  quiet(sim.cometScene!);
  return sim;
}

/** Put the ship just above the ground at nucleus angle `a`, moving `rel` toward it relative to the spin. */
function hover(sim: ReturnType<typeof sceneSim>, a: number, rel: number) {
  const scene = sim.cometScene!;
  const pt = surfacePoint(scene, a, SHIP_HULL + 0.5);
  const g = surfaceVelocity(pt.x, pt.y);
  sim.ship.x = pt.x;
  sim.ship.y = pt.y;
  sim.ship.vx = g.x - Math.cos(pt.w) * rel;
  sim.ship.vy = g.y - Math.sin(pt.w) * rel;
}

test("entering the comet scene leaves the chart: nucleus frame, ship at the edge, in flight", () => {
  const sim = sceneSim();
  assert.ok(sim.cometScene);
  assert.equal(sim.phase, "flight");
  const d = Math.hypot(sim.ship.x, sim.ship.y);
  assert.ok(d > 300 && d < COMET_SCENE_EDGE, `entry distance ${d}`);
  // Heading in, almost matched.
  assert.ok(sim.ship.x * sim.ship.vx + sim.ship.y * sim.ship.vy < 0);
  assert.ok(Math.hypot(sim.ship.vx, sim.ship.vy) < 100);
});

test("warping to a comet heading opens the scene instead of a new chart", () => {
  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.warpTarget = { angle: 0, color: "#e24b3a", name: "Comet", pal: null, kind: "comet" } as never;
  enterWarp(sim);
  for (let i = 0; i < 60 * 10 && !sim.cometScene; i++) stepSim(sim, STEP, idle);
  assert.ok(sim.cometScene, "scene opened");
  assert.equal(sim.phase, "flight");
});

test("landing under 30 relative to the spinning ground sets you down; over 30 wrecks", () => {
  const soft = sceneSim();
  hover(soft, 1, LAND_SPEED - 8);
  for (let i = 0; i < 30 && soft.phase === "flight"; i++) stepSim(soft, STEP, idle);
  assert.equal(soft.phase, "landed");

  const hard = sceneSim();
  hover(hard, 1, LAND_SPEED + 12);
  for (let i = 0; i < 30 && hard.phase === "flight"; i++) stepSim(hard, STEP, idle);
  assert.equal(hard.phase, "crashed");
  assert.equal(hard.crashedId, COMET_CRASH_NUCLEUS);
});

test("rocks follow the belt rule: grit is free, a pebble hurts, a full hull survives one", () => {
  const scene = quiet(makeCometScene("inbound", 1));
  const ship = { x: 0, y: 300, vx: 0, vy: 0 };
  scene.rocks.push({ x: 0, y: 300 + SHIP_HULL, vx: 0, vy: -6, r: 4, spin: 0, w: 0, k: 1 });
  const grit = sceneRockHits(scene, ship, SHIP_HULL);
  assert.equal(grit.length, 1);
  assert.equal(grit[0]!.damage, 0);
  assert.equal(scene.rocks.length, 0, "a rock this slow crumbles on the hull");

  scene.rocks.push({ x: 0, y: 300 + SHIP_HULL, vx: 0, vy: -150, r: 8, spin: 0, w: 0, k: 2 });
  const pebble = sceneRockHits(scene, ship, SHIP_HULL);
  assert.equal(pebble[0]!.kind, "pebble");
  assert.ok(pebble[0]!.damage >= 6 && pebble[0]!.damage <= 18, `damage ${pebble[0]!.damage}`);
  assert.ok(HULL_MAX - pebble[0]!.damage > 0);
});

const ROCK_TEST_MAX_TICKS = 3;

test("rocks bounce off the hull: a graze bends the path, a head-on hit sends it back, once", () => {
  const scene = quiet(makeCometScene("inbound", 1));
  const ship = { x: 0, y: 300, vx: 0, vy: 0 };
  // Head-on, straight down onto the hull.
  scene.rocks.push({ x: 0, y: 300 + SHIP_HULL + 2, vx: 0, vy: -30, r: 4, spin: 0, w: 0, k: 1 });
  assert.equal(sceneRockHits(scene, ship, SHIP_HULL).length, 1);
  const back = scene.rocks[0]!;
  const turn = Math.acos((back.vx * 0 + back.vy * -30) / (Math.hypot(back.vx, back.vy) * 30));
  assert.ok(turn > (160 * Math.PI) / 180, `head-on turned ${(turn * 180) / Math.PI} deg`);
  assert.ok(back.vy > 0, "heading away");
  assert.equal(sceneRockHits(scene, ship, SHIP_HULL).length, 0, "it hits once, not every frame");

  // A graze: moving sideways past the edge of the hull.
  scene.rocks = [{ x: -1, y: 300 + SHIP_HULL + 3.6, vx: 40, vy: -12, r: 4, spin: 0, w: 0, k: 2 }];
  assert.equal(sceneRockHits(scene, ship, SHIP_HULL).length, 1);
  const g = scene.rocks[0]!;
  const bend = Math.acos((g.vx * 40 + g.vy * -12) / (Math.hypot(g.vx, g.vy) * Math.hypot(40, 12)));
  assert.ok(bend > 0 && bend < Math.PI / 4, `a graze bent it ${(bend * 180) / Math.PI} deg`);
});

test("a rock falling on a parked ship bounces a little, then stops ticking", () => {
  const sim = sceneSim();
  const scene = quiet(sim.cometScene!);
  sim.ship.x = 0;
  sim.ship.y = 130;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  scene.rocks.push({ x: 0, y: 130 + SHIP_HULL + 30, vx: 0, vy: -40, r: 4, spin: 0, w: 0, k: 9 });
  let ticks = 0;
  for (let i = 0; i < 60 * 6; i++) {
    ticks += sceneRockHits(scene, sim.ship, SHIP_HULL).length;
    stepCometScene(scene, STEP);
  }
  assert.ok(ticks >= 1 && ticks <= ROCK_TEST_MAX_TICKS, `${ticks} hits`);
});

test("a big rock hit hard breaks into smaller pieces that fly off", () => {
  const scene = quiet(makeCometScene("inbound", 1));
  const ship = { x: 0, y: 300, vx: 0, vy: 0 };
  scene.rocks.push({ x: 0, y: 300 + SHIP_HULL + 4, vx: 0, vy: -120, r: 9, spin: 0, w: 0, k: 7 });
  sceneRockHits(scene, ship, SHIP_HULL);
  assert.ok(scene.rocks.length >= 3, `${scene.rocks.length} pieces`);
  for (const r of scene.rocks) {
    assert.ok(r.r < 9 * 0.65, "each piece is smaller");
    assert.ok(Math.hypot(r.x - ship.x, r.y - ship.y) > r.r + SHIP_HULL, "clear of the hull");
    assert.ok((r.x - ship.x) * r.vx + (r.y - ship.y) * r.vy > 0, "flying away from the ship");
  }
  // A small or slow rock does not break.
  scene.rocks = [{ x: 0, y: 300 + SHIP_HULL + 4, vx: 0, vy: -20, r: 9, spin: 0, w: 0, k: 8 }];
  sceneRockHits(scene, ship, SHIP_HULL);
  assert.equal(scene.rocks.length, 1);
});

test("a rock landing on the nucleus leaves an impact that fades", () => {
  const scene = quiet(makeCometScene("inbound", 1));
  const pt = surfacePoint(scene, 0.5);
  scene.rocks.push({ x: pt.x + Math.cos(pt.w) * 6, y: pt.y + Math.sin(pt.w) * 6, vx: -Math.cos(pt.w) * 40, vy: -Math.sin(pt.w) * 40, r: 5, spin: 0, w: 0, k: 1 });
  for (let i = 0; i < 30 && scene.rocks.length; i++) stepCometScene(scene, STEP);
  assert.equal(scene.rocks.length, 0);
  assert.equal(scene.impacts.length, 1, "the hit shows");
  for (let i = 0; i < 120; i++) stepCometScene(scene, STEP);
  assert.equal(scene.impacts.length, 0, "and clears");
});

test("a rock strike drains the hull and only an empty hull is a crash", () => {
  const sim = sceneSim();
  const scene = sim.cometScene!;
  sim.ship.x = 0;
  sim.ship.y = 400;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  scene.rocks.push({ x: 0, y: 400 + SHIP_HULL, vx: 0, vy: -160, r: 8, spin: 0, w: 0, k: 3 });
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "flight");
  assert.ok(sim.ship.hull < HULL_MAX);
  assert.ok(sim.beltTicks.length > 0, "the hit reaches the belt audio");

  sim.ship.hull = 2;
  scene.rocks.push({ x: sim.ship.x, y: sim.ship.y + SHIP_HULL, vx: 0, vy: -160, r: 8, spin: 0, w: 0, k: 4 });
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashedId, COMET_CRASH_ROCKS);
});

test("a jet pushes inside its cone and not outside it", () => {
  const scene = quiet(makeCometScene("inbound", 5));
  scene.jets = [
    { a: 0, period: 10, phase: 0, duty: 1, power: 1, rockRate: 0, lag: 5, dark: 0, fade: 1, on: true, acc: 0 },
  ];
  const vent = surfacePoint(scene, 0);
  const inside = sceneAccel(scene, vent.x + 80, vent.y);
  const outside = sceneAccel(scene, vent.x - 10, vent.y + 200);
  const gravityOnly = (x: number, y: number) => {
    const d = Math.hypot(x, y);
    return NUCLEUS_GRAV_K / (d * d);
  };
  assert.ok(inside.ax > 0, "pushed outward along the vent");
  const outMag = Math.hypot(outside.ax, outside.ay);
  assert.ok(Math.abs(outMag - gravityOnly(vent.x - 10, vent.y + 200)) < 1e-6, "only gravity outside the cone");
});

test("thermal lag: a vent keeps spraying into the night, fades, then stops and never throws rocks there", () => {
  const scene = quiet(makeCometScene("perihelion", 9));
  // A vent pointing straight away from the sun is night from the start.
  const night = Math.atan2(0.34, 0.94);
  assert.ok(sunDot(scene, night) < -0.9);
  scene.jets = [
    { a: night, period: 1, phase: 0, duty: 1, power: 1, rockRate: 50, lag: 3, dark: 0, fade: 1, on: false, acc: 0 },
  ];
  stepCometScene(scene, STEP);
  assert.ok(scene.jets[0]!.on, "still spraying just after dark");
  assert.equal(scene.rocks.length, 0, "no rocks from a vent in the dark");
  for (let i = 0; i < 60 * 4; i++) stepCometScene(scene, STEP);
  assert.equal(scene.jets[0]!.fade, 0);
  assert.equal(scene.rocks.length, 0, "still no rocks after the whole fade");
  // Spin carries it on, but the night half lasts far longer than the lag here.
  assert.equal(scene.jets[0]!.on, false);
});

test("no hull repair on the nucleus", () => {
  const sim = sceneSim();
  hover(sim, 1, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  sim.ship.hull = 40;
  assert.equal(hullSafeKind(sim), null);
  for (let i = 0; i < 120; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.ship.hull, 40);
});

test("taking off starts the hold over, a vent under the hull throws you off and resets it, and 120 s ends in a warp", () => {
  const sim = sceneSim();
  const scene = sim.cometScene!;
  hover(sim, 1, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  for (let i = 0; i < 60; i++) stepSim(sim, STEP, idle);
  const before = scene.held;
  assert.ok(before > 0.9);

  takeoff(sim);
  assert.equal(sim.phase, "flight");
  assert.equal(scene.held, 0, "takeoff starts the hold over");

  hover(sim, 2, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  scene.jets = [
    { a: scene.site, period: 10, phase: 0, duty: 1, power: 1, rockRate: 0, lag: 99, dark: 0, fade: 1, on: true, acc: 0 },
  ];
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "flight", "a vent under the hull throws you off");
  assert.equal(scene.held, 0, "a vent throw starts it over too");

  scene.jets = [];
  hover(sim, 3, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  scene.held = COMET_HOLD_S - 0.05;
  for (let i = 0; i < 10; i++) stepSim(sim, STEP, idle);
  assert.ok(scene.done);
  takeoff(sim);
  assert.equal(sim.phase, "landed", "no takeoff while the comet is decelerating");
  for (let i = 0; i < 60 * (COMET_ARRIVE_S + 1); i++) stepSim(sim, STEP, idle);
  assert.ok(sim.cometScene, "the comet does not vanish: you stay on it");
  assert.equal(scene.arrived, true);
  assert.equal(scene.travel, 0, "the stars stop streaming");
  assert.ok(Math.hypot(scene.sun.x - COMET_TRAVEL.x, scene.sun.y - COMET_TRAVEL.y) < 1e-6, "the new star is ahead");
  assert.equal(sim.phase, "landed");
  takeoff(sim);
  assert.equal(sim.phase, "flight", "in orbit you take off when you want");
});

test("leaving the edge at warp speed is the usual lost warp, and the scene closes", () => {
  const sim = sceneSim();
  sim.ship.x = COMET_SCENE_EDGE - 1;
  sim.ship.y = 0;
  sim.ship.vx = WARP_JUMP_SPEED + 10;
  sim.ship.vy = 0;
  stepSim(sim, STEP, idle);
  assert.equal(sim.cometScene, null);
  assert.equal(sim.phase, "transit");
  assert.equal(sim.warpLost, true);
  for (let i = 0; i < 60 * 6 && sim.phase === "transit"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "crashed");
  assert.equal(sim.crashKind, "lost");
});

test("drifting past the edge slowly is lost too; reaching warp speed inside the edge is not", () => {
  const slow = sceneSim();
  slow.ship.x = COMET_SCENE_EDGE + 5;
  slow.ship.y = 0;
  slow.ship.vx = 50;
  slow.ship.vy = 0;
  stepSim(slow, STEP, idle);
  assert.equal(slow.phase, "crashed");
  assert.equal(slow.crashKind, "lost");

  const fast = sceneSim();
  fast.ship.x = 500;
  fast.ship.y = 0;
  fast.ship.vx = -WARP_JUMP_SPEED;
  fast.ship.vy = 0;
  stepSim(fast, STEP, idle);
  assert.ok(fast.cometScene);
  assert.notEqual(fast.phase, "transit");
});

/** A scene whose comet has ridden into the next system, with the ship just inside the edge going out. */
function arrivedSim() {
  const sim = sceneSim();
  const scene = sim.cometScene!;
  scene.done = true;
  startArrival(scene);
  for (let i = 0; i < 60 * (COMET_ARRIVE_S + 1); i++) stepCometScene(scene, STEP);
  assert.equal(scene.arrived, true);
  sim.phase = "flight";
  sim.ship.x = COMET_SCENE_EDGE + 1;
  sim.ship.y = 0;
  sim.ship.vx = 40;
  sim.ship.vy = 0;
  return sim;
}

test("leaving a comet in orbit flies into the new system, with the comet left there", () => {
  const sim = arrivedSim();
  const before = sim.planets;
  const zBefore = sim.camera.zoom;
  stepSim(sim, STEP, idle);
  assert.equal(sim.cometScene, null);
  assert.equal(sim.phase, "flight", "no lost warp: the comet is not running anymore");
  assert.notEqual(sim.planets, before, "a new system");
  const c = sim.comet!;
  assert.ok(c?.parked, "the comet stays in the system");
  const star = sim.planets.find((p) => p.kind === "star")!;
  const r = Math.hypot(c.x - star.x, c.y - star.y);
  // The star lies ahead of the comet, along its travel.
  assert.ok(((star.x - c.x) * COMET_TRAVEL.x + (star.y - c.y) * COMET_TRAVEL.y) / r > 0.99);
  const v = Math.hypot(c.vx - star.vx, c.vy - star.vy);
  const g = gravityAt(c.x, c.y, sim.planets, sim.gravityScale);
  assert.ok(Math.abs(v - Math.sqrt(Math.hypot(g.ax, g.ay) * r)) < 1e-6 * v + 1e-6, "a circular orbit");
  assert.ok(Math.hypot(sim.ship.x - c.x, sim.ship.y - c.y) > c.radius * 4, "the ship starts clear of it");
  // No cut: the chart camera starts where the scene's was, on the nucleus, at its zoom.
  assert.ok(Math.hypot(sim.camera.x - c.x, sim.camera.y - c.y) < 1, "camera picks up on the nucleus");
  const k = cometSceneScale(c);
  assert.ok(Math.abs(sim.camera.zoom * k - zBefore) < zBefore * 0.03, "same zoom as the scene's");
  // And it settles on the scene's exact zoom for that distance.
  for (let i = 0; i < 60 * 3; i++) {
    Object.assign(sim.ship, { x: c.x + COMET_SCENE_EDGE * k, y: c.y, vx: c.vx, vy: c.vy });
    stepSim(sim, STEP, idle);
  }
  const zExact = Math.min(sim.viewCssW, sim.viewCssH) / cometViewUnits(COMET_SCENE_EDGE);
  assert.ok(Math.abs(sim.camera.zoom * k - zExact) < zExact * 0.03, "settles on the scene's zoom");

  // One more tick on the rail keeps the velocity the ship inherited.
  const v0 = { x: c.vx, y: c.vy };
  stepSim(sim, STEP, idle);
  assert.ok(Math.hypot(c.vx - v0.x, c.vy - v0.y) < 0.01 * Math.hypot(v0.x, v0.y) + 0.01, "the rail moves the way it was launched");

  // It keeps orbiting, and stays on the chart.
  for (let i = 0; i < 60 * 30; i++) stepSim(sim, STEP, idle);
  assert.ok(sim.comet?.parked);
});

test("a parked comet stays on its orbit for good, whatever the planets do", () => {
  for (let run = 1; run <= 12; run++) {
    const sim = arrivedSim();
    stepSim(sim, STEP, idle);
    const c = sim.comet!;
    const r0 = c.parked!.r;
    // Park the ship far off so it neither re-enters nor crashes into anything.
    for (let i = 0; i < 60 * 60 * 10; i++) {
      Object.assign(sim.ship, { x: 1e7, y: 1e7, vx: 0, vy: 0 });
      stepSim(sim, STEP, idle);
    }
    assert.equal(sim.comet, c, `run ${run}: still on the chart`);
    const star = sim.planets.find((p) => p.kind === "star")!;
    assert.ok(Math.abs(Math.hypot(c.x - star.x, c.y - star.y) - r0) < 1e-6 * r0, `run ${run}: same radius`);
  }
});

test("closing in on a parked comet hands the chart camera to the scene's without a jump", () => {
  const sim = arrivedSim();
  stepSim(sim, STEP, idle);
  const c = sim.comet!;
  const k = cometSceneScale(c);
  // Just outside the crossing, drifting in with the comet.
  // Let the camera settle after leaving.
  for (let i = 0; i < 60 * 3; i++) {
    Object.assign(sim.ship, { x: c.x + COMET_SCENE_EDGE * k, y: c.y, vx: c.vx, vy: c.vy });
    stepSim(sim, STEP, idle);
  }
  const out = COMET_ENTRY_DIST * k + 0.5;
  sim.ship.x = c.x + out;
  sim.ship.y = c.y;
  sim.ship.vx = c.vx - 20;
  sim.ship.vy = c.vy;
  stepSim(sim, STEP, idle);
  assert.equal(sim.cometScene, null);
  const zChart = sim.camera.zoom;
  const onScreen = (sim.ship.x - sim.camera.x) * zChart;
  for (let i = 0; i < 10 && !sim.cometScene; i++) stepSim(sim, STEP, idle);
  assert.ok(sim.cometScene, "in the scene");
  const zScene = sim.camera.zoom;
  assert.ok(Math.abs(zChart * k - zScene) < zScene * 0.03, `zoom ${zChart * k} vs ${zScene}`);
  assert.ok(Math.abs(sim.ship.x * zScene - onScreen) < 3, "the ship stays where it was on screen");
});

test("flying back to a parked comet lands you in its scene again, in orbit", () => {
  const sim = arrivedSim();
  stepSim(sim, STEP, idle);
  const c = sim.comet!;
  const planets = sim.planets;
  sim.ship.x = c.x + c.radius * 3;
  sim.ship.y = c.y;
  sim.ship.vx = c.vx - 20;
  sim.ship.vy = c.vy;
  stepSim(sim, STEP, idle);
  const scene = sim.cometScene!;
  assert.ok(scene, "back on the comet");
  assert.equal(scene.arrived, true);
  assert.equal(scene.travel, 0);
  assert.ok(sim.ship.x > 0, "you come in from the side you were on");
  assert.ok(sim.ship.vx < 0);
  assert.equal(sim.comet, c, "the chart keeps its comet");

  sim.ship.x = COMET_SCENE_EDGE + 1;
  sim.ship.y = 0;
  sim.ship.vx = 40;
  sim.ship.vy = 0;
  stepSim(sim, STEP, idle);
  assert.equal(sim.cometScene, null);
  assert.equal(sim.planets, planets, "the same system as before, not a new one");
  assert.equal(sim.comet, c);
});

test("slow jet rocks arc back to the nucleus", () => {
  const scene = quiet(makeCometScene("inbound", 2));
  const pt = surfacePoint(scene, 0, 2);
  scene.rocks.push({ x: pt.x, y: pt.y, vx: Math.cos(pt.w) * 30, vy: Math.sin(pt.w) * 30, r: 4, spin: 0, w: 0, k: 1 });
  for (let i = 0; i < 60 * 20 && scene.rocks.length; i++) stepCometScene(scene, STEP);
  assert.equal(scene.rocks.length, 0, "it came back down");
});

test("no star gravity: the only pull is the nucleus", () => {
  const scene = quiet(makeCometScene("perihelion", 3));
  const a = sceneAccel(scene, 300, 0);
  assert.ok(Math.abs(a.ax + NUCLEUS_GRAV_K / (300 * 300)) < 1e-9);
  assert.ok(Math.abs(a.ay) < 1e-9);
});

test("the ship always comes in from behind the comet, catching up along its travel", () => {
  const sim = sceneSim();
  const d = Math.hypot(sim.ship.x, sim.ship.y);
  assert.ok((sim.ship.x * COMET_TRAVEL.x + sim.ship.y * COMET_TRAVEL.y) / d < -0.99, "behind");
  const v = Math.hypot(sim.ship.vx, sim.ship.vy);
  assert.ok((sim.ship.vx * COMET_TRAVEL.x + sim.ship.vy * COMET_TRAVEL.y) / v > 0.99, "moving with it");
});

test("the view is wide far out and closes in near the nucleus", () => {
  assert.equal(cometViewUnits(90), COMET_VIEW_UNITS);
  assert.equal(cometViewUnits(1000), COMET_VIEW_UNITS_FAR);
  assert.ok(cometViewUnits(400) > cometViewUnits(200));
});

test("loose ice only ticks; a jet blast hits like small rocks and drains the hull", () => {
  const scene = quiet(makeCometScene("inbound", 8));
  const ship = { x: 0, y: 400, vx: 0, vy: 0 };
  scene.gas.push({ x: 0, y: 401, vx: 40, vy: 0, life: 2, age: 0, b: 0, k: 0 });
  const grit = sceneGasHits(scene, ship, SHIP_HULL, STEP);
  assert.equal(grit.length, 1);
  assert.equal(grit[0]!.damage, 0);

  scene.jets = [
    { a: 0, period: 10, phase: 0, duty: 1, power: 1, rockRate: 0, lag: 5, dark: 0, fade: 1, on: true, acc: 0 },
  ];
  const vent = surfacePoint(scene, 0, 20);
  const near = { x: vent.x, y: vent.y, vx: 0, vy: 0 };
  let hull = 0;
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    for (const t of sceneGasHits(scene, near, SHIP_HULL, STEP)) {
      hull += t.damage;
      if (t.damage > 0) hits++;
    }
  }
  assert.ok(hits >= 2 && hits <= 5, `hits in a second ${hits}`);
  assert.ok(hull > 5 && hull < 30, `damage in a second ${hull}`);
  const far = { x: -vent.x, y: -vent.y, vx: 0, vy: 0 };
  assert.equal(sceneGasHits(scene, far, SHIP_HULL, STEP).filter((t) => t.damage > 0).length, 0);
});

test("?comet starts on a Lumen drive with a full tank", () => {
  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  applyDebugComet(sim, "?comet=perihelion");
  assert.ok(sim.cometScene);
  assert.equal(sim.ship.engineKind, "lumen");
  assert.equal(sim.ship.fuelKind, "lumen");
  assert.equal(sim.ship.fuel, sim.ship.fuelCapacity);
});

test("?comet&landed sets you down on the day side, and &hold skips most of the wait", () => {
  for (const kind of ["perihelion", "inbound", "marked"]) {
    createSystem(1);
    const sim = createSim();
    sim.viewCssW = 1280;
    sim.viewCssH = 800;
    applyDebugComet(sim, `?comet=${kind}&landed&hold=110`);
    const scene = sim.cometScene!;
    assert.equal(sim.phase, "landed", kind);
    assert.ok(siteLit(scene, scene.site), `${kind}: day side, out of a cave`);
    assert.ok(scene.held >= 110, kind);
    for (let i = 0; i < 60 * 11; i++) stepSim(sim, STEP, idle);
    assert.ok(scene.done, `${kind}: the hold completes, whatever the vents and rocks do`);
    assert.equal(sim.phase, "landed");
    for (let i = 0; i < 60 * (COMET_ARRIVE_S + 1); i++) stepSim(sim, STEP, idle);
    takeoff(sim);
    assert.equal(sim.phase, "flight");
    assert.equal(scene.anchored, false, "after takeoff it is the usual comet");
  }
});

test("a vent beside a landed ship lifts it instead of grinding the hull down in place", () => {
  const sim = sceneSim();
  const scene = sim.cometScene!;
  hover(sim, 1, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  scene.jets = [
    { a: scene.site + 0.3, period: 10, phase: 0, duty: 1, power: 0.8, rockRate: 0, lag: 99, dark: 0, fade: 1, on: true, acc: 0 },
  ];
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.ship.hull, HULL_MAX);
});

test("you catch the comet leaving the sun: the way in is always the day side", () => {
  const sim = sceneSim();
  const scene = sim.cometScene!;
  assert.ok(COMET_TRAVEL.x * COMET_SUN.x + COMET_TRAVEL.y * COMET_SUN.y < -0.9, "moving away from the sun");
  const a = Math.atan2(sim.ship.y, sim.ship.x) - scene.rot;
  assert.ok(sunDot(scene, a) > 0.9, "entry over the day side");
});

test("the cave on E: land on its floor, no vent, outburst or rock reaches you, and the hold runs", () => {
  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  enterCometScene(sim, "perihelion", 3);
  const scene = sim.cometScene!;
  const cave = scene.p.cave!;
  for (const j of scene.jets) assert.ok(Math.abs(angleGap(j.a, cave.a)) >= cave.half, "no vent inside the cave");
  scene.rocks = [];
  hover(sim, cave.a, 5);
  for (let i = 0; i < 30 && sim.phase === "flight"; i++) stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "landed");
  assert.ok(Math.hypot(sim.ship.x, sim.ship.y) < caveRimR(cave), "down in the shaft");
  assert.equal(siteLit(scene, scene.site), false);
  for (let i = 0; i < 60 * 20; i++) {
    stepSim(sim, STEP, idle);
    if (sim.phase !== "landed") break;
  }
  assert.equal(sim.phase, "landed", "twenty seconds of a busy perihelion and still down");
  assert.equal(sim.ship.hull, HULL_MAX);
  assert.ok(scene.held > 19);
});

test("cave walls: a slow brush slides, a hard hit wrecks", () => {
  const scene = quiet(makeCometScene("perihelion", 3));
  const cave = scene.p.cave!;
  // On the tall lip's side, above the low lip: still wall there.
  const tall = nucleusRadiusAt(cave.a - cave.half) > nucleusRadiusAt(cave.a + cave.half) ? -1 : 1;
  const high = (caveRimR(cave) + nucleusRadiusAt(cave.a + tall * cave.half)) / 2;
  const at = cave.a + tall * (cave.half - 0.02);
  assert.ok(caveWallContact(scene, Math.cos(at) * high, Math.sin(at) * high, SHIP_HULL), "the taller wall runs to its own lip");
  const r = caveFloorR(cave) + 20;
  const a = cave.a + cave.half - 0.05;
  const contact = caveWallContact(scene, Math.cos(a) * r, Math.sin(a) * r, SHIP_HULL);
  assert.ok(contact, "touching the wall");
  assert.equal(caveWallContact(scene, Math.cos(cave.a) * r, Math.sin(cave.a) * r, SHIP_HULL), null, "clear in the middle");

  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  enterCometScene(sim, "perihelion", 3);
  quiet(sim.cometScene!);
  const s = sim.cometScene!;
  const w = a + s.rot;
  const g = surfaceVelocity(Math.cos(w) * r, Math.sin(w) * r);
  sim.ship.x = Math.cos(w) * r;
  sim.ship.y = Math.sin(w) * r;
  // A slow brush: slide along it, pushed back clear, nothing into the wall left.
  sim.ship.x = Math.cos(w) * r;
  sim.ship.y = Math.sin(w) * r;
  sim.ship.vx = g.x - Math.sin(w) * 10;
  sim.ship.vy = g.y + Math.cos(w) * 10;
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "flight");
  const after = caveWallContact(s, sim.ship.x, sim.ship.y, SHIP_HULL);
  assert.ok(!after || after.depth < 0.01, "pushed back clear of the wall");
  const n = { x: Math.sin(w), y: -Math.cos(w) };
  const g2 = surfaceVelocity(sim.ship.x, sim.ship.y);
  assert.ok((sim.ship.vx - g2.x) * n.x + (sim.ship.vy - g2.y) * n.y > -1, "no speed left into the wall");

  // Straight at the wall, sideways in the shaft.
  sim.ship.vx = g.x - Math.sin(w) * 60;
  sim.ship.vy = g.y + Math.cos(w) * 60;
  stepSim(sim, STEP, idle);
  assert.equal(sim.phase, "crashed");
});

test("the way into the cave is not sheltered: above the rim a jet still reaches you", () => {
  const scene = quiet(makeCometScene("perihelion", 3));
  const cave = scene.p.cave!;
  const lipA = cave.a + cave.half + 0.04;
  scene.jets = [
    { a: lipA, period: 10, phase: 0, duty: 1, power: 1, rockRate: 0, lag: 5, dark: 0, fade: 1, on: true, acc: 0 },
  ];
  // Hovering over the mouth, in the vent's cone.
  const vent = surfacePoint(scene, lipA, 25);
  const ship = { x: vent.x, y: vent.y, vx: 0, vy: 0 };
  let dmg = 0;
  for (let i = 0; i < 60; i++) for (const t of sceneGasHits(scene, ship, SHIP_HULL, STEP)) dmg += t.damage;
  assert.ok(dmg > 0, "the approach takes hits");
  // Down on the floor the same vent does nothing.
  const floor = surfacePoint(scene, cave.a, SHIP_HULL);
  let safe = 0;
  for (let i = 0; i < 60; i++) for (const t of sceneGasHits(scene, { x: floor.x, y: floor.y, vx: 0, vy: 0 }, SHIP_HULL, STEP)) safe += t.damage;
  assert.equal(safe, 0);
});
