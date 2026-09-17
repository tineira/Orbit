import assert from "node:assert/strict";
import { test } from "node:test";
import { SCAN_SECONDS, canScan } from "./matter.ts";
import {
  clearSpectroScan,
  createSim,
  enterWarp,
  rebootSim,
  spectroHud,
  spectroVoice,
  spectroScanProgress,
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
  const mid = spectroHud(sim);
  assert.equal(mid.spectroScanning, true);
  assert.equal(mid.composition, null);
  stepSpectro(sim, 1);
  assert.equal(sim.scannedIds.has(host.id), true);
  const done = spectroHud(sim);
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
  const hud = spectroHud(sim);
  assert.equal(hud.spectroScanning, false);
  assert.ok(hud.composition);
});

test("spectro voice is idle until lock, scan while reading, done after a hit", () => {
  const { sim, host } = flightOn();
  sim.orbitLockId = null;
  assert.equal(spectroVoice(sim), "idle");
  assert.equal(spectroScanProgress(sim), 0);
  sim.orbitLockId = host.id;
  assert.equal(spectroVoice(sim), "scan");
  stepSpectro(sim, SCAN_SECONDS);
  assert.equal(spectroVoice(sim), "done");
  sim.orbitLockId = null;
  assert.equal(spectroVoice(sim), "idle");
  sim.showSpectro = false;
  assert.equal(spectroVoice(sim), "off");
});

test("re-locking a scanned body stays done and does not restart a scan", () => {
  const { sim, host } = flightOn();
  stepSpectro(sim, SCAN_SECONDS);
  sim.orbitLockId = null;
  stepSpectro(sim, 0);
  sim.orbitLockId = host.id;
  stepSpectro(sim, 0.3);
  assert.equal(spectroVoice(sim), "done");
  assert.equal(spectroScanProgress(sim), 0);
});

test("landed and transit mute the spectro voice", () => {
  const { sim } = flightOn();
  sim.phase = "landed";
  assert.equal(spectroVoice(sim), "off");
  sim.phase = "flight";
  sim.showSpectro = true;
  enterWarp(sim);
  assert.equal(spectroVoice(sim), "off");
});

test("a locked shard survey stores the mix", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  sim.phase = "flight";
  sim.landedId = null;
  sim.showSpectro = true;
  const shard = sim.planets.find((p) => p.kind === "asteroid" && !p.landable);
  assert.ok(shard);
  assert.equal(canScan(shard!), true);
  sim.orbitLockId = shard!.id;
  sim.nearest = shard!;
  stepSpectro(sim, SCAN_SECONDS);
  assert.equal(sim.scannedIds.has(shard!.id), true);
  const hud = spectroHud(sim);
  assert.ok(hud.composition?.bulk);
  assert.equal(hud.composition?.atmosphere, null);
});

test("warp clears the spectro chart", () => {
  const { sim, host } = flightOn();
  assert.equal(spectroHud(sim).composition, null);
  sim.scannedIds.add(host.id);
  sim.reducedMotion = true;
  enterWarp(sim);
  assert.equal(sim.scannedIds.size, 0);
});
