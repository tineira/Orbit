import assert from "node:assert/strict";
import { test } from "node:test";
import { warpCharge } from "./world.ts";

test("warp charge is empty below 1000 and full at 1500", () => {
  assert.equal(warpCharge(0), 0);
  assert.equal(warpCharge(999), 0);
  assert.equal(warpCharge(1000), 0);
  assert.equal(warpCharge(1250), 0.5);
  assert.equal(warpCharge(1500), 1);
  assert.equal(warpCharge(2400), 1);
});
