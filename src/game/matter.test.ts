import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MATTER_PROFILE_IDS,
  MATTER_PROFILES,
  MZ_MAX,
  SUBSTANCE_MZ,
  SUBSTANCES,
  bodyPeaks,
  bodyReadout,
  canScan,
  formatMix,
  fuelInMix,
  mixLegal,
  mixPercents,
  mixSum,
  profileLegal,
  rockyProfileId,
  starProfileId,
} from "./matter.ts";
import { createSystem } from "./world.ts";
import type { FuelKind, MatterProfileId, PlanetKind } from "./types.ts";

test("every substance id matches its record", () => {
  for (const [id, s] of Object.entries(SUBSTANCES)) {
    assert.equal(s.id, id);
  }
});

test("NTR and HUSH are not world matter", () => {
  const fuels = Object.values(SUBSTANCES)
    .map((s) => s.fuelKind)
    .filter((k): k is FuelKind => k != null);
  assert.equal(fuels.includes("ntr"), false);
  assert.equal(fuels.includes("hush"), false);
});

test("every locked profile is legal for its kind", () => {
  for (const id of MATTER_PROFILE_IDS) {
    const check = profileLegal(id);
    assert.equal(check.ok, true, `${id}: ${check.reason}`);
    const p = MATTER_PROFILES[id];
    assert.ok(p.bulk.length >= 2 && p.bulk.length <= 4, `${id} bulk count`);
    assert.ok(Math.abs(mixSum(p.bulk) - 1) < 1e-9, `${id} bulk sum`);
    if (p.atmosphere.length) {
      assert.ok(Math.abs(mixSum(p.atmosphere) - 1) < 1e-9, `${id} atmo sum`);
    }
  }
});

test("moons and asteroids are airless; stars and giants always have atmosphere", () => {
  for (const id of MATTER_PROFILE_IDS) {
    const p = MATTER_PROFILES[id];
    if (p.kind === "moon" || p.kind === "asteroid") assert.equal(p.atmosphere.length, 0, id);
    if (p.kind === "star" || p.kind === "gas") assert.ok(p.atmosphere.length > 0, id);
  }
});

test("rocky kickers map onto the closed recipes", () => {
  assert.equal(rockyProfileId("Home"), "rocky-home");
  assert.equal(rockyProfileId("Workshop"), "rocky-workshop");
  assert.equal(rockyProfileId("Signal"), "rocky-signal");
  assert.equal(rockyProfileId("Archive"), "rocky-archive");
  assert.equal(rockyProfileId("Twin"), "rocky-twin");
  assert.equal(rockyProfileId("Unknown"), "rocky-home");
});

test("blue-white star palette is the hot recipe", () => {
  assert.equal(starProfileId(0), "star-warm");
  assert.equal(starProfileId(3), "star-hot");
});

test("kind allow-lists reject the wrong layer", () => {
  assert.equal(mixLegal("star", "bulk", [{ id: "silicate", fraction: 1 }]).ok, false);
  assert.equal(mixLegal("moon", "atmosphere", [{ id: "h2", fraction: 1 }]).ok, false);
  assert.equal(mixLegal("barycenter", "bulk", []).ok, true);
  assert.equal(mixLegal("barycenter", "bulk", [{ id: "iron", fraction: 1 }]).ok, false);
});

test("charted bodies carry a legal locked mix; barycenters stay empty", () => {
  const kinds: PlanetKind[] = ["star", "rocky", "gas", "moon", "asteroid", "barycenter"];
  const seen = new Set<MatterProfileId>();
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed);
    for (const p of sys.planets) {
      assert.ok(kinds.includes(p.kind), p.kind);
      if (p.kind === "barycenter") {
        assert.equal(p.matter, null);
        assert.equal(p.bulk.length, 0);
        assert.equal(p.atmosphere.length, 0);
        continue;
      }
      assert.ok(p.matter, `${p.name} missing matter`);
      const profile = MATTER_PROFILES[p.matter!];
      assert.equal(profile.kind, p.kind, `${p.name} profile kind`);
      assert.equal(mixLegal(p.kind, "bulk", p.bulk).ok, true, `${p.name} bulk`);
      assert.equal(mixLegal(p.kind, "atmosphere", p.atmosphere).ok, true, `${p.name} atmo`);
      seen.add(p.matter!);
    }
    const home = sys.home;
    assert.equal(home.matter, "rocky-home");
    assert.ok(home.atmosphere.some((e) => e.id === "n2"));
  }
  assert.ok(seen.has("rocky-home"));
  assert.ok(seen.has("star-warm") || seen.has("star-hot"));
});

test("fuelInMix only returns scoopable grades", () => {
  const fuels = fuelInMix(MATTER_PROFILES["gas-methane"].atmosphere);
  assert.deepEqual(fuels, ["h2", "ch4"]);
  assert.deepEqual(fuelInMix(MATTER_PROFILES["rocky-home"].bulk), []);
});

test("every substance has a unique m/z slot on the spectrograph", () => {
  const values = Object.values(SUBSTANCE_MZ);
  assert.equal(values.length, Object.keys(SUBSTANCES).length);
  assert.equal(new Set(values).size, values.length);
  for (const mz of values) {
    assert.ok(mz > 0 && mz < MZ_MAX, String(mz));
  }
});

test("mix percents keep order and sum to 100", () => {
  const mix = [
    { id: "n2" as const, fraction: 0.78 },
    { id: "co2" as const, fraction: 0.22 },
  ];
  const pct = mixPercents(mix);
  assert.equal(pct.reduce((n, e) => n + e.pct, 0), 100);
  assert.equal(formatMix(mix), "N2 78 · CO2 22");
});

test("airless moons and asteroids list core only; giants list both layers", () => {
  const moon = MATTER_PROFILES["moon-rock"];
  const moonOut = bodyReadout(moon);
  assert.equal(moonOut.atmosphere, null);
  assert.ok(moonOut.bulk?.includes("Si"));
  const rock = MATTER_PROFILES["asteroid-silicate"];
  assert.equal(bodyReadout(rock).atmosphere, null);
  const gas = MATTER_PROFILES["gas-methane"];
  const gasOut = bodyReadout(gas);
  assert.ok(gasOut.atmosphere?.includes("CH4"));
  assert.ok(gasOut.bulk?.includes("H2"));
  const peaks = bodyPeaks(gas);
  assert.ok(peaks.some((p) => p.layer === "atmosphere" && p.fuel));
  assert.ok(peaks.some((p) => p.layer === "bulk"));
});

test("barycenters cannot be scanned", () => {
  assert.equal(canScan({ kind: "barycenter", matter: null }), false);
  assert.equal(canScan({ kind: "rocky", matter: "rocky-home" }), true);
});
