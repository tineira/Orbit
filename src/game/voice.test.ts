import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VOICE_SOURCES,
  isVoiceSource,
  makeVoiceLine,
  voiceDisplayText,
  voiceSnapshot,
  voiceTtlMs,
} from "./voice.ts";

test("catalog is thought, ship, radio, plus DEV static and alien", () => {
  assert.deepEqual([...VOICE_SOURCES], ["thought", "ship", "radio", "static", "alien"]);
  assert.equal(isVoiceSource("thought"), true);
  assert.equal(isVoiceSource("radio"), true);
  assert.equal(isVoiceSource("chat"), false);
});

test("ttl grows with the line and caps", () => {
  const short = voiceTtlMs("Hi.", "thought");
  const long = voiceTtlMs("The well is quiet and the pad is dark.".repeat(8), "thought");
  assert.ok(short >= 2200);
  assert.ok(long > short);
  assert.equal(long, 12_000);
  assert.equal(voiceTtlMs("", "thought"), 2200);
});

test("static is a short no-answer bed, not a speech ttl", () => {
  assert.equal(voiceTtlMs("ignored", "static"), 2400);
  assert.equal(voiceTtlMs("", "static"), 2400);
});

test("snapshot expires after until", () => {
  const line = makeVoiceLine("ship", "  Orbit locked.  ", 1000);
  assert.equal(line.text, "Orbit locked.");
  assert.equal(line.until, 1000 + voiceTtlMs("Orbit locked.", "ship"));
  assert.deepEqual(voiceSnapshot(line, 1000), { source: "ship", text: "Orbit locked." });
  assert.equal(voiceSnapshot(line, line.until), null);
  assert.equal(voiceSnapshot(null, 1000), null);
});

test("static with no text reads as no carrier", () => {
  assert.equal(voiceDisplayText({ source: "static", text: "" }), "no carrier");
  assert.equal(voiceDisplayText({ source: "static", text: "mast still points" }), "mast still points");
  assert.equal(voiceDisplayText({ source: "thought", text: "" }), "");
});
