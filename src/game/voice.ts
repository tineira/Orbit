/** Visor headset sources. `static` is abandoned radio (no answer). `alien` is a DEV timbre preview. */

export const VOICE_SOURCES = ["thought", "ship", "radio", "static", "alien"] as const;
export type VoiceSource = (typeof VOICE_SOURCES)[number];

export type VoiceLine = {
  source: VoiceSource;
  text: string;
  until: number;
};

export type VoiceSnapshot = {
  source: VoiceSource;
  text: string;
};

export const VOICE_SOURCE_LABEL: Record<VoiceSource, string> = {
  thought: "thought",
  ship: "ship",
  radio: "radio",
  static: "static",
  alien: "alien",
};

const CHAR_MS = 55;
const MIN_MS = 2200;
const MAX_MS = 12_000;
const STATIC_MS = 2400;

export function isVoiceSource(value: string): value is VoiceSource {
  return (VOICE_SOURCES as readonly string[]).includes(value);
}

export function voiceTtlMs(text: string, source: VoiceSource): number {
  if (source === "static") return STATIC_MS;
  const n = text.trim().length;
  if (n === 0) return MIN_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, 1400 + n * CHAR_MS));
}

export function makeVoiceLine(source: VoiceSource, text: string, now: number): VoiceLine {
  const trimmed = text.trim();
  return { source, text: trimmed, until: now + voiceTtlMs(trimmed, source) };
}

export function voiceSnapshot(line: VoiceLine | null, now: number): VoiceSnapshot | null {
  if (!line || now >= line.until) return null;
  return { source: line.source, text: line.text };
}

export function voiceDisplayText(line: VoiceSnapshot): string {
  if (line.source === "static" && !line.text) return "no carrier";
  return line.text;
}
