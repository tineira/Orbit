import type { CampaignFlag, CampaignState, Grant } from "./campaign.ts";
import { effectiveIsp, fuelGrade, fuelMass } from "./fuel.ts";
import type { Ship } from "./types.ts";
import { CH4_FULL_MASS, FUEL_BURN_MAIN, SHIP_FUEL_CAPACITY, THRUST_FORCE, WARP_JUMP_SPEED } from "./world.ts";

/**
 * Sim events. `runtime.ts` turns the returned effects into voice, grants, and marks.
 * Text, voice, and log fragments are ids. Without a manifest they do nothing.
 */
export type GameEvent =
  | { on: "enterSystem" }
  | { on: "approach"; ref: string; radius: number }
  | { on: "orbitLock"; ref: string }
  | { on: "land"; ref: string }
  | { on: "takeoff"; ref: string }
  | { on: "warpAttempt"; heading: string }
  | { on: "flag"; flag: string };

export type Effect =
  | { halley: string }
  | { thought: string }
  | { text: string }
  | { logFragment: number }
  | { grant: Grant }
  | { setFlag: CampaignFlag }
  | { revealHeading: string };

export type Trigger = GameEvent & {
  when?: { has?: CampaignFlag[]; not?: CampaignFlag[] };
  /** Default true. The id `<placeId>:<index>` is stored on the campaign. */
  once?: boolean;
  effects: Effect[];
};

/** Leave the bubble only after this multiple of the enter radius. */
export const APPROACH_HYSTERESIS = 1.25;

export type ApproachLatch = {
  seen: Set<string>;
  inside: Set<string>;
};

export type DvShip = Pick<Ship, "fuel" | "fuelKind" | "engineIsp" | "dryMass" | "mass">;

type MarkState = Pick<CampaignState, "flags" | "firedTriggers" | "revealed" | "modules">;

/** Exhaust speed (m/s) for a thrust grade. Isp is grade × engine. */
export function exhaustVelocity(isp: number): number {
  return (THRUST_FORCE * isp * SHIP_FUEL_CAPACITY) / (FUEL_BURN_MAIN * CH4_FULL_MASS);
}

/** Rocket Δv from the current tank. Field grades (HUSH) are not a rocket. */
export function shipDeltaV(ship: DvShip): number {
  const grade = fuelGrade(ship.fuelKind);
  if (grade.drain !== "thrust") return ship.fuel > 0 ? Number.POSITIVE_INFINITY : 0;
  const ve = exhaustVelocity(Math.max(1e-6, effectiveIsp(ship)));
  const propellant = fuelMass(ship);
  const dry = Math.max(1e-6, ship.mass - propellant);
  const wet = dry + propellant;
  if (!(wet > dry)) return 0;
  return ve * Math.log(wet / dry);
}

/**
 * True when the ship can still reach jump speed.
 * A field-drain grade with fuel left counts as reachable. Do not invent a rocket equation for it.
 */
export function canReachJump(ship: DvShip, speed: number): boolean {
  const grade = fuelGrade(ship.fuelKind);
  if (grade.drain !== "thrust") return ship.fuel > 0;
  return speed + shipDeltaV(ship) >= WARP_JUMP_SPEED;
}

export function jumpBlocked(
  state: Pick<CampaignState, "flags" | "modules">,
  requires: string | undefined,
  ship: DvShip,
  speed: number,
): boolean {
  if (requires && !hasMark(state, requires)) return true;
  return !canReachJump(ship, speed);
}

function hasMark(state: Pick<CampaignState, "flags" | "modules">, id: string): boolean {
  if (state.flags.includes(id)) return true;
  return state.modules.some((grant) => "module" in grant && grant.module === id);
}

export function approachKey(ref: string, radius: number): string {
  return `${ref}:${radius}`;
}

/**
 * Fire on the outside → inside edge only.
 * The first sample already inside the radius latches without firing, so a start on the pad is quiet.
 */
export function approachCrossings(
  latch: ApproachLatch,
  samples: { ref: string; radius: number; dist: number }[],
): { ref: string; radius: number }[] {
  const fired: { ref: string; radius: number }[] = [];
  for (const sample of samples) {
    const key = approachKey(sample.ref, sample.radius);
    if (!latch.seen.has(key)) {
      latch.seen.add(key);
      if (sample.dist < sample.radius) latch.inside.add(key);
      continue;
    }
    const was = latch.inside.has(key);
    if (!was && sample.dist < sample.radius) {
      latch.inside.add(key);
      fired.push({ ref: sample.ref, radius: sample.radius });
      continue;
    }
    if (was && sample.dist >= sample.radius * APPROACH_HYSTERESIS) latch.inside.delete(key);
  }
  return fired;
}

function eventMatches(trigger: Trigger, event: GameEvent): boolean {
  if (trigger.on !== event.on) return false;
  switch (event.on) {
    case "enterSystem":
      return true;
    case "approach":
      return trigger.on === "approach" && trigger.ref === event.ref && trigger.radius === event.radius;
    case "orbitLock":
    case "land":
    case "takeoff":
      return trigger.on === event.on && trigger.ref === event.ref;
    case "warpAttempt":
      return trigger.on === "warpAttempt" && trigger.heading === event.heading;
    case "flag":
      return trigger.on === "flag" && trigger.flag === event.flag;
    default:
      return false;
  }
}

function whenMatches(when: Trigger["when"], flags: CampaignFlag[]): boolean {
  if (!when) return true;
  if (when.has && !when.has.every((flag) => flags.includes(flag))) return false;
  if (when.not && when.not.some((flag) => flags.includes(flag))) return false;
  return true;
}

/**
 * Match `events` against `triggers`. Mutates marks on `state` (flags, fired ids, revealed headings).
 * A `setFlag` that newly turns on queues a `flag` event in this same call.
 * Grants are returned for the runtime. They are not applied here.
 */
export function runTriggers(
  placeId: string,
  triggers: Trigger[],
  events: GameEvent[],
  state: MarkState,
): Effect[] {
  const out: Effect[] = [];
  const queue = events.slice();
  const chained = new Set<string>();
  let guard = 0;
  while (queue.length > 0 && guard < 64) {
    guard += 1;
    const event = queue.shift();
    if (!event) break;
    triggers.forEach((trigger, index) => {
      if (!eventMatches(trigger, event)) return;
      if (!whenMatches(trigger.when, state.flags)) return;
      const id = `${placeId}:${index}`;
      const once = trigger.once !== false;
      if (once && state.firedTriggers.includes(id)) return;
      if (once) state.firedTriggers.push(id);
      for (const effect of trigger.effects) {
        out.push(effect);
        if ("setFlag" in effect) {
          if (state.flags.includes(effect.setFlag)) continue;
          state.flags.push(effect.setFlag);
          if (!chained.has(effect.setFlag)) {
            chained.add(effect.setFlag);
            queue.push({ on: "flag", flag: effect.setFlag });
          }
          continue;
        }
        if ("revealHeading" in effect && !state.revealed.includes(effect.revealHeading)) {
          state.revealed.push(effect.revealHeading);
        }
      }
    });
  }
  return out;
}

/** A voice effect whose id is in the manifest. Anything else, including text, is silence. */
export function spokenLine(
  effect: Effect,
  halley: Record<string, { text: string }> | null,
  pilot: Record<string, { text: string }> | null,
): { source: "ship" | "thought"; id: string; text: string } | null {
  if ("halley" in effect) {
    const clip = halley?.[effect.halley];
    if (!clip || typeof clip.text !== "string") return null;
    return { source: "ship", id: effect.halley, text: clip.text };
  }
  if ("thought" in effect) {
    const clip = pilot?.[effect.thought];
    if (!clip || typeof clip.text !== "string") return null;
    return { source: "thought", id: effect.thought, text: clip.text };
  }
  return null;
}
