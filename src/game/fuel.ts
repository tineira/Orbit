import type { Ship } from "./types.ts";
import { FUEL_BURN_MAIN, THRUST_FORCE } from "./world.ts";

export function refillFuel(ship: Pick<Ship, "fuel" | "fuelCapacity">) {
  ship.fuel = ship.fuelCapacity;
}

export function armedEngine(
  ship: Pick<Ship, "fuel">,
  controls: { forward: boolean; reverse: boolean; aimThrust: boolean },
): "main" | "retro" | null {
  if (ship.fuel <= 0) return null;
  if (controls.forward || controls.aimThrust) return "main";
  if (controls.reverse) return "retro";
  return null;
}

export function burnFuel(ship: Pick<Ship, "fuel">, dt: number, force: number) {
  const rate = FUEL_BURN_MAIN * (force / THRUST_FORCE);
  ship.fuel = Math.max(0, ship.fuel - rate * dt);
}
