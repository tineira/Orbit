import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChartedSystem } from "./world.ts";
import { createSystem } from "./world.ts";

/** Fixed seeds. The file next to this test is the random-mode contract. */
export const SNAPSHOT_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function round(n: number | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

/** Stable chart summary: kind, kicker, settlement, rounded radius and orbit, headings, start. */
export function summarizeChart(sys: ChartedSystem) {
  return {
    start: {
      x: round(sys.start.x),
      y: round(sys.start.y),
      vx: round(sys.start.vx),
      vy: round(sys.start.vy),
      yaw: round(sys.start.yaw),
    },
    nearby: sys.nearby.map((n) => ({
      name: n.name,
      kind: n.kind,
      angle: round(n.angle),
    })),
    planets: sys.planets.map((p) => ({
      name: p.name,
      kind: p.kind,
      kicker: p.kicker,
      settlement: p.settlement,
      radius: round(p.radius),
      orbitR: round(p.orbitR),
      orbitA: round(p.orbitA),
      orbitE: round(p.orbitE),
      orbitW: round(p.orbitW),
    })),
  };
}

const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), "world-snapshot.json");

test("random charts match the 20-seed snapshot", () => {
  const expected = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
    seeds: Record<string, ReturnType<typeof summarizeChart>>;
  };
  for (const seed of SNAPSHOT_SEEDS) {
    const got = JSON.parse(JSON.stringify(summarizeChart(createSystem(seed))));
    assert.deepEqual(got, expected.seeds[String(seed)], `seed ${seed}`);
  }
});
