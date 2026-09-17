import type { BeltTickKind } from "./belt.ts";

/** Integrity. Distinct from `SHIP_HULL`, which is the collision radius. */
export const HULL_MAX = 100;

/** Seconds to rebuild 0 → 100. Landed is a pit stop; locks are a wait. */
export const HULL_REPAIR_LAND_S = 15;
export const HULL_REPAIR_ORBIT_S = 80;
export const HULL_REPAIR_LAGRANGE_S = 110;

export const HULL_REPAIR_LAND = HULL_MAX / HULL_REPAIR_LAND_S;
export const HULL_REPAIR_ORBIT = HULL_MAX / HULL_REPAIR_ORBIT_S;
export const HULL_REPAIR_LAGRANGE = HULL_MAX / HULL_REPAIR_LAGRANGE_S;

/** Closing slower than this is grit, not a hit. Matches belt audio. */
const V_SILENT = 10;
const CHIP_CAP = 4;
const PEBBLE_CAP = 18;

export type HullRepairKind = "landed" | "orbit" | "lagrange";

export function hullRepairRate(kind: HullRepairKind) {
  if (kind === "landed") return HULL_REPAIR_LAND;
  if (kind === "orbit") return HULL_REPAIR_ORBIT;
  return HULL_REPAIR_LAGRANGE;
}

/** Seconds between weld ticks. Pad is busy; orbit and Lagrange are a wait. */
export function hullWeldInterval(kind: HullRepairKind) {
  if (kind === "landed") return 0.48;
  if (kind === "orbit") return 1.15;
  return 1.55;
}

export function repairHull(hull: number, dt: number, kind: HullRepairKind) {
  return Math.min(HULL_MAX, hull + hullRepairRate(kind) * dt);
}

/** Size + closing speed. Dust never pays. A full hull survives one pebble. */
export function hullDamage(kind: BeltTickKind, sz: number, closing: number) {
  if (kind === "dust") return 0;
  if (closing < V_SILENT) return 0;
  const u = closing / 32;
  const speedW = Math.min(1, Math.log1p(u * u) / Math.log1p(4));
  if (kind === "chip") {
    const sizeW = Math.min(1, Math.max(0.25, sz / 7));
    return Math.min(CHIP_CAP, 1 + sizeW * 2.4 * Math.max(0.45, speedW));
  }
  const sizeHeavy = Math.min(1, Math.max(0, (sz - 5) / 10));
  return Math.min(PEBBLE_CAP, 6 + sizeHeavy * 6 + speedW * 5);
}
