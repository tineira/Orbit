import assert from "node:assert/strict";
import { test } from "node:test";
import { HULL_MAX } from "./hull.ts";
import {
  SHIP_SPRITE_H,
  SHIP_SPRITE_NATIVE_H,
  SHIP_SPRITE_W,
  damageSparkOn,
  navBlink,
  shipDamaged,
  shipShadowDim,
  spriteRenderScale,
} from "./ship-sprite.ts";

test("sprite keeps the PNG aspect at the kite's visual height", () => {
  assert.equal(SHIP_SPRITE_H, 24);
  assert.ok(Math.abs(SHIP_SPRITE_W - 11.4) < 1e-9);
});

test("as-found variant starts below half hull", () => {
  assert.equal(shipDamaged(HULL_MAX), false);
  assert.equal(shipDamaged(HULL_MAX / 2), false);
  assert.equal(shipDamaged(HULL_MAX / 2 - 0.01), true);
  assert.equal(shipDamaged(0), true);
});

test("shadow dim matches the old vector ship and clamps", () => {
  assert.equal(shipShadowDim(0), 1);
  assert.ok(Math.abs(shipShadowDim(1) - 0.28) < 1e-9);
  assert.ok(Math.abs(shipShadowDim(0.5) - 0.64) < 1e-9);
  assert.equal(shipShadowDim(-2), 1);
  assert.ok(Math.abs(shipShadowDim(5) - 0.28) < 1e-9);
});

test("nav lights blink slowly and stay steady under reduced motion", () => {
  for (let t = 0; t < 5000; t += 37) {
    const b = navBlink(t, false);
    assert.ok(b >= 0.1 && b <= 1, `blink ${b} at ${t}`);
    assert.equal(navBlink(t, true), 1);
  }
  const period = (2 * Math.PI) / 0.004;
  assert.ok(Math.abs(navBlink(0, false) - navBlink(period, false)) < 1e-6);
});

test("damage spark is intermittent and off under reduced motion", () => {
  let on = 0;
  let off = 0;
  for (let t = 0; t < 4000; t += 23) {
    if (damageSparkOn(t, false)) on++;
    else off++;
    assert.equal(damageSparkOn(t, true), false);
  }
  assert.ok(on > 0 && off > on);
});

test("offscreen render follows zoom × dpr up to native resolution", () => {
  assert.equal(spriteRenderScale(1, 1), 1);
  assert.equal(spriteRenderScale(2, 2), 4);
  const nativeMax = SHIP_SPRITE_NATIVE_H / SHIP_SPRITE_H;
  assert.equal(spriteRenderScale(9.2, 2), nativeMax);
  assert.equal(spriteRenderScale(0.12, 1), 0.5);
});
