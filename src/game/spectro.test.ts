import assert from "node:assert/strict";
import { test } from "node:test";
import { SCAN_SECONDS, canScan } from "./matter.ts";
import {
  clearSpectroScan,
  createSim,
  enterWarp,
  rebootSim,
  spectroHud,
  stepSpectro,
} from "./sim.ts";
import { createSystem } from "./world.ts";

function flightOn(hostId?: string) {
  createSystem(7);
  const sim = createSim();
  sim.phase = "flight";
  sim.landedId = null;
  sim.showSpectro = true;
  const host =
    (hostId ? sim.planets.find((p) => p.id === hostId) : null) ??
    sim.planets.find((p) => canScan(p) && p.kind === "rocky") ??
    sim.planets.find((p) => canScan(p));
  assert.ok(host, "expected a scannable body");
  sim.orbitLockId = host.id;
  sim.nearest = host;
  return { sim, host };
}

test("a locked survey finishes after SCAN_SECONDS and stores the mix", () => {
  const { sim, host } = flightOn();
  stepSpectro(sim, SCAN_SECONDS - 0.5);
  assert.equal(sim.scannedIds.has(host.id), false);
  const mid = spectroHud(sim, false);
  assert.equal(mid.spectroScanning, true);
  assert.equal(mid.composition, null);
  stepSpectro(sim, 1);
  assert.equal(sim.scannedIds.has(host.id), true);
  const done = spectroHud(sim, false);
  assert.equal(done.spectroScanning, false);
  assert.ok(done.composition?.bulk);
});

test("breaking lock or switching the instrument off aborts an unfinished scan", () => {
  const { sim, host } = flightOn();
  stepSpectro(sim, 4);
  assert.ok(sim.spectroScanT > 0);
  sim.orbitLockId = null;
  stepSpectro(sim, 1);
  assert.equal(sim.spectroScanId, null);
  assert.equal(sim.scannedIds.has(host.id), false);

  sim.orbitLockId = host.id;
  sim.showSpectro = true;
  stepSpectro(sim, 4);
  sim.showSpectro = false;
  clearSpectroScan(sim);
  stepSpectro(sim, 1);
  assert.equal(sim.spectroScanT, 0);
  assert.equal(sim.scannedIds.has(host.id), false);
});

test("a stored scan survives reboot and skips the countdown", () => {
  const { sim, host } = flightOn();
  stepSpectro(sim, SCAN_SECONDS);
  assert.equal(sim.scannedIds.has(host.id), true);
  rebootSim(sim);
  assert.equal(sim.scannedIds.has(host.id), true);
  sim.phase = "flight";
  sim.landedId = null;
  sim.showSpectro = true;
  sim.orbitLockId = host.id;
  sim.nearest = host;
  stepSpectro(sim, 0.2);
  assert.equal(sim.spectroScanT, SCAN_SECONDS);
  const hud = spectroHud(sim, false);
  assert.equal(hud.spectroScanning, false);
  assert.ok(hud.composition);
});

test("verbose reveal shows the mix before a scan; warp clears the chart", () => {
  const { sim, host } = flightOn();
  const hidden = spectroHud(sim, false);
  assert.equal(hidden.composition, null);
  const shown = spectroHud(sim, true);
  assert.ok(shown.composition?.bulk);
  sim.scannedIds.add(host.id);
  sim.reducedMotion = true;
  enterWarp(sim);
  assert.equal(sim.scannedIds.size, 0);
});
