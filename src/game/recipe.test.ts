import assert from "node:assert/strict";
import { test } from "node:test";
import { occupancyLegal, padHasFuel } from "./occupancy.ts";
import type { GasRecipe, Recipe } from "./world.ts";
import { createSystem, recipeFromChartFlags, SHIP_HULL, STAR_PALETTES } from "./world.ts";
import type { MatterProfileId, Planet } from "./types.ts";

function chart(seed: number, recipe: Recipe = {}, flags: Parameters<typeof createSystem>[1] = {}) {
  return createSystem(seed, flags, null, null, recipe);
}

function shape(planets: Planet[]) {
  return planets.map((p) => ({
    name: p.name,
    kind: p.kind,
    kicker: p.kicker,
    radius: p.radius,
    orbitR: p.orbitR ?? null,
  }));
}

test("an empty recipe matches a chart with no flags", () => {
  for (const seed of [1, 7, 13]) {
    const plain = createSystem(seed);
    const empty = chart(seed, { home: "active", activePads: "natural" });
    assert.deepEqual(shape(empty.planets), shape(plain.planets));
    assert.deepEqual(
      empty.planets.map((p) => p.settlement),
      plain.planets.map((p) => p.settlement),
    );
    assert.deepEqual(
      empty.nearby.map((n) => n.angle),
      plain.nearby.map((n) => n.angle),
    );
  }
});

test("star warm and hot pin the profile without moving the chart", () => {
  for (const seed of [1, 4, 9]) {
    const plain = createSystem(seed);
    const warm = chart(seed, { star: "warm" });
    const hot = chart(seed, { star: "hot" });
    assert.deepEqual(shape(warm.planets), shape(plain.planets));
    assert.deepEqual(shape(hot.planets), shape(plain.planets));
    assert.equal(warm.planets[0]!.matter, "star-warm");
    assert.equal(warm.planets[0]!.colorA, STAR_PALETTES[0]![0]);
    assert.equal(hot.planets[0]!.matter, "star-hot");
    assert.equal(hot.planets[0]!.colorA, STAR_PALETTES[3]![0]);
    assert.ok(hot.planets[0]!.radius >= 220 && hot.planets[0]!.radius <= 300);
  }
});

test("home none removes the cradle and still has a start", () => {
  const sys = chart(3, { home: "none" });
  assert.equal(
    sys.planets.some((p) => p.kicker === "Home"),
    false,
  );
  assert.equal(sys.home.kind, "rocky");
  const pad = sys.home.radius + SHIP_HULL * 0.85;
  assert.ok(Math.abs(sys.start.y - (sys.home.y - pad)) < 1e-6);
  assert.equal(sys.start.x, sys.home.x);
  for (const p of sys.planets) assert.equal(occupancyLegal(p).ok, true, p.name);
});

test("home abandoned dries the cradle and leaves the rest of the chart", () => {
  for (const seed of [2, 6, 11]) {
    const plain = createSystem(seed);
    const dry = chart(seed, { home: "abandoned" });
    assert.deepEqual(shape(dry.planets), shape(plain.planets));
    const home = dry.planets.find((p) => p.kicker === "Home");
    assert.ok(home);
    assert.equal(home!.settlement, "abandoned");
    assert.equal(home!.civ, "human");
    assert.equal(padHasFuel(home!), false);
    assert.equal(dry.home.kicker, "Home");
    assert.equal(occupancyLegal(home!).ok, true);
  }
});

test("rocky count and roles replace the seat list", () => {
  const sys = chart(8, {
    home: "none",
    rocky: { count: 2, roles: ["signal", "archive"] },
    belt: "none",
    gas: "none",
  });
  assert.deepEqual(
    sys.planets.filter((p) => p.kind === "rocky").map((p) => p.kicker),
    ["Signal", "Archive"],
  );
  assert.equal(
    sys.planets.some((p) => p.kind === "gas" || p.kind === "moon" || p.kind === "asteroid"),
    false,
  );
});

test("a twin role builds one pair and no extra rockies", () => {
  const sys = chart(2, {
    rocky: { count: 3, roles: ["workshop", "twin"] },
    belt: "none",
    gas: "none",
  });
  const kickers = sys.planets.map((p) => p.kicker);
  assert.ok(kickers.includes("Home"));
  assert.ok(kickers.includes("Workshop"));
  assert.equal(kickers.filter((k) => k === "Twin").length, 2);
  assert.ok(kickers.includes("Pair"));
  assert.equal(kickers.includes("Signal"), false);
  assert.equal(kickers.includes("Archive"), false);
});

test("rocky count clamps to 4", () => {
  const sys = chart(1, {
    home: "none",
    rocky: { count: 9, roles: ["workshop"] },
    belt: "none",
    gas: "none",
  });
  assert.equal(sys.planets.filter((p) => p.kind === "rocky").length, 4);
});

test("twins with one rocky does not throw", () => {
  for (const twins of ["on", "tight"] as const) {
    for (const count of [0, 1]) {
      const sys = chart(1, { rocky: { count }, twins });
      assert.equal(
        sys.planets.filter((p) => p.kind === "rocky").length,
        count,
        `${twins} ${count}`,
      );
      assert.equal(
        sys.planets.some((p) => p.kind === "barycenter"),
        false,
        `${twins} ${count}`,
      );
    }
  }
});

test("a chart with no landable still returns a start", () => {
  const sys = chart(1, { rocky: { count: 0 }, belt: "none", gas: "none" });
  assert.deepEqual(
    sys.planets.map((p) => p.kind),
    ["star"],
  );
  assert.equal(sys.home.kind, "star");
  assert.ok(Number.isFinite(sys.start.x) && Number.isFinite(sys.start.y));
});

test("activePads forces an exact active count", () => {
  for (const seed of [1, 5, 12]) {
    const none = chart(seed, { activePads: 0, belt: { camp: true } });
    assert.equal(none.planets.filter((p) => p.settlement === "active").length, 0, String(seed));
    assert.equal(
      none.planets.some((p) => p.kicker === "Camp"),
      false,
      String(seed),
    );
    for (const p of none.planets) assert.equal(occupancyLegal(p).ok, true, `${seed} ${p.name}`);

    const one = chart(seed, { activePads: 1 });
    const active = one.planets.filter((p) => p.settlement === "active");
    assert.equal(active.length, 1, String(seed));
    assert.equal(active[0]!.kicker, "Home");

    const all = chart(seed, { activePads: 99 });
    const landable = all.planets.filter((p) => p.landable);
    assert.equal(all.planets.filter((p) => p.settlement === "active").length, landable.length);
  }
});

test("gas pins the giant profile and none removes moons", () => {
  const ids: Record<Exclude<GasRecipe, "none">, MatterProfileId> = {
    ammonia: "gas-ammonia",
    water: "gas-water",
    methane: "gas-methane",
    ice: "gas-ice",
    sulfur: "gas-sulfur",
  };
  for (const seed of [1, 8]) {
    const plain = createSystem(seed);
    for (const kind of Object.keys(ids) as Exclude<GasRecipe, "none">[]) {
      const sys = chart(seed, { gas: kind });
      assert.deepEqual(shape(sys.planets), shape(plain.planets), `${seed} ${kind}`);
      assert.equal(sys.planets.find((p) => p.kind === "gas")!.matter, ids[kind]);
    }
  }
  const dry = chart(5, { gas: "none", moons: [{ matter: "moon-he3", settlement: "active" }] });
  assert.equal(
    dry.planets.some((p) => p.kind === "gas" || p.kind === "moon"),
    false,
  );
  for (const seed of [1, 6, 8]) {
    const plain = createSystem(seed);
    const stripped = chart(seed, { gas: "none" });
    const keep = (planets: Planet[]) =>
      planets.filter((p) => p.kind !== "gas" && p.kind !== "moon");
    assert.deepEqual(shape(keep(stripped.planets)), shape(keep(plain.planets)), String(seed));
    assert.deepEqual(
      keep(stripped.planets).map((p) => p.settlement),
      keep(plain.planets).map((p) => p.settlement),
      String(seed),
    );
  }
});

test("a moon list of a different length leaves the other settlements", () => {
  const lists: Recipe["moons"][] = [
    [],
    [{ matter: "moon-rock" }],
    [{ matter: "moon-rock" }, { matter: "moon-ice" }],
  ];
  for (const seed of [1, 6, 9]) {
    const plain = createSystem(seed);
    for (const moons of lists) {
      const sys = chart(seed, { moons });
      const rest = (planets: Planet[]) => planets.filter((p) => p.kind !== "moon");
      assert.deepEqual(
        rest(sys.planets).map((p) => [p.name, p.kicker, p.settlement, p.orbitR ?? null]),
        rest(plain.planets).map((p) => [p.name, p.kicker, p.settlement, p.orbitR ?? null]),
        `${seed} n=${moons!.length}`,
      );
      assert.equal(
        sys.planets.filter((p) => p.kind === "moon").length,
        moons!.length,
        `${seed} n=${moons!.length}`,
      );
    }
  }
});

test("moons pin count, matter, and settlement", () => {
  const sys = chart(6, {
    gas: "ammonia",
    moons: [
      { matter: "moon-he3", settlement: "abandoned" },
      { matter: "moon-deuterium", settlement: "unexplored" },
    ],
  });
  const moons = sys.planets.filter((p) => p.kind === "moon");
  assert.equal(moons.length, 2);
  assert.equal(moons[0]!.matter, "moon-he3");
  assert.equal(moons[0]!.settlement, "abandoned");
  assert.equal(moons[0]!.civ, "human");
  assert.equal(padHasFuel(moons[0]!), false);
  assert.equal(moons[1]!.matter, "moon-deuterium");
  assert.equal(moons[1]!.settlement, "unexplored");
  assert.equal(moons[1]!.civ, null);
  assert.equal(sys.planets.find((p) => p.kind === "gas")!.matter, "gas-ammonia");
  for (const p of sys.planets) assert.equal(occupancyLegal(p).ok, true, p.name);
});

test("moon list clamps to two and activePads wins over a moon pin", () => {
  const clamped = chart(4, {
    moons: [{ matter: "moon-rock" }, { matter: "moon-ice" }, { matter: "moon-he3" }],
  });
  const moons = clamped.planets.filter((p) => p.kind === "moon");
  assert.equal(moons.length, 2);
  assert.equal(moons[0]!.matter, "moon-rock");
  assert.equal(moons[1]!.matter, "moon-ice");

  const dried = chart(4, {
    activePads: 0,
    moons: [{ matter: "moon-rock", settlement: "active" }],
  });
  const moon = dried.planets.find((p) => p.kind === "moon");
  assert.ok(moon);
  assert.equal(moon!.matter, "moon-rock");
  assert.notEqual(moon!.settlement, "active");
});

test("belt none, soft, dense, and camp", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const none = chart(seed, { belt: "none" });
    assert.equal(
      none.planets.some((p) => p.kind === "asteroid"),
      false,
      String(seed),
    );
    const soft = chart(seed, { belt: "soft" });
    const softN = soft.planets.filter((p) => p.kind === "asteroid").length;
    assert.ok(softN >= 5 && softN <= 7, `${seed} soft ${softN}`);
    const dense = chart(seed, { belt: "dense" });
    const denseN = dense.planets.filter((p) => p.kind === "asteroid").length;
    assert.ok(denseN >= 11 && denseN <= 14, `${seed} dense ${denseN}`);
    const camp = chart(seed, { belt: { camp: true } });
    assert.ok(camp.planets.some((p) => p.kicker === "Camp"));
    const bare = chart(seed, { belt: { camp: false } });
    assert.ok(bare.planets.some((p) => p.kind === "asteroid"));
    assert.equal(
      bare.planets.some((p) => p.kicker === "Camp"),
      false,
    );
  }
});

test("nearby count is exact", () => {
  for (const n of [1, 2, 3] as const) {
    for (const seed of [1, 2, 3, 4]) {
      assert.equal(chart(seed, { nearby: { count: n } }).nearby.length, n, `${seed} ${n}`);
    }
  }
});

test("recipeFromChartFlags keeps debug flags", () => {
  assert.deepEqual(recipeFromChartFlags({}), {});
  assert.deepEqual(recipeFromChartFlags({ belt: true }), { belt: "soft" });
  assert.deepEqual(recipeFromChartFlags({ belt: false }), { belt: "none" });
  assert.deepEqual(recipeFromChartFlags({ camp: true }), { belt: { camp: true } });
  assert.deepEqual(recipeFromChartFlags({ camp: true, belt: false }), { belt: { camp: true } });
  assert.deepEqual(recipeFromChartFlags({ camp: false, belt: true }), { belt: { camp: false } });
  assert.deepEqual(recipeFromChartFlags({ camp: false }), { camp: false });
  assert.deepEqual(recipeFromChartFlags({ twins: "tight" }), { twins: "tight" });
  assert.deepEqual(recipeFromChartFlags({ settlement: "abandoned" }), { settlement: "abandoned" });
  assert.deepEqual(recipeFromChartFlags({ mine: "both" }), { mine: "both" });
});

test("camp off does not force a belt", () => {
  let belts = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const sys = createSystem(seed, { camp: false });
    assert.equal(
      sys.planets.some((p) => p.kicker === "Camp"),
      false,
      String(seed),
    );
    if (sys.planets.some((p) => p.kind === "asteroid")) belts++;
  }
  assert.ok(belts > 0 && belts < 24, String(belts));
});

test("a recipe star still honors a forced belt", () => {
  const sys = chart(3, { star: "hot" }, { belt: true });
  assert.equal(sys.planets[0]!.matter, "star-hot");
  const n = sys.planets.filter((p) => p.kind === "asteroid").length;
  assert.ok(n >= 5 && n <= 7, String(n));
});
