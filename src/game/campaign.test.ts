import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPAIGN_STORAGE_KEY,
  campaignFromSearch,
  loadCampaign,
  newCampaign,
  saveCampaign,
  type CampaignState,
  type CampaignStorage,
} from "./campaign.ts";
import { applyLoadout } from "./fuel.ts";
import {
  applyCampaignBoot,
  commitPadCheckpoint,
  commitStoryCheckpoint,
  createSim,
  rebootSim,
  stepSim,
} from "./sim.ts";
import { createSystem, getSystem, SHIP_HULL } from "./world.ts";

const idle = { steer: 0, forward: false, reverse: false, aimYaw: null, aimThrust: false };

function withStorage(run: (storage: MemoryStorage, log: string[]) => void) {
  const log: string[] = [];
  const storage = new MemoryStorage(log);
  const prev = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    run(storage, log);
  } finally {
    if (prev) Object.defineProperty(globalThis, "localStorage", prev);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

class MemoryStorage implements CampaignStorage {
  private mem = new Map<string, string>();
  private log: string[];
  length = 0;
  constructor(log: string[]) {
    this.log = log;
  }
  getItem(key: string) {
    this.log.push(`get:${key}`);
    return this.mem.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.log.push(`set:${key}`);
    this.mem.set(key, value);
    this.length = this.mem.size;
  }
  removeItem(key: string) {
    this.mem.delete(key);
  }
  clear() {
    this.mem.clear();
  }
  key() {
    return null;
  }
}

function starter(): CampaignState {
  return newCampaign({
    seed: 4,
    landedId: "home-1",
    ship: { fuelKind: "ch4", engineKind: "v1", tankKind: "fuel", fuel: 100, hull: 100 },
    flags: ["hasV2"],
    modules: [{ module: "transceiver" }],
  });
}

test("campaign search is opt-in", () => {
  assert.equal(campaignFromSearch(""), false);
  assert.equal(campaignFromSearch("?dev"), false);
  assert.equal(campaignFromSearch("?star=massive"), false);
  assert.equal(campaignFromSearch("?campaign"), true);
  assert.equal(campaignFromSearch("?campaign=1"), true);
  assert.equal(campaignFromSearch("?campaign=on"), true);
  assert.equal(campaignFromSearch("?campaign=0"), false);
  assert.equal(campaignFromSearch("?campaign=off"), false);
  assert.equal(campaignFromSearch("?campaign=false"), false);
});

test("save and load round-trip the checkpoint", () => {
  const state = starter();
  state.leg = { id: "leg-1", step: 2, seed: 9 };
  state.checkpoint.leg = { id: "leg-1", step: 2, seed: 9 };
  state.firedTriggers = ["A:0"];
  state.checkpoint.firedTriggers = ["A:0"];
  const mem = new Map<string, string>();
  const storage: CampaignStorage = {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
  };
  assert.equal(saveCampaign(state, storage), true);
  const loaded = loadCampaign(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded, state);
  assert.equal(mem.has(CAMPAIGN_STORAGE_KEY), true);
  loaded!.ship.fuel = 1;
  assert.equal(state.ship.fuel, 100);
  assert.equal(state.checkpoint.ship.fuel, 100);
});

test("corrupt or blocked storage does not throw", () => {
  const state = starter();
  const blocked: CampaignStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(saveCampaign(state, blocked), false);
  assert.equal(loadCampaign(blocked), null);
  const junk: CampaignStorage = {
    getItem: () => "{",
    setItem() {},
  };
  assert.equal(loadCampaign(junk), null);
  const wrong: CampaignStorage = {
    getItem: () => JSON.stringify({ version: 2 }),
    setItem() {},
  };
  assert.equal(loadCampaign(wrong), null);
  assert.equal(loadCampaign(null), null);
  assert.equal(saveCampaign(state, null), false);
});

test("random mode does not read or write campaign storage and still reboots at Home", () => {
  withStorage((storage, log) => {
    createSystem(1);
    const sim = createSim();
    assert.equal(sim.campaign, null);
    const home = sim.landedId;
    sim.ship.engineKind = "v2";
    applyLoadout(sim.ship);
    sim.ship.fuel = 10;
    sim.ship.hull = 40;
    rebootSim(sim);
    assert.equal(sim.phase, "landed");
    assert.equal(sim.landedId, home);
    assert.equal(sim.ship.engineKind, "v1");
    assert.equal(sim.ship.tankKind, "fuel");
    assert.equal(sim.ship.fuelKind, "ch4");
    assert.equal(sim.ship.fuel, sim.ship.fuelCapacity);
    assert.equal(sim.ship.hull, 100);
    assert.equal(commitPadCheckpoint(sim), false);
    assert.equal(commitStoryCheckpoint(sim, "A"), false);
    assert.deepEqual(log, []);
    assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), null);
  });
});

test("a finished pad refill is the checkpoint a crash and a reload return to", () => {
  withStorage((_storage, log) => {
    createSystem(1);
    const sim = createSim();
    const home = sim.planets.find((p) => p.kicker === "Home");
    const pad = sim.planets.find((p) => p.landable && p.kicker !== "Home");
    assert.ok(home && pad);
    assert.notEqual(home!.id, pad!.id);
    sim.campaign = newCampaign({
      seed: getSystem().seed,
      landedId: home!.id,
      ship: {
        fuelKind: sim.ship.fuelKind,
        engineKind: sim.ship.engineKind,
        tankKind: sim.ship.tankKind,
        fuel: sim.ship.fuel,
        hull: sim.ship.hull,
      },
    });
    sim.phase = "landed";
    sim.landedId = pad!.id;
    sim.ship.engineKind = "v2";
    applyLoadout(sim.ship);
    sim.ship.fuel = 40;
    sim.ship.hull = 55;
    assert.equal(commitPadCheckpoint(sim), true);
    assert.equal(sim.campaign!.checkpoint.landedId, pad!.id);
    assert.equal(sim.campaign!.checkpoint.ship.engineKind, "v2");
    assert.equal(sim.campaign!.checkpoint.ship.fuel, 40);
    assert.equal(sim.campaign!.place, null);

    sim.ship.engineKind = "v1";
    applyLoadout(sim.ship);
    sim.ship.fuel = 3;
    sim.ship.hull = 10;
    createSystem(8);
    rebootSim(sim);

    assert.equal(getSystem().seed, 1);
    assert.equal(sim.phase, "landed");
    assert.equal(sim.landedId, pad!.id);
    assert.equal(sim.ship.engineKind, "v2");
    assert.equal(sim.ship.fuel, 40);
    assert.equal(sim.ship.hull, 55);
    assert.equal(sim.crashedId, null);
    const parked = sim.planets.find((p) => p.id === sim.landedId);
    assert.notEqual(parked?.kicker, "Home");

    const again = createSim();
    again.campaign = loadCampaign();
    assert.ok(again.campaign);
    applyCampaignBoot(again);
    assert.equal(again.phase, "title");
    assert.equal(again.landedId, pad!.id);
    assert.equal(again.ship.engineKind, "v2");
    assert.equal(again.ship.fuel, 40);
    assert.ok(log.some((line) => line === `set:${CAMPAIGN_STORAGE_KEY}`));
    assert.ok(log.some((line) => line === `get:${CAMPAIGN_STORAGE_KEY}`));
  });
});

test("landing on a story place checkpoints that place", () => {
  withStorage(() => {
    createSystem(3);
    const sim = createSim();
    const home = sim.planets.find((p) => p.kicker === "Home");
    assert.ok(home);
    sim.campaign = newCampaign({
      seed: getSystem().seed,
      landedId: home!.id,
      ship: {
        fuelKind: "ch4",
        engineKind: "v1",
        tankKind: "fuel",
        fuel: 100,
        hull: 100,
      },
    });
    sim.ship.fuel = 12;
    sim.phase = "flight";
    sim.padZoomLock = false;
    sim.landedId = null;
    sim.campaignPlaceId = "a3";
    sim.ship.x = home!.x;
    sim.ship.y = home!.y - (home!.radius + SHIP_HULL * 0.4);
    sim.ship.vx = home!.vx;
    sim.ship.vy = home!.vy;
    stepSim(sim, 0, idle);
    assert.equal(sim.phase, "landed");
    assert.equal(sim.campaign!.place, "a3");
    assert.equal(sim.campaign!.leg, null);
    assert.equal(sim.campaign!.checkpoint.landedId, home!.id);
    assert.equal(sim.campaign!.checkpoint.ship.fuel, 12);
    assert.equal(sim.campaign!.checkpoint.seed, getSystem().seed);
  });
});

test("a landing without a story place does not move the checkpoint", () => {
  createSystem(3);
  const sim = createSim();
  const home = sim.planets.find((p) => p.kicker === "Home");
  assert.ok(home);
  sim.campaign = newCampaign({
    seed: 99,
    landedId: "somewhere-else",
    ship: { fuelKind: "ch4", engineKind: "v2", tankKind: "fuel", fuel: 80, hull: 90 },
  });
  sim.ship.fuel = 12;
  sim.phase = "flight";
  sim.padZoomLock = false;
  sim.landedId = null;
  sim.ship.x = home!.x;
  sim.ship.y = home!.y - (home!.radius + SHIP_HULL * 0.4);
  sim.ship.vx = home!.vx;
  sim.ship.vy = home!.vy;
  stepSim(sim, 0, idle);
  assert.equal(sim.phase, "landed");
  assert.equal(sim.campaign!.checkpoint.seed, 99);
  assert.equal(sim.campaign!.checkpoint.ship.engineKind, "v2");
  assert.equal(sim.campaign!.place, null);
});
