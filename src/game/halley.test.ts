import assert from "node:assert/strict";
import { test } from "node:test";
import { HULL_MAX } from "./hull.ts";
import {
  HALLEY_CLIP_IDS,
  crtPowerEnvelope,
  halleyClipUrls,
  halleyCorruptStep,
  halleyDamage,
  halleyLost,
  halleyMaxSkips,
  halleySignal,
  halleyStripOffset,
  halleyTears,
  isHalleyClipId,
} from "./halley.ts";

test("clip ids are halley-01..04 and resolve to both containers", () => {
  assert.deepEqual([...HALLEY_CLIP_IDS], ["halley-01", "halley-02", "halley-03", "halley-04"]);
  assert.equal(isHalleyClipId("halley-03"), true);
  assert.equal(isHalleyClipId("thought-01"), false);
  assert.deepEqual(halleyClipUrls("halley-01"), {
    mp4: "/halley/halley-01.mp4",
    webm: "/halley/halley-01.webm",
  });
});

test("damage is 0 on a full hull and 1 when breached", () => {
  assert.equal(halleyDamage(HULL_MAX), 0);
  assert.equal(halleyDamage(HULL_MAX / 2), 0.5);
  assert.equal(halleyDamage(0), 1);
  assert.equal(halleyDamage(-5), 1);
  assert.equal(halleyDamage(HULL_MAX * 2), 0);
});

test("signal interpolates Tomás's healthy and worst values", () => {
  const ok = halleySignal(0);
  assert.ok(Math.abs(ok.hdist - 0.13) < 1e-9);
  assert.ok(Math.abs(ok.static - 0.06) < 1e-9);
  assert.ok(Math.abs(ok.dig - 0.1) < 1e-9);
  const bad = halleySignal(1);
  assert.equal(bad.hdist, 1);
  assert.ok(Math.abs(bad.static - 0.16) < 1e-9);
  assert.ok(Math.abs(bad.dig - 0.89) < 1e-9);
  const mid = halleySignal(0.5);
  assert.ok(mid.hdist > ok.hdist && mid.hdist < bad.hdist);
  assert.deepEqual(halleySignal(3), bad);
});

test("picture drops out only past half damage, never under reduced motion", () => {
  assert.equal(halleyLost(0.5, 0, false), false);
  assert.equal(halleyLost(0.7, 0.05, false), true);
  assert.equal(halleyLost(0.7, 0.2, false), false);
  // At full damage a quarter of the windows drop.
  assert.equal(halleyLost(1, 0.24, false), true);
  assert.equal(halleyLost(1, 0.26, false), false);
  assert.equal(halleyLost(1, 0, true), false);
});

test("corrupt memory starts at 0.6 damage, after the first second, within the skip budget", () => {
  const always = () => 0;
  assert.equal(halleyCorruptStep(0.59, 3, 0, false, always), null);
  assert.equal(halleyCorruptStep(0.8, 0.5, 0, false, always), null);
  assert.equal(halleyMaxSkips(0.6), 1);
  assert.equal(halleyMaxSkips(1), 4);
  assert.equal(halleyCorruptStep(1, 3, 4, false, always), null);
  const freeze = halleyCorruptStep(0.8, 3, 0, false, always);
  assert.equal(freeze?.kind, "freeze");
  if (freeze?.kind === "freeze") assert.equal(freeze.ms, 600);
  // Already frozen: the freeze roll is skipped, a rewind can still land.
  const rewind = halleyCorruptStep(0.8, 3, 0, true, always);
  assert.equal(rewind?.kind, "rewind");
  if (rewind?.kind === "rewind") assert.ok(Math.abs(rewind.seconds - 0.4) < 1e-9);
  // Bad rolls: nothing happens.
  assert.equal(halleyCorruptStep(1, 3, 0, false, () => 0.99), null);
});

test("power envelope: on grows from a dot, off collapses to a dot then dark", () => {
  const onEarly = crtPowerEnvelope(1000 + 10, true, 1000, 0, false);
  assert.ok(onEarly.vx < 0.1 && onEarly.vy < 0.1);
  assert.ok(onEarly.dotA > 0.8);
  const onDone = crtPowerEnvelope(1000 + 600, true, 1000, 0, false);
  assert.deepEqual(onDone, { dark: false, vx: 1, vy: 1, flash: 0, dotA: 0, fade: 1, lineA: 0 });
  const offLine = crtPowerEnvelope(2000 + 140, false, 1000, 2000, false);
  assert.ok(offLine.vy < 0.1 && offLine.vx === 1);
  assert.ok(offLine.lineA > 0.9);
  const offDot = crtPowerEnvelope(2000 + 300, false, 1000, 2000, false);
  assert.ok(offDot.dotA > 0.9);
  const offDark = crtPowerEnvelope(2000 + 700, false, 1000, 2000, false);
  assert.equal(offDark.dark, true);
  // Reduced motion snaps.
  assert.equal(crtPowerEnvelope(1000 + 10, true, 1000, 0, true).vx, 1);
  assert.equal(crtPowerEnvelope(2000 + 10, false, 1000, 2000, true).dark, true);
});

test("tears: none without distortion, 1 to 4 per epoch, offsets scale with distortion", () => {
  const h = (n: number) => {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  assert.deepEqual(halleyTears(0, 3, h), []);
  for (let epoch = 0; epoch < 40; epoch++) {
    const low = halleyTears(0.13, epoch, h);
    assert.ok(low.length >= 1 && low.length <= 4);
    for (const t of low) {
      assert.ok(t.y >= 0 && t.y < 1);
      assert.ok(Math.abs(t.off) <= 0.15 * 0.13 + 1e-9);
    }
    const high = halleyTears(1, epoch, h);
    assert.ok(high.length >= 3);
  }
  assert.equal(halleyStripOffset(0, 10, 500), 0);
  assert.ok(Math.abs(halleyStripOffset(1, 10, 500)) <= 0.016);
});
