import type { InputState } from "./types";

const GAME_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "Enter",
  "NumpadEnter",
]);

export function createInput(canvas: HTMLCanvasElement): {
  state: InputState;
  destroy: () => void;
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
} {
  const state: InputState = {
    keys: new Set(),
    qaKeys: null,
    qaSteer: null,
    pointer: null,
  };

  if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    state.keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    state.keys.delete(e.code);
  };
  const clearKeys = () => {
    state.keys.clear();
    state.pointer = null;
  };

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-ui]")) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const p = screenToCanvas(e.clientX, e.clientY);
    state.pointer = { ...p, down: true };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!state.pointer?.down) return;
    const p = screenToCanvas(e.clientX, e.clientY);
    state.pointer = { ...p, down: true };
  };
  const onPointerUp = (e: PointerEvent) => {
    if (state.pointer) state.pointer.down = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    state,
    screenToCanvas,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

export function held(state: InputState): Set<string> {
  if (state.qaKeys) return new Set(state.qaKeys);
  return state.keys;
}

export function steerFrom(state: InputState): number {
  if (state.qaSteer != null) return state.qaSteer;
  const keys = held(state);
  let steer = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) steer += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) steer -= 1;
  return steer;
}

export function thrustFrom(state: InputState): { forward: boolean; reverse: boolean } {
  const keys = held(state);
  return {
    forward: keys.has("KeyW") || keys.has("ArrowUp") || keys.has("Space"),
    reverse: keys.has("KeyS") || keys.has("ArrowDown"),
  };
}

export function enterHeld(state: InputState): boolean {
  const keys = held(state);
  return keys.has("Enter") || keys.has("NumpadEnter");
}
