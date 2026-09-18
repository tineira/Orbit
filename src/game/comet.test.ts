import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMET_CROSS_MAX_S,
  COMET_CROSS_MIN_S,
  COMET_NUCLEUS_R,
  COMET_PERI_CLEAR,
  COMET_RED,
  makeCometHeading,
  separateCometHeading,
  spawnComet,
  warpHeadings,
} from "./comet.ts";
import {
  createSim,
  enterWarp,
  gravityAt,
  rebootSim,
  resetCometChart,
  stepComet,
  stepSim,
  takeoff,
  trySpawnComet,
} from "./sim.ts";
import {
  angDiff,
  createSystem,
  getMinimapWorldR,
  getSystem,
  HEADING_MIN_SEP,
  headingVec,
  lockedNearby,
  WARP_AIM_DEG,
  WARP_JUMP_SPEED,
} from "./world.ts";

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function boot(seed = 1) {
  createSystem(seed);
  return createSim();
}

function fly(sim: ReturnType<typeof createSim>) {
  if (sim.phase === "title" || sim.phase === "landed") takeoff(sim);
}

const starPal: [string, string, string] = ["#fff", "#fff", "#fff"];

function starHeading(angle: number, name = "Ember") {
  return { angle, color: "#fff", pal: starPal, name, kind: "star" as const };
}

function parkShip(sim: ReturnType<typeof createSim>) {
  sim.ship.x = 28000;
  sim.ship.y = 28000;
  sim.ship.vx = 0;
  sim.ship.vy = 0;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.adrift = false;
}

function aimShip(sim: ReturnType<typeof createSim>, angle: number, speed: number) {
  const v = headingVec(angle);
  sim.ship.x = v.x * 22000;
  sim.ship.y = v.y * 22000;
  sim.ship.vx = v.x * speed;
  sim.ship.vy = v.y * speed;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.adrift = false;
}

test("trySpawnComet fires once then is spent", () => {
  const sim = boot(1);
  sim.phase = "landed";
  assert.equal(trySpawnComet(sim), true);
  assert.equal(sim.cometSpent, true);
  assert.ok(sim.comet);
  assert.equal(sim.cometEntered, false);
  assert.equal(trySpawnComet(sim), false);
  assert.equal(sim.cometSpent, true);
});

test("trySpawnComet ignores title, transit, and crashed without spending", () => {
  const sim = boot(2);
  assert.equal(sim.phase, "title");
  assert.equal(trySpawnComet(sim), false);
  assert.equal(sim.cometSpent, false);
  assert.equal(sim.comet, null);

  sim.phase = "transit";
  assert.equal(trySpawnComet(sim), false);
  assert.equal(sim.cometSpent, false);

  sim.phase = "crashed";
  assert.equal(trySpawnComet(sim), false);
  assert.equal(sim.cometSpent, false);
  assert.equal(sim.comet, null);
});

test("rebootSim does not restock a spent comet", () => {
  const sim = boot(3);
  sim.phase = "landed";
  assert.equal(trySpawnComet(sim), true);
  const actor = sim.comet;
  rebootSim(sim);
  assert.equal(sim.cometSpent, true);
  assert.equal(sim.comet, actor);
  assert.equal(trySpawnComet(sim), false);
});

test("createSim resets comet chart state", () => {
  const sim = boot(4);
  sim.phase = "landed";
  assert.equal(trySpawnComet(sim), true);
  const next = createSim();
  assert.equal(next.comet, null);
  assert.equal(next.cometSpent, false);
  assert.equal(next.cometHeading, null);
  assert.equal(next.cometEntered, false);
});

test("star punchWarp resets comet chart state", () => {
  const sim = boot(5);
  fly(sim);
  assert.equal(trySpawnComet(sim), true);
  sim.reducedMotion = true;
  enterWarp(sim);
  for (let i = 0; i < 180 && !sim.transitPunched; i++) stepSim(sim, 1 / 60, idle);
  assert.equal(sim.transitPunched, true);
  assert.equal(sim.comet, null);
  assert.equal(sim.cometSpent, false);
  assert.equal(sim.cometHeading, null);
  assert.equal(sim.cometEntered, false);
});

test("spawn does not change planet ids, gravity, or the planet list", () => {
  const sim = boot(6);
  fly(sim);
  const ids = sim.planets.map((p) => p.id);
  const g0 = gravityAt(sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale);
  assert.equal(trySpawnComet(sim), true);
  assert.deepEqual(
    sim.planets.map((p) => p.id),
    ids,
  );
  const g1 = gravityAt(sim.ship.x, sim.ship.y, sim.planets, sim.gravityScale);
  assert.equal(g1.ax, g0.ax);
  assert.equal(g1.ay, g0.ay);
  assert.ok(sim.comet);
  assert.ok(!sim.planets.some((p) => p.x === sim.comet!.x && p.y === sim.comet!.y));
});

function integrateFlyby(planets: ReturnType<typeof boot>["planets"], rng: () => number) {
  const c = spawnComet(planets, rng);
  const star = planets.find((p) => p.kind === "star")!;
  const R = getMinimapWorldR();
  const floor = COMET_PERI_CLEAR(star);
  const speed = Math.hypot(c.vx, c.vy);
  const T = (2 * R) / speed;
  assert.ok(Math.hypot(c.x, c.y) > R, "spawn starts outside the minimap");
  assert.ok(
    T >= COMET_CROSS_MIN_S - 1e-6 && T <= COMET_CROSS_MAX_S + 1e-6,
    `spawn T=${T.toFixed(2)} not in 6–10s`,
  );
  let minD = Infinity;
  let enteredAt: number | null = null;
  let exitedAt: number | null = null;
  const dt = 1 / 60;
  let t = 0;
  for (let i = 0; i < 60 * 20; i++) {
    stepComet(c, planets, 1, 1, dt);
    t += dt;
    const r = Math.hypot(c.x, c.y);
    const d = Math.hypot(c.x - star.x, c.y - star.y);
    if (d < minD) minD = d;
    if (enteredAt == null && r <= R) enteredAt = t;
    if (enteredAt != null && r > R) {
      exitedAt = t;
      break;
    }
  }
  return { minD, floor, enteredAt, exitedAt, T, radius: COMET_NUCLEUS_R };
}

test("integrated periapsis stays outside COMET_PERI_CLEAR on seeds 1–48", () => {
  for (let seed = 1; seed <= 48; seed++) {
    const sim = boot(seed);
    const flyby = integrateFlyby(sim.planets, rngFrom(seed * 997 + 13));
    assert.ok(
      flyby.minD >= flyby.floor - 1e-6,
      `seed ${seed}: minD=${flyby.minD.toFixed(2)} floor=${flyby.floor.toFixed(2)}`,
    );
    assert.ok(flyby.enteredAt != null && flyby.exitedAt != null, `seed ${seed} never crossed`);
    const chord = flyby.exitedAt! - flyby.enteredAt!;
    assert.ok(
      chord >= 3 && chord <= 14,
      `seed ${seed}: chord ${chord.toFixed(2)}s (T=${flyby.T.toFixed(2)}) not in 6–10s ± gravity slack`,
    );
  }
});

test("tight-star radius 300 still clears periapsis", () => {
  const sim = boot(7);
  const star = sim.planets.find((p) => p.kind === "star")!;
  star.radius = 300;
  const flyby = integrateFlyby(sim.planets, rngFrom(77));
  assert.ok(
    flyby.minD >= flyby.floor - 1e-6,
    `minD=${flyby.minD.toFixed(2)} floor=${flyby.floor.toFixed(2)}`,
  );
});

test("separateCometHeading keeps a clear exit bearing", () => {
  const nearby = [starHeading(0, "A"), starHeading(Math.PI, "B")];
  const trueAngle = Math.PI / 2;
  assert.equal(separateCometHeading(trueAngle, nearby), trueAngle);
});

test("true exit on a star heading still yields a legal comet token", () => {
  const star = starHeading(1.2);
  const tokenAngle = separateCometHeading(star.angle, [star]);
  assert.notEqual(tokenAngle, star.angle);
  assert.ok(angDiff(tokenAngle, star.angle) >= HEADING_MIN_SEP);
  assert.ok(tokenAngle > star.angle);
  const token = makeCometHeading(tokenAngle);
  assert.equal(token.kind, "comet");
  assert.equal(token.name, "Comet");
  assert.equal(token.color, COMET_RED);
  const headings = warpHeadings([star], token);
  const v = headingVec(token.angle);
  const hit = lockedNearby(v.x, v.y, headings, WARP_AIM_DEG);
  assert.equal(hit, token);
  assert.equal(hit?.kind, "comet");
});

test("leftover heading stays HEADING_MIN_SEP from every star", () => {
  const sim = boot(11);
  fly(sim);
  parkShip(sim);
  const R = getMinimapWorldR();
  sim.comet = {
    x: R - 5,
    y: 0,
    vx: 5000,
    vy: 0,
    radius: COMET_NUCLEUS_R,
    mass: 1,
  };
  sim.cometEntered = true;
  sim.cometSpent = true;
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.comet, null);
  assert.ok(sim.cometHeading);
  assert.equal(sim.cometHeading.kind, "comet");
  assert.equal(sim.cometHeading.name, "Comet");
  for (const n of sim.nearby) {
    assert.ok(
      angDiff(sim.cometHeading.angle, n.angle) >= HEADING_MIN_SEP,
      `sep ${angDiff(sim.cometHeading.angle, n.angle)} vs star ${n.angle}`,
    );
  }
  const v = headingVec(sim.cometHeading.angle);
  const hit = lockedNearby(v.x, v.y, warpHeadings(sim.nearby, sim.cometHeading), WARP_AIM_DEG);
  assert.equal(hit, sim.cometHeading);
  assert.equal(hit?.kind, "comet");
});

test("leftover comet heading persists across rebootSim", () => {
  const sim = boot(8);
  fly(sim);
  parkShip(sim);
  assert.equal(trySpawnComet(sim), true);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 20; i++) {
    stepSim(sim, dt, idle);
    if (sim.cometHeading && !sim.comet) break;
  }
  assert.ok(sim.cometHeading);
  assert.equal(sim.comet, null);
  const heading = sim.cometHeading;
  rebootSim(sim);
  assert.equal(sim.cometHeading, heading);
  assert.equal(sim.cometHeading?.kind, "comet");
  assert.equal(sim.cometSpent, true);
});

test("warp commit at comet heading stays on this chart", () => {
  const sim = boot(9);
  fly(sim);
  const heading = makeCometHeading(separateCometHeading(0.3, sim.nearby));
  sim.cometHeading = heading;
  const seed = getSystem().seed;
  aimShip(sim, heading.angle, WARP_JUMP_SPEED);
  stepSim(sim, 1 / 60, idle);
  assert.equal(getSystem().seed, seed);
  assert.equal(sim.phase, "flight");
  assert.equal(sim.warpLost, false);
  assert.equal(sim.warpTarget, heading);
  assert.ok(Math.hypot(sim.ship.vx, sim.ship.vy) < WARP_JUMP_SPEED);
});

test("warp commit at a star heading still warps", () => {
  const sim = boot(10);
  fly(sim);
  const star = sim.nearby[0];
  assert.ok(star);
  sim.cometHeading = makeCometHeading(separateCometHeading(star.angle + Math.PI, sim.nearby));
  aimShip(sim, star.angle, WARP_JUMP_SPEED);
  stepSim(sim, 1 / 60, idle);
  assert.equal(sim.phase, "transit");
  assert.equal(sim.warpLost, false);
  assert.equal(sim.warpTarget?.kind, "star");
});

function waitForCometEnter(sim: ReturnType<typeof createSim>) {
  const R = getMinimapWorldR();
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 20; i++) {
    if (sim.cometEntered) return;
    stepSim(sim, dt, idle);
  }
  const r = sim.comet ? Math.hypot(sim.comet.x, sim.comet.y) : NaN;
  throw new Error(`comet never entered R=${R} r=${r} entered=${sim.cometEntered}`);
}

test("cometEntered is false while spawn is outside R, then sticky after inward crossing", () => {
  const sim = boot(12);
  fly(sim);
  parkShip(sim);
  assert.equal(trySpawnComet(sim), true);
  const R = getMinimapWorldR();
  assert.ok(sim.comet);
  assert.ok(Math.hypot(sim.comet.x, sim.comet.y) > R);
  assert.equal(sim.cometEntered, false);
  waitForCometEnter(sim);
  assert.equal(sim.cometEntered, true);
  const stillInside = !!sim.comet && Math.hypot(sim.comet.x, sim.comet.y) <= R;
  assert.ok(stillInside || sim.cometEntered);
  for (let i = 0; i < 8; i++) stepSim(sim, 1 / 60, idle);
  assert.equal(sim.cometEntered, true);
  for (let i = 0; i < 60 * 20 && sim.comet; i++) stepSim(sim, 1 / 60, idle);
  assert.equal(sim.comet, null);
  assert.equal(sim.cometEntered, true);
});

test("reducedMotion does not skip the cometEntered flag", () => {
  const sim = boot(13);
  fly(sim);
  parkShip(sim);
  sim.reducedMotion = true;
  assert.equal(trySpawnComet(sim), true);
  assert.equal(sim.cometEntered, false);
  waitForCometEnter(sim);
  assert.equal(sim.cometEntered, true);
});

test("resetCometChart and star punch clear cometEntered", () => {
  const sim = boot(14);
  fly(sim);
  parkShip(sim);
  assert.equal(trySpawnComet(sim), true);
  waitForCometEnter(sim);
  assert.equal(sim.cometEntered, true);
  resetCometChart(sim);
  assert.equal(sim.cometEntered, false);
  assert.equal(sim.comet, null);
  assert.equal(sim.cometSpent, false);
  assert.equal(sim.cometHeading, null);

  assert.equal(trySpawnComet(sim), true);
  waitForCometEnter(sim);
  assert.equal(sim.cometEntered, true);
  sim.reducedMotion = true;
  enterWarp(sim);
  for (let i = 0; i < 180 && !sim.transitPunched; i++) stepSim(sim, 1 / 60, idle);
  assert.equal(sim.transitPunched, true);
  assert.equal(sim.cometEntered, false);
  assert.equal(sim.comet, null);
  assert.equal(sim.cometSpent, false);
});
