import type { InputState } from "./types";
import { USER_ZOOM_MAX, USER_ZOOM_MIN } from "./sim";

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
  "Equal",
  "Minus",
  "NumpadAdd",
  "NumpadSubtract",
  "KeyO",
  "KeyL",
  "KeyP",
]);

const ZOOM_KEY_FACTOR = 1.14;

export type ZoomHooks = {
  getUserZoom: () => number;
  setUserZoom: (z: number) => void;
};

export function createInput(
  canvas: HTMLCanvasElement,
  zoom?: ZoomHooks,
): {
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

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number } | null = null;
  let pinching = false;
  let suppressClick = false;

  const clampZoom = (z: number) => Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, z));

  const applyZoomFactor = (factor: number) => {
    if (!zoom) return;
    zoom.setUserZoom(clampZoom(zoom.getUserZoom() * factor));
  };

  const pointerList = () => [...pointers.values()];

  const twoDist = () => {
    const pts = pointerList();
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  };

  const isUi = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t?.closest("[data-ui]");
  };

  const isZoomKey = (e: KeyboardEvent) => {
    const { code, key } = e;
    if (code === "Equal" || code === "NumpadAdd" || key === "+") return 1;
    if (code === "Minus" || code === "NumpadSubtract" || key === "-" || key === "_") return -1;
    return 0;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const zoomDir = isZoomKey(e);
    if (zoomDir) {
      e.preventDefault();
      applyZoomFactor(zoomDir > 0 ? ZOOM_KEY_FACTOR : 1 / ZOOM_KEY_FACTOR);
    }
    if (GAME_CODES.has(e.code)) e.preventDefault();
    state.keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    state.keys.delete(e.code);
  };
  const clearKeys = () => {
    state.keys.clear();
    state.pointer = null;
    pointers.clear();
    pinch = null;
    pinching = false;
  };

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onWheel = (e: WheelEvent) => {
    if (isUi(e)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    applyZoomFactor(Math.exp(-dy * 0.0016));
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = screenToCanvas(e.clientX, e.clientY);
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2) {
      pinching = true;
      suppressClick = true;
      state.pointer = state.pointer ? { ...state.pointer, down: false } : null;
      const dist = twoDist();
      pinch = { dist: Math.max(24, dist), zoom: zoom?.getUserZoom() ?? 1 };
      return;
    }

    if (isUi(e) || pinching) return;
    canvas.focus({ preventScroll: true });
    if (e.target === canvas || canvas.contains(e.target as Node)) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    state.pointer = { ...p, down: true };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = screenToCanvas(e.clientX, e.clientY);
    pointers.set(e.pointerId, p);

    if (pinching && pointers.size >= 2 && pinch && zoom) {
      const dist = twoDist();
      zoom.setUserZoom(clampZoom(pinch.zoom * (dist / pinch.dist)));
      return;
    }

    if (!state.pointer?.down) return;
    state.pointer = { ...p, down: true };
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      pinching = false;
      if (state.pointer) state.pointer.down = false;
    }
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearKeys);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("click", onClickCapture, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    state,
    screenToCanvas,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("click", onClickCapture, true);
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
