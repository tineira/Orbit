/**
 * Pilot thoughts (docs/art/README.md, fase 3): recorded lines, voice Gus,
 * dry and close, once per "first time" as the Voz lock defines. Example clips
 * live in `public/dev/pilot/` and the runtime loads the manifest only with `?dev`.
 */

export const PILOT_MANIFEST_URL = "/dev/pilot/manifest.json";
export const PILOT_CLIP_IDS = [
  "thought-01",
  "thought-02",
  "thought-03",
  "thought-04",
  "thought-05",
  "thought-06",
] as const;
export type PilotClipId = (typeof PILOT_CLIP_IDS)[number];

/** `{ "thought-01": { "text": "…" } }`. Files are `/dev/pilot/<id>.webm` and `.m4a`. */
export type PilotManifest = Record<string, { text: string }>;

export function isPilotClipId(value: string): value is PilotClipId {
  return (PILOT_CLIP_IDS as readonly string[]).includes(value);
}

export function pilotClipUrls(id: string) {
  return { webm: `/dev/pilot/${id}.webm`, m4a: `/dev/pilot/${id}.m4a` };
}

/** Tomás's cap (11 oct 2026): never more filtered than this. Softer than the old in-head chain. */
export const PILOT_FILTER = {
  highpassHz: 58,
  shelfHz: 220,
  shelfDb: 4.2,
  lowpassHz: 2900,
  lowpassQ: 0.55,
} as const;

export type PilotTrigger = "takeoff" | "landing" | "adrift" | "camp";

/** thought-05 and thought-06 wait on the story (Perihelion station); they only play from `?dev`. */
export const PILOT_TRIGGER_CLIP: Record<PilotTrigger, PilotClipId> = {
  takeoff: "thought-01",
  landing: "thought-02",
  adrift: "thought-03",
  camp: "thought-04",
};

export type PilotSnapshot = {
  phase: "creating" | "title" | "flight" | "landed" | "crashed" | "transit";
  landedId: string | null;
  adrift: boolean;
  /** The nearest body is an active Camp and the ship is on it or working its well. */
  campInScope: boolean;
};

/**
 * Every first-time trigger whose edge lands on this frame, in the order they
 * should play. Never one that already fired this chart. Adrift outranks the
 * rest: it is the line you need to hear.
 */
export function pilotTriggersFor(
  prev: PilotSnapshot | null,
  next: PilotSnapshot,
  fired: ReadonlySet<PilotTrigger>,
): PilotTrigger[] {
  if (!prev) return [];
  const out: PilotTrigger[] = [];
  if (!fired.has("adrift") && next.adrift && !prev.adrift) out.push("adrift");
  if (
    !fired.has("landing") &&
    next.landedId !== null &&
    prev.landedId === null &&
    next.phase === "landed"
  ) {
    out.push("landing");
  }
  if (!fired.has("camp") && next.campInScope && !prev.campInScope) out.push("camp");
  if (!fired.has("takeoff") && next.phase === "flight" && prev.phase === "title") out.push("takeoff");
  return out;
}

/** The first trigger of the frame, or null. */
export function pilotTriggerFor(
  prev: PilotSnapshot | null,
  next: PilotSnapshot,
  fired: ReadonlySet<PilotTrigger>,
): PilotTrigger | null {
  return pilotTriggersFor(prev, next, fired)[0] ?? null;
}
