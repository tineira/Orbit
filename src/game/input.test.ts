import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumePress,
  dropHeldPresses,
  isTypingTarget,
  steerFrom,
  thrustFrom,
} from "./input.ts";
import type { InputState } from "./types.ts";

function state(keys: string[] = [], presses: string[] = []): InputState {
  return {
    keys: new Set(keys),
    presses: new Set(presses),
    qaKeys: null,
    qaSteer: null,
    pointer: null,
  };
}

test("a tap released before the poll still counts once", () => {
  const s = state([], ["KeyO"]);
  const first = consumePress(s, "KeyO", false);
  assert.equal(first.pressed, true);
  assert.equal(first.down, false);
  assert.equal(s.presses.has("KeyO"), false);
  const second = consumePress(s, "KeyO", first.down);
  assert.equal(second.pressed, false);
});

test("a held key fires on the rising edge only", () => {
  const s = state(["KeyM"], ["KeyM"]);
  const first = consumePress(s, "KeyM", false);
  assert.equal(first.pressed, true);
  assert.equal(first.down, true);
  const second = consumePress(s, "KeyM", first.down);
  assert.equal(second.pressed, false);
});

test("qaKeys still edge-detect without the press queue", () => {
  const s = state();
  s.qaKeys = ["KeyM"];
  s.presses.add("KeyM");
  const first = consumePress(s, "KeyM", false);
  assert.equal(first.pressed, true);
  const second = consumePress(s, "KeyM", first.down);
  assert.equal(second.pressed, false);
});

test("an arrow tap still steers after keyup", () => {
  const s = state([], ["ArrowLeft"]);
  assert.equal(steerFrom(s), 1);
  dropHeldPresses(s);
  assert.equal(steerFrom(s), 0);
});

test("typing targets skip game keys", () => {
  assert.equal(isTypingTarget(null), false);
  const input = { tagName: "INPUT", isContentEditable: false };
  const p = { tagName: "P", isContentEditable: false };
  const edit = { tagName: "DIV", isContentEditable: true };
  assert.equal(isTypingTarget(input as unknown as EventTarget), true);
  assert.equal(isTypingTarget(p as unknown as EventTarget), false);
  assert.equal(isTypingTarget(edit as unknown as EventTarget), true);
});

test("a thrust tap still counts after keyup", () => {
  const s = state([], ["ArrowUp"]);
  assert.deepEqual(thrustFrom(s), { forward: true, reverse: false });
  dropHeldPresses(s);
  assert.deepEqual(thrustFrom(s), { forward: false, reverse: false });
});
