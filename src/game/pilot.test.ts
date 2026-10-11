import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PILOT_CLIP_IDS,
  PILOT_FILTER,
  PILOT_TRIGGER_CLIP,
  isPilotClipId,
  pilotClipUrls,
  pilotTriggerFor,
  pilotTriggersFor,
  type PilotSnapshot,
  type PilotTrigger,
} from "./pilot.ts";

const onPad: PilotSnapshot = { phase: "title", landedId: "home", adrift: false, campInScope: false };
const flying: PilotSnapshot = { phase: "flight", landedId: null, adrift: false, campInScope: false };

test("six clip ids, two containers each, four of them wired to triggers", () => {
  assert.equal(PILOT_CLIP_IDS.length, 6);
  assert.equal(isPilotClipId("thought-06"), true);
  assert.equal(isPilotClipId("halley-01"), false);
  assert.deepEqual(pilotClipUrls("thought-02"), {
    webm: "/pilot/thought-02.webm",
    m4a: "/pilot/thought-02.m4a",
  });
  assert.deepEqual(Object.values(PILOT_TRIGGER_CLIP), ["thought-01", "thought-02", "thought-03", "thought-04"]);
});

test("filter cap is softer than the old in-head chain", () => {
  assert.ok(PILOT_FILTER.highpassHz < 70);
  assert.ok(PILOT_FILTER.shelfDb < 5.5);
  assert.ok(PILOT_FILTER.lowpassHz > 1750);
});

test("first frame never fires; takeoff fires on title → flight once", () => {
  const fired = new Set<PilotTrigger>();
  assert.equal(pilotTriggerFor(null, onPad, fired), null);
  assert.equal(pilotTriggerFor(onPad, flying, fired), "takeoff");
  fired.add("takeoff");
  assert.equal(pilotTriggerFor(onPad, flying, fired), null);
  // Taking off again from a pad is landed → flight, not a first.
  const landed: PilotSnapshot = { ...flying, phase: "landed", landedId: "rock" };
  assert.equal(pilotTriggerFor(landed, flying, new Set()), null);
});

test("landing fires when a landedId appears in the landed phase, not on the title pad", () => {
  const landed: PilotSnapshot = { phase: "landed", landedId: "rock", adrift: false, campInScope: false };
  assert.equal(pilotTriggerFor(flying, landed, new Set()), "landing");
  assert.equal(pilotTriggerFor(flying, landed, new Set(["landing"])), null);
  // The chart starts landed on the home pad: no edge, no line.
  assert.equal(pilotTriggerFor(onPad, onPad, new Set()), null);
});

test("adrift outranks a landing on the same frame; camp fires on its edge", () => {
  const both: PilotSnapshot = { phase: "landed", landedId: "rock", adrift: true, campInScope: false };
  assert.equal(pilotTriggerFor(flying, both, new Set()), "adrift");
  assert.equal(pilotTriggerFor(flying, both, new Set(["adrift"])), "landing");
  // Both edges on one frame: both are kept, adrift first.
  assert.deepEqual(pilotTriggersFor(flying, both, new Set()), ["adrift", "landing"]);
  const camp: PilotSnapshot = { ...flying, campInScope: true };
  assert.equal(pilotTriggerFor(flying, camp, new Set()), "camp");
  assert.equal(pilotTriggerFor(camp, camp, new Set()), null);
});
