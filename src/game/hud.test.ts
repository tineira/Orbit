import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySimViewPrefs,
  createSim,
  cycleHudMode,
  hudShowsCues,
  hudShowsPaths,
  rebootSim,
  simViewPrefs,
} from "./sim.ts";
import { createSystem } from "./world.ts";

test("HUD starts on all overlays", () => {
  createSystem(1);
  const sim = createSim();
  assert.equal(sim.hudMode, "all");
  assert.equal(hudShowsPaths(sim.hudMode), true);
  assert.equal(hudShowsCues(sim.hudMode), true);
});

test("H cycles all → low → off → all", () => {
  assert.equal(cycleHudMode("all"), "low");
  assert.equal(cycleHudMode("low"), "off");
  assert.equal(cycleHudMode("off"), "all");
  assert.equal(hudShowsPaths("low"), false);
  assert.equal(hudShowsCues("low"), true);
  assert.equal(hudShowsPaths("off"), false);
  assert.equal(hudShowsCues("off"), false);
});

test("HUD mode survives a new-world prefs copy", () => {
  createSystem(1);
  const sim = createSim();
  sim.hudMode = "low";
  const prefs = simViewPrefs(sim);
  assert.equal(prefs.hudMode, "low");
  const next = createSim();
  applySimViewPrefs(next, prefs);
  assert.equal(next.hudMode, "low");
});

test("rebooting on the pad keeps HUD off", () => {
  createSystem(1);
  const sim = createSim();
  sim.hudMode = "off";
  rebootSim(sim);
  assert.equal(sim.hudMode, "off");
});
