import assert from "node:assert/strict";
import { test } from "node:test";
import {
  headingVec,
  lockedNearby,
  transitBeat,
  warpApproach,
  warpCharge,
  warpSpool,
  WARP_AIM_DEG,
} from "./world.ts";

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

test("warp heading lock is a tight cone", () => {
  const pal: [string, string, string] = ["#fff", "#000", "rgba(0,0,0,0)"];
  const n = { angle: 0, color: "#fff", pal };
  const v = headingVec(0);
  assert.ok(lockedNearby(v.x, v.y, [n], WARP_AIM_DEG));
  const miss = headingVec((WARP_AIM_DEG + 2) * (Math.PI / 180));
  assert.equal(lockedNearby(miss.x, miss.y, [n], WARP_AIM_DEG), null);
});

test("transit is tunnel, then a streak, then brake through the last boom", () => {
  assert.equal(transitBeat(0, false), "tunnel");
  assert.equal(transitBeat(1.0, false), "tunnel");
  assert.equal(transitBeat(1.2, false), "streak");
  assert.equal(transitBeat(1.8, false), "brake");
});
