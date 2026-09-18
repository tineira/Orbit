import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asteroidMine,
  ASTEROID_MINE_PRIMARY_R,
  flavorBody,
  MINE_BEACON_PERIOD_MS,
  mineBeaconLit,
  occupancyLegal,
  padHasFuel,
  rockySettlement,
  type FlavorArgs,
} from "./occupancy.ts";
import { chartFlagsFromSearch, createSystem, withMineFlags } from "./world.ts";
import type { Planet } from "./types.ts";

type Occ = Pick<Planet, "kind" | "kicker" | "landable" | "settlement" | "civ">;

const illegal: [string, Occ][] = [
  ["Home abandoned", { kind: "rocky", kicker: "Home", landable: true, settlement: "abandoned", civ: "human" }],
  ["Camp abandoned", { kind: "asteroid", kicker: "Camp", landable: true, settlement: "abandoned", civ: "human" }],
  ["Shard active", { kind: "asteroid", kicker: "Shard", landable: false, settlement: "active", civ: "human" }],
  ["unexplored + civ", { kind: "rocky", kicker: "Workshop", landable: true, settlement: "unexplored", civ: "human" }],
  ["star + active", { kind: "star", kicker: "Star", landable: false, settlement: "active", civ: "human" }],
];

test("occupancyLegal rejects illegal fixtures", () => {
  for (const [label, p] of illegal) {
    const r = occupancyLegal(p);
    assert.equal(r.ok, false, label);
    assert.ok(r.reason, label);
  }
});

test("occupancyLegal allows Rock + active", () => {
  const r = occupancyLegal({
    kind: "asteroid",
    kicker: "Rock",
    landable: true,
    settlement: "active",
    civ: "human",
  });
  assert.equal(r.ok, true);
});

test("padHasFuel is only active settlements", () => {
  assert.equal(padHasFuel({ settlement: "active" }), true);
  assert.equal(padHasFuel({ settlement: "abandoned" }), false);
  assert.equal(padHasFuel({ settlement: "unexplored" }), false);
  assert.equal(padHasFuel({ settlement: null }), false);
});

test("createSystem occupancy is legal on seeds 1–24", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed);
    for (const p of sys.planets) {
      const r = occupancyLegal(p);
      assert.equal(r.ok, true, `seed ${seed} ${p.name} (${p.kicker}): ${r.reason}`);
      assert.equal(padHasFuel(p), p.settlement === "active", p.name);
    }
  }
});

test("Home is always active human", () => {
  const flagsList = [{}, { settlement: "abandoned" as const }, { settlement: "unexplored" as const }];
  for (let seed = 1; seed <= 12; seed++) {
    for (const flags of flagsList) {
      const home = createSystem(seed, flags).planets.find((p) => p.kicker === "Home");
      assert.ok(home, `seed ${seed}`);
      assert.equal(home!.settlement, "active");
      assert.equal(home!.civ, "human");
    }
  }
});

test("star, gas, and barycenter occupancy is null", () => {
  const sys = createSystem(1, { twins: "on" });
  const kinds = sys.planets.filter(
    (p) => p.kind === "star" || p.kind === "gas" || p.kind === "barycenter",
  );
  assert.ok(kinds.some((p) => p.kind === "star"));
  assert.ok(kinds.some((p) => p.kind === "gas"));
  assert.ok(kinds.some((p) => p.kind === "barycenter"));
  for (const p of kinds) {
    assert.equal(p.settlement, null, p.name);
    assert.equal(p.civ, null, p.name);
  }
});

test("shards stay unexplored even under settlement=abandoned", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sys = createSystem(seed, { belt: true, settlement: "abandoned" });
    const shards = sys.planets.filter(
      (p) => p.kicker === "Shard" || (p.kind === "asteroid" && !p.landable),
    );
    assert.ok(shards.length > 0, `seed ${seed}`);
    for (const p of shards) {
      assert.equal(p.settlement, "unexplored", p.name);
      assert.equal(p.civ, null, p.name);
    }
  }
});

test("{camp:true} always belts with a Camp", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed, { camp: true });
    const rocks = sys.planets.filter((p) => p.kind === "asteroid");
    assert.ok(rocks.length >= 5, `seed ${seed} count ${rocks.length}`);
    const camp = rocks.find((p) => p.kicker === "Camp");
    assert.ok(camp, `seed ${seed} missing Camp`);
    assert.equal(camp!.settlement, "active");
    assert.equal(camp!.civ, "human");
    assert.equal(camp!.landable, true);
  }
});

test("{camp:true, belt:false} still belts with a Camp", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sys = createSystem(seed, { camp: true, belt: false });
    assert.ok(
      sys.planets.some((p) => p.kind === "asteroid"),
      `seed ${seed} no belt`,
    );
    const camp = sys.planets.find((p) => p.kicker === "Camp");
    assert.ok(camp, `seed ${seed} missing Camp`);
    assert.equal(camp!.settlement, "active");
    assert.equal(camp!.civ, "human");
  }
});

test("{camp:false, belt:true} never Camps", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed, { camp: false, belt: true });
    assert.ok(sys.planets.some((p) => p.kind === "asteroid"), String(seed));
    assert.equal(
      sys.planets.some((p) => p.kicker === "Camp"),
      false,
      String(seed),
    );
  }
});

test("{belt:true} does not imply Camp", () => {
  let camps = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed, { belt: true });
    if (sys.planets.some((p) => p.kicker === "Camp")) camps++;
  }
  assert.ok(camps < 24, `every belt had a Camp (${camps}/24)`);
});

test("{camp:true, settlement:abandoned} keeps Camp active and dries other landables", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sys = createSystem(seed, { camp: true, settlement: "abandoned" });
    const camp = sys.planets.find((p) => p.kicker === "Camp");
    assert.ok(camp, `seed ${seed}`);
    assert.equal(camp!.settlement, "active");
    assert.equal(camp!.civ, "human");
    for (const p of sys.planets) {
      if (p.kicker === "Home" || p.kicker === "Camp") {
        assert.equal(p.settlement, "active", p.name);
        assert.equal(p.civ, "human", p.name);
        continue;
      }
      if (p.kicker === "Shard" || (p.kind === "asteroid" && !p.landable)) {
        assert.equal(p.settlement, "unexplored", p.name);
        continue;
      }
      if (!p.landable) continue;
      assert.equal(p.settlement, "abandoned", `${p.name} ${p.kicker}`);
      assert.equal(p.civ, "human", p.name);
      assert.equal(padHasFuel(p), false, p.name);
    }
  }
});

const LEGAL: FlavorArgs[] = [
  { kind: "rocky", kicker: "Home", settlement: "active", civ: "human", name: "Vesper" },
  { kind: "rocky", kicker: "Workshop", settlement: "active", civ: "human", name: "Kite" },
  { kind: "rocky", kicker: "Workshop", settlement: "abandoned", civ: "human", name: "Kite" },
  { kind: "rocky", kicker: "Workshop", settlement: "unexplored", civ: null, name: "Kite" },
  { kind: "rocky", kicker: "Signal", settlement: "active", civ: "human", name: "Aurel" },
  { kind: "rocky", kicker: "Signal", settlement: "abandoned", civ: "human", name: "Aurel" },
  { kind: "rocky", kicker: "Signal", settlement: "unexplored", civ: null, name: "Aurel" },
  { kind: "rocky", kicker: "Archive", settlement: "active", civ: "human", name: "Nyx" },
  { kind: "rocky", kicker: "Archive", settlement: "abandoned", civ: "human", name: "Nyx" },
  { kind: "rocky", kicker: "Archive", settlement: "unexplored", civ: null, name: "Nyx" },
  {
    kind: "rocky",
    kicker: "Twin",
    settlement: "active",
    civ: "human",
    name: "Iskra",
    ctx: { twinName: "Calyx" },
  },
  {
    kind: "rocky",
    kicker: "Twin",
    settlement: "abandoned",
    civ: "human",
    name: "Iskra",
    ctx: { twinName: "Calyx" },
  },
  {
    kind: "rocky",
    kicker: "Twin",
    settlement: "unexplored",
    civ: null,
    name: "Iskra",
    ctx: { twinName: "Calyx" },
  },
  { kind: "asteroid", kicker: "Camp", settlement: "active", civ: "human", name: "Clast" },
  { kind: "asteroid", kicker: "Rock", settlement: "active", civ: "human", name: "Grit" },
  { kind: "asteroid", kicker: "Rock", settlement: "abandoned", civ: "human", name: "Grit" },
  { kind: "asteroid", kicker: "Rock", settlement: "unexplored", civ: null, name: "Grit" },
  { kind: "asteroid", kicker: "Shard", settlement: "unexplored", civ: null, name: "Knurl" },
  {
    kind: "moon",
    kicker: "Moon",
    settlement: "active",
    civ: "human",
    name: "Drift",
    ctx: { gasName: "Vela" },
  },
  {
    kind: "moon",
    kicker: "Moon",
    settlement: "abandoned",
    civ: "human",
    name: "Drift",
    ctx: { gasName: "Vela" },
  },
  {
    kind: "moon",
    kicker: "Moon",
    settlement: "unexplored",
    civ: null,
    name: "Drift",
    ctx: { gasName: "Vela" },
  },
];

test("every legal copy cell returns a non-empty string", () => {
  for (const args of LEGAL) {
    const s = flavorBody(args);
    assert.equal(typeof s, "string", `${args.kicker}:${args.settlement}`);
    assert.ok(s.length > 0, `${args.kicker}:${args.settlement}`);
  }
});

test("flavorBody throws on a missing key", () => {
  assert.throws(
    () =>
      flavorBody({
        kind: "rocky",
        kicker: "Home",
        settlement: "abandoned",
        civ: "human",
        name: "Vesper",
      }),
    /missing occupancy copy/,
  );
  assert.throws(
    () =>
      flavorBody({
        kind: "star",
        kicker: "Star",
        settlement: null,
        civ: null,
        name: "Helios",
      }),
    /not for null occupancy/,
  );
  assert.throws(
    () =>
      flavorBody({
        kind: "rocky",
        kicker: "Ruins",
        settlement: "active",
        civ: "human",
        name: "Xor",
      }),
    /missing occupancy copy/,
  );
});

test("occupancy weight bands over seeds 1–200", () => {
  let rocky = 0;
  let rockyActive = 0;
  let moons = 0;
  let moonsUnexplored = 0;
  let beltCamps = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const sys = createSystem(seed);
    for (const p of sys.planets) {
      if (p.kind === "rocky" && p.kicker !== "Home") {
        rocky++;
        if (p.settlement === "active") rockyActive++;
      }
      if (p.kind === "moon") {
        moons++;
        if (p.settlement === "unexplored") moonsUnexplored++;
      }
    }
    const belted = createSystem(seed, { belt: true });
    if (belted.planets.some((p) => p.kicker === "Camp")) beltCamps++;
  }
  const rockyPct = rockyActive / rocky;
  const moonPct = moonsUnexplored / moons;
  const campPct = beltCamps / 200;
  assert.ok(rockyPct >= 0.15 && rockyPct <= 0.35, `rocky non-Home active ${rockyPct}`);
  assert.ok(moonPct >= 0.7, `moons unexplored ${moonPct}`);
  assert.ok(campPct >= 0.1 && campPct <= 0.35, `{belt:true} Camp ${campPct}`);
});

test("asteroidMine is only landable active/abandoned rocks", () => {
  assert.equal(
    asteroidMine({
      kind: "asteroid",
      landable: true,
      radius: 32,
      settlement: "unexplored",
      shapeSeed: 1,
    }),
    null,
  );
  assert.equal(
    asteroidMine({
      kind: "asteroid",
      landable: false,
      radius: 12,
      settlement: "unexplored",
      shapeSeed: 1,
    }),
    null,
  );
  const camp = asteroidMine({
    kind: "asteroid",
    landable: true,
    radius: 32,
    settlement: "active",
    shapeSeed: 1,
  });
  assert.ok(camp);
  assert.equal(camp!.towers.length, 2);
  assert.equal(camp!.padLights, true);
  assert.ok(camp!.towers.every((t) => t.beacon === "beacon"));
  const med = asteroidMine({
    kind: "asteroid",
    landable: true,
    radius: ASTEROID_MINE_PRIMARY_R - 1,
    settlement: "abandoned",
    shapeSeed: 3,
  });
  assert.ok(med);
  assert.equal(med!.towers.length, 1);
  assert.equal(med!.padLights, false);
  assert.ok(med!.towers.every((t) => t.beacon === "flicker" || t.beacon === "off"));
});

test("?mine sugar resolves to camp/belt/settlement", () => {
  assert.deepEqual(withMineFlags({ mine: "active" }).camp, true);
  assert.deepEqual(withMineFlags({ mine: "abandoned" }), {
    mine: "abandoned",
    camp: false,
    belt: true,
    settlement: "abandoned",
  });
  assert.equal(withMineFlags({ mine: "both", settlement: "unexplored" }).camp, true);
  assert.equal(withMineFlags({ mine: "both", settlement: "unexplored" }).settlement, "unexplored");
  assert.deepEqual(chartFlagsFromSearch("?mine=both&settlement=active"), {
    mine: "both",
    settlement: "active",
  });
});

test("{mine:active} always belts with a lit Camp", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sys = createSystem(seed, { mine: "active" });
    const camp = sys.planets.find((p) => p.kicker === "Camp");
    assert.ok(camp, String(seed));
    const spec = asteroidMine(camp!);
    assert.ok(spec);
    assert.equal(spec!.towers.length, 2);
    assert.equal(spec!.padLights, true);
  }
});

test("{mine:abandoned} belts a dead primary Rock, never a Camp", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sys = createSystem(seed, { mine: "abandoned" });
    const rocks = sys.planets.filter((p) => p.kind === "asteroid");
    assert.ok(rocks.length >= 5, String(seed));
    assert.equal(
      rocks.some((p) => p.kicker === "Camp"),
      false,
      String(seed),
    );
    const primary = rocks.find((p) => p.landable);
    assert.ok(primary, String(seed));
    assert.equal(primary!.kicker, "Rock");
    assert.equal(primary!.settlement, "abandoned");
    const spec = asteroidMine(primary!);
    assert.ok(spec, String(seed));
    assert.equal(spec!.padLights, false);
    assert.equal(spec!.towers.length, 2);
  }
});

test("{mine:both} is a Camp plus an abandoned extra rock", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sys = createSystem(seed, { mine: "both" });
    const camp = sys.planets.find((p) => p.kicker === "Camp");
    assert.ok(camp, String(seed));
    assert.equal(camp!.settlement, "active");
    const extra = sys.planets.filter((p) => p.kind === "asteroid" && p.landable && p.kicker !== "Camp");
    assert.equal(extra.length, 1, String(seed));
    assert.equal(extra[0]!.settlement, "abandoned");
    assert.equal(asteroidMine(extra[0]!)!.towers.length, 1);
    const home = sys.planets.find((p) => p.kicker === "Home");
    assert.equal(home!.settlement, "active");
  }
});

test("mine beacons flash 30/min and stay on under reduced motion", () => {
  assert.equal(mineBeaconLit(0, false), true);
  assert.equal(mineBeaconLit(MINE_BEACON_PERIOD_MS * 0.2, false), true);
  assert.equal(mineBeaconLit(MINE_BEACON_PERIOD_MS * 0.5, false), false);
  assert.equal(mineBeaconLit(MINE_BEACON_PERIOD_MS * 0.99, false), false);
  assert.equal(mineBeaconLit(MINE_BEACON_PERIOD_MS, false), true);
  assert.equal(mineBeaconLit(MINE_BEACON_PERIOD_MS * 0.5, true), true);
  assert.equal(mineBeaconLit(0, false, MINE_BEACON_PERIOD_MS * 0.5), false);
  assert.equal(mineBeaconLit(0, false, 0, "off"), false);
  assert.equal(mineBeaconLit(0, true, 0, "flicker"), false);
});

test("rockySettlement is night sites on active/abandoned rockies only", () => {
  assert.equal(
    rockySettlement({
      kind: "rocky",
      kicker: "Workshop",
      settlement: "unexplored",
      radius: 80,
      mass: 10,
    }),
    null,
  );
  assert.equal(
    rockySettlement({
      kind: "moon",
      kicker: "Moon",
      settlement: "active",
      radius: 30,
      mass: 4,
    }),
    null,
  );
  const home = rockySettlement({
    kind: "rocky",
    kicker: "Home",
    settlement: "active",
    radius: 80,
    mass: 10,
  });
  assert.ok(home);
  assert.equal(home!.lit, true);
  assert.equal(home!.dust, false);
  assert.equal(home!.home, true);
  assert.equal(home!.sites.length, 9);
  const dead = rockySettlement({
    kind: "rocky",
    kicker: "Workshop",
    settlement: "abandoned",
    radius: 80,
    mass: 10,
  });
  const live = rockySettlement({
    kind: "rocky",
    kicker: "Workshop",
    settlement: "active",
    radius: 80,
    mass: 10,
  });
  assert.ok(dead);
  assert.ok(live);
  assert.equal(dead!.lit, false);
  assert.equal(dead!.dust, true);
  assert.equal(dead!.sites.length, 5);
  assert.equal(live!.sites.length, 5);
  assert.deepEqual(
    dead!.sites.map((s) => [s.a, s.u]),
    live!.sites.map((s) => [s.a, s.u]),
  );
});
