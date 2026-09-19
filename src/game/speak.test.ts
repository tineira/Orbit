import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEAK_VOICES, speakPlainText } from "./speak.ts";

test("plain text drops marks so the English mouth stays English", () => {
  assert.equal(speakPlainText("  Órbita  locked.  "), "Orbita locked.");
  assert.equal(speakPlainText("pad — lit"), "pad - lit");
  assert.equal(speakPlainText(""), "");
});

test("each visor tag is a different Kitten speaker", () => {
  const names = Object.values(SPEAK_VOICES).map((v) => v.voice);
  assert.deepEqual(names, ["Hugo", "Bruno", "Leo", "Kiki"]);
  assert.equal(new Set(names).size, names.length);
});
