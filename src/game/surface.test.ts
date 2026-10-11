import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAS_SPIN_Q,
  LIGHT_STEPS,
  SHADE_R,
  albedoDisk,
  beaconAlpha,
  cloudDisk,
  fbm2,
  gasDisk,
  gasSpinQ,
  gasStrip,
  hasRings,
  lightAngleQ,
  lightFromQ,
  lightsDisk,
  parseHexRgb,
  rimFrom,
  shadeLayers,
  surfaceResolution,
} from "./surface.ts";

const px = (buf: Uint8ClampedArray, sz: number, x: number, y: number) => {
  const i = (y * sz + x) * 4;
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!] as const;
};

test("colors parse from hex, short hex and rgb()", () => {
  assert.deepEqual(parseHexRgb("#c57a58"), [197, 122, 88]);
  assert.deepEqual(parseHexRgb("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHexRgb("rgba(10, 20, 30, 0.5)"), [10, 20, 30]);
  assert.deepEqual(parseHexRgb("nope"), [128, 128, 128]);
  assert.deepEqual(rimFrom("#000000"), [45, 45, 45]);
});

test("fbm stays in 0..1 and is deterministic", () => {
  for (let i = 0; i < 200; i++) {
    const v = fbm2(i * 0.37, i * 0.11);
    assert.ok(v >= 0 && v <= 1);
  }
  assert.equal(fbm2(3.3, 4.4), fbm2(3.3, 4.4));
});

test("texture resolution is fixed per body kind and size", () => {
  assert.equal(surfaceResolution("gas", 180), 160);
  assert.equal(surfaceResolution("moon", 40), 128);
  assert.equal(surfaceResolution("rocky", 80), 256);
  assert.equal(surfaceResolution("rocky", 50), 160);
  assert.ok(SHADE_R <= 160);
});

test("light angle quantizes to the step count and round-trips", () => {
  assert.equal(lightAngleQ(1, 0), 0);
  assert.equal(lightAngleQ(-1, 0), LIGHT_STEPS / 2);
  const q = lightAngleQ(0, 1);
  const l = lightFromQ(q);
  assert.ok(Math.abs(l.x) < 1e-9 && Math.abs(l.y - 1) < 1e-9);
  assert.equal(gasSpinQ(0.1, false), Math.round(0.1 / GAS_SPIN_Q));
  assert.equal(gasSpinQ(5, true), 0);
});

test("rings only on giants, fixed per body", () => {
  assert.equal(hasRings({ kind: "rocky", radius: 80, mass: 1000 }), false);
  const a = hasRings({ kind: "gas", radius: 200, mass: 9000 });
  assert.equal(hasRings({ kind: "gas", radius: 200, mass: 9000 }), a);
  let some = 0;
  for (let i = 0; i < 40; i++) if (hasRings({ kind: "gas", radius: 150 + i * 7, mass: 5000 + i * 311 })) some++;
  assert.ok(some > 5 && some < 35);
});

test("albedo fills the disk, leaves the corners clear and mixes the two tones", () => {
  const R = 16;
  const sz = R * 2;
  const buf = albedoDisk(R, { kind: "rocky", colorA: "#c57a58", colorB: "#5c3224", seed: 3, craters: true });
  assert.equal(px(buf, sz, 0, 0)[3], 0);
  assert.equal(px(buf, sz, R, R)[3], 255);
  let dark = 0;
  let light = 0;
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const [r, , , a] = px(buf, sz, x, y);
      if (a === 0) continue;
      if (r < 120) dark++;
      else light++;
    }
  }
  assert.ok(dark > 0 && light > 0);
});

test("clouds and lights are sparse straight-alpha layers inside the disk", () => {
  const R = 24;
  const sz = R * 2;
  const clouds = cloudDisk(R, 5);
  const lights = lightsDisk(R, 5);
  let cloudPx = 0;
  let lightPx = 0;
  let total = 0;
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const inside = nx * nx + ny * ny <= 1;
      const ca = px(clouds, sz, x, y)[3];
      const la = px(lights, sz, x, y)[3];
      if (!inside) {
        assert.equal(ca, 0);
        assert.equal(la, 0);
        continue;
      }
      total++;
      if (ca > 0) cloudPx++;
      if (la > 0) {
        lightPx++;
        assert.equal(la, Math.round(255 * 0.3));
      }
    }
  }
  assert.ok(cloudPx > 0 && cloudPx < total * 0.6);
  assert.ok(lightPx < total * 0.03);
});

test("gas strip wraps without a seam and the disk samples it", () => {
  const w = 64;
  const h = 16;
  const strip = gasStrip(w, h, ["#d8b48a", "#9a7a58", "#5a4838", "#e0c8a0"], 2);
  // The wrap is no rougher than the roughest pair of neighbouring columns inside the strip.
  const colDiff = (x0: number, x1: number) => {
    let d = 0;
    for (let y = 0; y < h; y++) d += Math.abs(px(strip, w, x0, y)[0] - px(strip, w, x1, y)[0]);
    return d;
  };
  let worstInside = 0;
  for (let x = 1; x < w - 1; x++) worstInside = Math.max(worstInside, colDiff(x - 1, x));
  assert.ok(colDiff(w - 1, 0) <= worstInside + 1, `seam ${colDiff(w - 1, 0)} vs ${worstInside}`);
  const R = 10;
  const disk = gasDisk(R, strip, w, h, 0.4);
  assert.equal(px(disk, R * 2, 0, 0)[3], 0);
  assert.equal(px(disk, R * 2, R, R)[3], 255);
  const spun = gasDisk(R, strip, w, h, 1.2);
  let diff = 0;
  for (let i = 0; i < disk.length; i += 4) if (disk[i] !== spun[i]) diff++;
  assert.ok(diff > 0);
});

test("shade is brighter toward the star, rim sits on the lit limb, night mask on the far side", () => {
  const R = 20;
  const sz = R * 2;
  const { shade, rim, night } = shadeLayers(R, 1, 0, [120, 70, 40]);
  const lit = px(shade, sz, sz - 4, R);
  const dark = px(shade, sz, 3, R);
  assert.ok(lit[0] > dark[0] + 60);
  assert.ok(px(rim, sz, sz - 2, R)[3] > 0);
  assert.equal(px(rim, sz, 2, R)[3], 0);
  assert.ok(px(night, sz, 3, R)[3] > 200);
  assert.equal(px(night, sz, sz - 4, R)[3], 0);
  assert.equal(px(shade, sz, 0, 0)[3], 0);
});

test("beacon only on the night side, pulsing unless reduced motion", () => {
  assert.equal(beaconAlpha(0.5, 0, false), 0);
  assert.equal(beaconAlpha(-0.05, 0, false), 0);
  assert.equal(beaconAlpha(-1, 0, true), 1);
  const a = beaconAlpha(-1, 0, false);
  const b = beaconAlpha(-1, 400, false);
  assert.ok(a > 0 && b > 0 && a !== b);
});
