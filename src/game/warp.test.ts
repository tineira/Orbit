import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSystem,
  headingVec,
  isGhostBody,
  lockedNearby,
  playFlagsFromSearch,
  debugWarpDir,
  pickWarpArrival,
  SHIP_HULL,
  transitBeat,
  transitArriveU,
  flightStarStreak,
  warpApproach,
  warpBrakeTravel,
  warpCharge,
  warpSpool,
  WARP_AIM_DEG,
  WARP_BRAKE,
  WARP_BRAKE_SPEED,
  WARP_FLIGHT_STREAK,
  WARP_LAUNCH,
  WARP_STREAK,
  WARP_TUNNEL,
} from "./world.ts";

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("warp charge is empty below 1000 and full at 1500", () => {
  assert.equal(warpCharge(0), 0);
  assert.equal(warpCharge(999), 0);
  assert.equal(warpCharge(1000), 0);
  assert.equal(warpCharge(1250), 0.5);
  assert.equal(warpCharge(1500), 1);
  assert.equal(warpCharge(2400), 1);
});

test("warp approach eases in before the 1000 bar so the visual does not pop", () => {
  assert.equal(warpApproach(800), 0);
  assert.equal(warpApproach(700), 0);
  const mid = warpApproach(900);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.ok(warpApproach(999) > 0.98);
  assert.equal(warpApproach(1000), 1);
  assert.equal(warpApproach(1400), 1);
});

test("warp spool keeps rising through 1300 and peaks at the 1500 jump", () => {
  assert.equal(warpSpool(800), 0);
  assert.ok(warpSpool(1150) > 0.49 && warpSpool(1150) < 0.51);
  assert.ok(warpSpool(1300) < 0.75);
  assert.ok(warpSpool(1450) > warpSpool(1300));
  assert.equal(warpSpool(1500), 1);
});

test("play flags parse warp speed and target lock from the query", () => {
  assert.equal(playFlagsFromSearch("").warp, undefined);
  assert.equal(playFlagsFromSearch("?twins=on").warp, undefined);
  assert.equal(playFlagsFromSearch("?warp=1300").warp, 1300);
  assert.equal(playFlagsFromSearch("?warp=1300").target, true);
  assert.equal(playFlagsFromSearch("?warp=1300&target=on").target, true);
  assert.equal(playFlagsFromSearch("?warp=1450&target=off").target, false);
  assert.equal(playFlagsFromSearch("?warp=nope").warp, undefined);
});

test("debug warp dir locks a nearby chart or misses them", () => {
  const n = { angle: 0.4, color: "#fff", pal: ["#fff", "#fff", "#fff"] as [string, string, string], name: "Aim" };
  const on = debugWarpDir([n], true);
  const lock = headingVec(n.angle);
  assert.ok(on.x * lock.x + on.y * lock.y > 0.999);
  const off = debugWarpDir([n], false);
  assert.equal(lockedNearby(off.x, off.y, [n], WARP_AIM_DEG + 6), null);
});

test("warp heading lock is a tight cone", () => {
  const pal: [string, string, string] = ["#fff", "#000", "rgba(0,0,0,0)"];
  const n = { angle: 0, color: "#fff", pal, name: "Ember" };
  const v = headingVec(0);
  assert.ok(lockedNearby(v.x, v.y, [n], WARP_AIM_DEG));
  const miss = headingVec((WARP_AIM_DEG + 2) * (Math.PI / 180));
  assert.equal(lockedNearby(miss.x, miss.y, [n], WARP_AIM_DEG), null);
});

test("transit is tunnel, then a streak, then brake through the last boom", () => {
  assert.equal(transitBeat(0, false), "tunnel");
  assert.equal(transitBeat(WARP_TUNNEL - 0.05, false), "tunnel");
  assert.equal(transitBeat(WARP_TUNNEL + 0.05, false), "streak");
  assert.equal(transitBeat(WARP_TUNNEL + WARP_STREAK + 0.05, false), "brake");
});

test("transit launch ramps then holds full warp a few seconds before punch", () => {
  assert.ok(WARP_LAUNCH > 1.1);
  assert.ok(WARP_TUNNEL - WARP_LAUNCH >= 2.8);
});

test("arrival star ease holds full warp then inverts the launch ramp", () => {
  const start = WARP_TUNNEL + WARP_STREAK;
  assert.equal(transitArriveU(start), 1);
  assert.equal(transitArriveU(start + WARP_BRAKE), 0);
  const mid = transitArriveU(start + WARP_BRAKE / 2);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(transitArriveU(start - 0.1), 1);
});

test("in-flight star streaks at jump match the old 1050 look", () => {
  assert.equal(flightStarStreak(800), 0);
  assert.equal(flightStarStreak(1500), WARP_FLIGHT_STREAK);
  assert.ok(flightStarStreak(1150) > 0 && flightStarStreak(1150) < WARP_FLIGHT_STREAK);
  assert.ok(flightStarStreak(1450) < WARP_FLIGHT_STREAK * 1.01);
});

test("warp brake travel matches the cubic ease integral", () => {
  assert.equal(warpBrakeTravel(0, 1), WARP_BRAKE_SPEED * 0.75);
  assert.equal(warpBrakeTravel(2000, 1), 2000 * 0.25 + WARP_BRAKE_SPEED * 0.75);
  const d = warpBrakeTravel(2400);
  assert.ok(d > 850 && d < 960);
  assert.equal(warpBrakeTravel(1000, WARP_BRAKE), WARP_BRAKE * (250 + WARP_BRAKE_SPEED * 0.75));
});

test("warp arrival never dumps inside a body", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed);
    const rng = rngFrom(seed * 997);
    for (let i = 0; i < 6; i++) {
      const a = pickWarpArrival(sys.planets, rng, undefined, headingVec(rng() * Math.PI * 2));
      assert.ok(Math.hypot(a.dirX, a.dirY) > 0.99);
      for (const p of sys.planets) {
        if (isGhostBody(p) || p.radius <= 0) continue;
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        assert.ok(
          d >= p.radius + SHIP_HULL,
          `seed ${seed} hit ${p.kind} ${p.name}: d=${d.toFixed(1)} r=${p.radius}`,
        );
      }
    }
  }
});

test("warp arrival keeps the jump travel heading", () => {
  const travel = headingVec(2.14);
  for (let seed = 1; seed <= 20; seed++) {
    const sys = createSystem(seed);
    const rng = rngFrom(seed * 19);
    const scatter = pickWarpArrival(sys.planets, rng, "scatter", travel);
    const close = pickWarpArrival(sys.planets, rng, "close", travel);
    assert.ok(scatter.dirX * travel.x + scatter.dirY * travel.y > 0.999);
    assert.ok(close.dirX * travel.x + close.dirY * travel.y > 0.999);
  }
});

test("warp arrival heading is not locked on the star", () => {
  let aimed = 0;
  let n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const sys = createSystem(seed);
    const star = sys.planets.find((p) => p.kind === "star");
    if (!star) continue;
    const rng = rngFrom(seed * 13 + 7);
    const travel = headingVec(rng() * Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const a = pickWarpArrival(sys.planets, rng, undefined, travel);
      const dx = star.x - a.x;
      const dy = star.y - a.y;
      const mag = Math.hypot(dx, dy) || 1;
      const dot = (a.dirX * dx + a.dirY * dy) / mag;
      if (dot > 0.95) aimed += 1;
      n += 1;
    }
  }
  assert.ok(n > 100);
  assert.ok(aimed / n < 0.2, `aimed at star ${(aimed / n).toFixed(2)} of the time`);
});

test("close warp arrivals sit near a planet or moon, sometimes on a collision course", () => {
  let close = 0;
  let inboundHit = 0;
  let inboundMiss = 0;
  for (let seed = 1; seed <= 36; seed++) {
    const sys = createSystem(seed);
    const rng = rngFrom(seed * 41 + 3);
    const travel = headingVec(seed * 0.37);
    for (let i = 0; i < 4; i++) {
      const a = pickWarpArrival(sys.planets, rng, "close", travel);
      assert.ok(a.dirX * travel.x + a.dirY * travel.y > 0.999);
      if (!a.hostId) continue;
      const host = sys.planets.find((p) => p.id === a.hostId);
      if (!host || host.kind === "star") continue;
      const dx = host.x - a.x;
      const dy = host.y - a.y;
      const dist = Math.hypot(dx, dy);
      const alt = dist - host.radius;
      assert.ok(alt > 40, `too close to ${host.name}: alt=${alt.toFixed(1)}`);
      assert.ok(alt < 720, `close spawn too far from ${host.name}: alt=${alt.toFixed(1)}`);
      close += 1;
      const toward = (a.dirX * dx + a.dirY * dy) / dist;
      const miss = Math.abs(a.dirX * dy - a.dirY * dx);
      if (toward > 0.2) {
        if (miss < host.radius + SHIP_HULL) inboundHit += 1;
        else inboundMiss += 1;
      }
    }
  }
  assert.ok(close > 80, `only ${close} close arrivals`);
  assert.ok(inboundHit > 8, `expected some crash courses, got ${inboundHit}`);
  assert.ok(inboundMiss > 8, `expected some glances, got ${inboundMiss}`);
});
