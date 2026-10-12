import type { CampaignState } from "./campaign.ts";
import { grant as grantPiece } from "./fuel.ts";
import type { Trigger } from "./triggers.ts";
import type { Planet, PlanetKind, Settlement, Ship } from "./types.ts";
import { createSystem, G, getPlanets, GRAVITY_BASE, keplerRail, type Recipe } from "./world.ts";

export type BodyMatch = {
  kind: PlanetKind;
  kicker?: string;
  index?: number;
};

export type BodyOverride = {
  ref: string;
  match: BodyMatch;
  retrograde?: boolean;
  orbit?: { a?: number; e?: number };
  settlement?: Settlement;
  pad?: "on" | "off";
  grant?: NonNullable<Planet["grant"]>;
  /** Marks this body as the campaign LUMEN world. */
  lumen?: boolean;
};

export type StoryPlace = {
  id: string;
  seed: number;
  recipe: Recipe;
  bodies: BodyOverride[];
  triggers: Trigger[];
  start?: { ref: string; fuel: number };
  headingRequires?: string;
};

/** Not a story place. The hand-test door is `/?campaign&place=probe`. */
export const PROBE_PLACE: StoryPlace = {
  id: "probe",
  seed: 1,
  recipe: { belt: { camp: false } },
  bodies: [
    {
      ref: "rock",
      match: { kind: "asteroid", kicker: "Rock", index: 0 },
      retrograde: true,
      settlement: "abandoned",
      pad: "on",
      grant: { engine: "v2" },
    },
  ],
  triggers: [
    {
      on: "takeoff",
      ref: "rock",
      effects: [{ setFlag: "leftRock" }, { text: "text:probe-leave" }],
    },
    {
      on: "land",
      ref: "rock",
      effects: [{ setFlag: "backRock" }, { thought: "thought:probe-land" }],
    },
    {
      on: "approach",
      ref: "rock",
      radius: 280,
      effects: [{ setFlag: "nearRock" }],
    },
  ],
  start: { ref: "rock", fuel: 40 },
};

/** Where the probe leg arrives. Not a story place. */
export const PROBE_END: StoryPlace = {
  id: "probe-end",
  seed: 2,
  recipe: {},
  bodies: [],
  triggers: [],
};

const PLACES: Record<string, StoryPlace> = {
  [PROBE_PLACE.id]: PROBE_PLACE,
  [PROBE_END.id]: PROBE_END,
};

export function storyPlaceById(id: string): StoryPlace | null {
  return PLACES[id] ?? null;
}

export function placeFromSearch(search = ""): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const id = (params.get("place") ?? "").trim();
  return id || null;
}

export function findBody(planets: Planet[], match: BodyMatch): Planet | null {
  const hits = planets.filter(
    (p) => p.kind === match.kind && (match.kicker == null || p.kicker === match.kicker),
  );
  return hits[match.index ?? 0] ?? null;
}

function missText(placeId: string, over: BodyOverride): string {
  const kicker = over.match.kicker ?? "*";
  const index = over.match.index ?? 0;
  return `story place ${placeId} has no body for ${over.ref} (${over.match.kind} ${kicker} #${index})`;
}

function placeOnParent(body: Planet, planets: Planet[]) {
  if (body.orbitR == null || body.orbitA == null || body.orbitW == null) return;
  const parent = body.parentId ? planets.find((p) => p.id === body.parentId) : undefined;
  const a = body.orbitR;
  const muFromW = body.orbitW * body.orbitW * a * a * a;
  const mu = parent ? G * GRAVITY_BASE * parent.mass : muFromW;
  const k = keplerRail(a, body.orbitE ?? 0, body.orbitPeri ?? 0, body.orbitA, mu || muFromW);
  const dir = body.orbitW < 0 ? -1 : 1;
  const px = parent?.x ?? 0;
  const py = parent?.y ?? 0;
  body.x = px + k.x;
  body.y = py + k.y;
  body.vx = (parent?.vx ?? 0) + dir * k.vx;
  body.vy = (parent?.vy ?? 0) + dir * k.vy;
}

/** Apply overrides onto an already rolled chart. Returns miss messages. Does not throw. */
export function applyStoryBodies(planets: Planet[], place: StoryPlace): string[] {
  const misses: string[] = [];
  for (const over of place.bodies) {
    const body = findBody(planets, over.match);
    if (!body) {
      misses.push(missText(place.id, over));
      continue;
    }
    body.placeRef = over.ref;
    if (over.settlement) {
      body.settlement = over.settlement;
      if (over.settlement === "unexplored") body.civ = null;
      else if (body.civ == null) body.civ = "human";
    }
    if (over.pad) body.pad = over.pad;
    if (over.grant) body.grant = over.grant;
    if (over.lumen) body.lumenWorld = true;
    let refresh = false;
    if (over.orbit && body.orbitA != null) {
      if (over.orbit.a != null) body.orbitA = over.orbit.a;
      if (over.orbit.e != null) body.orbitE = over.orbit.e;
      refresh = over.orbit.a != null || over.orbit.e != null;
    }
    if (over.retrograde) {
      if (body.orbitW == null) misses.push(`story place ${place.id} ${over.ref} has no rail`);
      else {
        body.orbitW = -Math.abs(body.orbitW);
        refresh = true;
      }
    }
    if (refresh) placeOnParent(body, planets);
  }
  if (place.start && !planets.some((p) => p.placeRef === place.start?.ref)) {
    misses.push(`story place ${place.id} has no start ${place.start.ref}`);
  }
  return misses;
}

/** Roll the place seed and recipe, then apply `bodies`. In dev, a miss throws. */
export function chartStoryPlace(place: StoryPlace, dev = false): string[] {
  createSystem(place.seed, {}, null, null, place.recipe);
  const misses = applyStoryBodies(getPlanets(), place);
  if (dev && misses.length) throw new Error(misses.join("; "));
  return misses;
}

export function applyBodyGrant(
  ship: Ship,
  grant: NonNullable<Planet["grant"]> | undefined,
  campaign: CampaignState | null,
) {
  if (!grant) return;
  if ("engine" in grant || "tank" in grant) {
    grantPiece(ship, grant);
    return;
  }
  if (!campaign) return;
  if (campaign.modules.some((m) => "module" in m && m.module === grant.module)) return;
  campaign.modules.push({ module: grant.module });
}
