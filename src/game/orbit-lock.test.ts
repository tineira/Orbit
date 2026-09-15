import assert from "node:assert/strict";
import { test } from "node:test";
import { createSim, stepSim, bodyMu } from "./sim.ts";
import {
  createSystem,
  hillRadius,
  keplerMinR,
  orbitShellAlts,
  wellRadius,
  ORBIT_LOCK_DWELL,
} from "./world.ts";
import type { Planet } from "./types.ts";

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

function live(sim: ReturnType<typeof createSim>, id: string) {
  return sim.planets.find((b) => b.id === id)!;
}

function circularAround(sim: ReturnType<typeof createSim>, p: Planet, alt: number) {
  const parent = p.parentId ? sim.planets.find((b) => b.id === p.parentId) : undefined;
  let ux = 1;
  let uy = 0;
  if (parent) {
    const dx = p.x - parent.x;
    const dy = p.y - parent.y;
    const d = Math.hypot(dx, dy) || 1;
    ux = dx / d;
    uy = dy / d;
  }
  const r = p.radius + alt;
  sim.ship.x = p.x + ux * r;
  sim.ship.y = p.y + uy * r;
  const v = Math.sqrt(Math.max(0, bodyMu(p, sim.gravityScale) / r));
  sim.ship.vx = p.vx + -uy * v;
  sim.ship.vy = p.vy + ux * v;
  sim.phase = "flight";
  sim.landedId = null;
  sim.orbitLockId = null;
  sim.orbitLockCooldown = 0;
  sim.orbitDwell = 0;
  sim.crashedId = null;
}

function coast(sim: ReturnType<typeof createSim>, seconds: number) {
  const n = Math.max(1, Math.ceil(seconds / (1 / 60)));
  for (let i = 0; i < n; i++) stepSim(sim, 1 / 60, idle);
}

test("landable asteroid shells reach Kepler apo, not a 48-unit cap", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sys = createSystem(seed, { belt: true });
    const rock = sys.planets.find((p) => p.kind === "asteroid" && p.landable && p.radius >= 26)!;
    const shell = orbitShellAlts(rock, sys.planets);
    assert.ok(shell.maxAlt > 90, `seed ${seed} maxAlt ${shell.maxAlt}`);
    assert.ok(shell.minAlt >= keplerMinR(rock) - rock.radius - 1e-6);
    assert.ok(shell.maxAlt < hillRadius(rock, sys.planets) - rock.radius);
  }
});

test("a circular coast around a landable asteroid locks outside the old 48 ring", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  const rock = sim.planets.find((p) => p.kind === "asteroid" && p.landable && p.radius >= 26)!;
  const { minAlt, maxAlt } = orbitShellAlts(rock, sim.planets);
  const alt = Math.min(maxAlt - 8, Math.max(minAlt + 6, 80));
  circularAround(sim, live(sim, rock.id), alt);
  coast(sim, ORBIT_LOCK_DWELL + 0.2);
  assert.equal(sim.orbitLockId, rock.id);
});

test("a circular coast around a shard locks so the spec can run", () => {
  createSystem(2, { belt: true });
  const sim = createSim();
  const shard = sim.planets.find((p) => p.kind === "asteroid" && !p.landable)!;
  const { minAlt, maxAlt } = orbitShellAlts(shard, sim.planets);
  assert.ok(maxAlt > minAlt, `shell ${minAlt}-${maxAlt}`);
  circularAround(sim, live(sim, shard.id), (minAlt + maxAlt) / 2);
  coast(sim, ORBIT_LOCK_DWELL + 0.2);
  assert.equal(sim.orbitLockId, shard.id);
  assert.equal(shard.landable, false);
});

test("every belt rock has a lock shell that a circular coast can catch", () => {
  for (let seed = 1; seed <= 8; seed++) {
    createSystem(seed, { belt: true });
    const sim = createSim();
    const rocks = sim.planets.filter((p) => p.kind === "asteroid");
    assert.ok(rocks.length >= 5, `seed ${seed}`);
    for (const rock of rocks) {
      const { minAlt, maxAlt } = orbitShellAlts(rock, sim.planets);
      assert.ok(maxAlt >= minAlt, `${rock.name} shell ${minAlt}-${maxAlt}`);
      circularAround(sim, live(sim, rock.id), (minAlt + maxAlt) / 2);
      coast(sim, ORBIT_LOCK_DWELL + 0.2);
      assert.equal(sim.orbitLockId, rock.id, `seed ${seed} ${rock.name} r${rock.radius.toFixed(0)}`);
    }
  }
});

test("moon lock rings stay inside the parent well", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sys = createSystem(seed, { belt: true });
    for (const moon of sys.planets.filter((p) => p.kind === "moon")) {
      const shell = orbitShellAlts(moon, sys.planets);
      const wellAlt = wellRadius(moon, sys.planets) - moon.radius;
      const hillAlt = hillRadius(moon, sys.planets) - moon.radius;
      assert.ok(shell.maxAlt <= wellAlt + 1e-6, `${moon.name} shell ${shell.maxAlt} well ${wellAlt}`);
      assert.ok(shell.maxAlt <= hillAlt + 1e-6, `${moon.name} shell ${shell.maxAlt} hill ${hillAlt}`);
      assert.ok(shell.maxAlt >= shell.minAlt);
    }
  }
});

test("a circular coast around a rocky planet locks", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  const planet = sim.planets.find((p) => p.kind === "rocky")!;
  const { minAlt, maxAlt } = orbitShellAlts(planet, sim.planets);
  circularAround(sim, live(sim, planet.id), (minAlt + maxAlt) / 2);
  coast(sim, ORBIT_LOCK_DWELL + 0.2);
  assert.equal(sim.orbitLockId, planet.id);
});

test("a planetary ellipse with apo outside the lock ring still captures", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  const planet = sim.planets.find((p) => p.kind === "rocky")!;
  const { minAlt, maxAlt } = orbitShellAlts(planet, sim.planets);
  const periAlt = (minAlt + maxAlt) / 2;
  const apoAlt = Math.min(planet.radius * 3.2, maxAlt + 80);
  assert.ok(apoAlt > maxAlt, `need apo ${apoAlt} past shell ${maxAlt}`);
  const rp = planet.radius + periAlt;
  const ra = planet.radius + apoAlt;
  const a = (rp + ra) / 2;
  const mu = bodyMu(planet, sim.gravityScale);
  sim.ship.x = planet.x + rp;
  sim.ship.y = planet.y;
  const v = Math.sqrt(Math.max(0, mu * (2 / rp - 1 / a)));
  sim.ship.vx = planet.vx;
  sim.ship.vy = planet.vy + v;
  sim.phase = "flight";
  sim.landedId = null;
  sim.orbitLockId = null;
  sim.orbitLockCooldown = 0;
  sim.orbitDwell = 0;
  sim.crashedId = null;
  coast(sim, ORBIT_LOCK_DWELL + 0.2);
  assert.equal(sim.orbitLockId, planet.id);
});

test("a circular coast in a moon lock shell captures", () => {
  createSystem(1, { belt: true });
  const sim = createSim();
  const moon = sim.planets.find((p) => p.kind === "moon")!;
  const { minAlt, maxAlt } = orbitShellAlts(moon, sim.planets);
  const alt = (minAlt + maxAlt) / 2;
  circularAround(sim, live(sim, moon.id), alt);
  coast(sim, ORBIT_LOCK_DWELL + 0.2);
  assert.equal(sim.orbitLockId, moon.id);
});
