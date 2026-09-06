import { createAudio } from "./audio";
import { drawFrame } from "./draw";
import { createInput, enterHeld, steerFrom, thrustFrom } from "./input";
import {
  adjustAtmoScale,
  adjustGravityScale,
  atmoDrag,
  createSim,
  launchSim,
  rebootSim,
  stepSim,
  STEP,
  takeoff,
  wrapPi,
  type Sim,
} from "./sim";
import type { GameUiHandler, HudSnapshot } from "./types";
import { createSystem } from "./world";

export type GameHandle = {
  launch: () => void;
  takeoff: () => void;
  reboot: () => void;
  setMuted: (muted: boolean) => void;
  adjustGravity: (dir: number) => void;
  adjustAtmo: (dir: number) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
      place?: (x: number, y: number, vx: number, vy: number) => void;
      getPhase?: () => string;
      getLanded?: () => string | null;
      getCrashed?: () => string | null;
      getOrbitLock?: () => string | null;
      getOrbitE?: () => number;
      getNearestBody?: () => { id: string; x: number; y: number; mass: number; radius: number } | null;
      getPos?: () => { x: number; y: number; vx: number; vy: number };
      getGravityScale?: () => number;
      getAtmoScale?: () => number;
      getDrag?: () => number;
      getOrbitHint?: () => string | null;
      adjustGravity?: (dir: number) => void;
      adjustAtmo?: (dir: number) => void;
    };
  }
}

const CREATING_HUD: HudSnapshot = {
  phase: "creating",
  speed: 0,
  drag: 0,
  headingDeg: 0,
  mass: 1,
  nearestId: null,
  nearestName: null,
  altitude: null,
  status: "deep",
  orbitHint: null,
  orbitLocked: false,
  orbitEcc: 0,
  landedId: null,
  crashedId: null,
  muted: false,
  touching: false,
  gravityScale: 1,
  atmoScale: 1,
};

export function startGame(canvas: HTMLCanvasElement, onUi: GameUiHandler): GameHandle {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D is not available");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const input = createInput(canvas);
  const audio = createAudio();

  let sim: Sim | null = null;
  let muted = false;
  let running = true;
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let bootTimer = 0;
  let hudTick = 0;
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let prevLanded: string | null = null;
  let prevCrashed: string | null = null;
  let prevTrauma = 0;
  let enterWasDown = false;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    if (!sim) paintBoot();
  };
  const paintBoot = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, cssW, cssH);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  onUi({ ...CREATING_HUD, muted });

  const publish = () => {
    if (!sim) {
      onUi({ ...CREATING_HUD, muted });
      return;
    }
    const s = sim.ship;
    const hud: HudSnapshot = {
      phase: sim.phase,
      speed: Math.hypot(s.vx, s.vy),
      drag: atmoDrag(sim),
      headingDeg: ((wrapPi(s.yaw) * 180) / Math.PI + 360) % 360,
      mass: s.mass,
      nearestId: sim.nearest?.id ?? null,
      nearestName: sim.nearest?.name ?? null,
      altitude: sim.altitude,
      status: sim.status,
      orbitHint: sim.orbitHint,
      orbitLocked: !!sim.orbitLockId,
      orbitEcc: sim.orbitLockId ? sim.orbitLockE : 0,
      landedId: sim.landedId,
      crashedId: sim.crashedId,
      muted,
      touching: !!input.state.pointer?.down,
      gravityScale: sim.gravityScale,
      atmoScale: sim.atmoScale,
    };
    onUi(hud);
  };

  const aimYaw = (): number | null => {
    if (!sim) return null;
    const p = input.state.pointer;
    if (!p?.down) return null;
    if (sim.phase === "title" || sim.phase === "crashed" || sim.phase === "landed" || sim.phase === "creating") return null;
    const world = screenToWorld(sim, p.x, p.y, cssW, cssH);
    const dx = world.x - sim.ship.x;
    const dy = world.y - sim.ship.y;
    if (dx * dx + dy * dy < 16) return null;
    return Math.atan2(-dx, -dy);
  };

  const playing = () => sim?.phase === "flight";

  const consumeEnter = () => {
    const down = enterHeld(input.state);
    const pressed = down && !enterWasDown;
    enterWasDown = down;
    return pressed;
  };

  const attachProbe = (s: Sim) => {
    window.__controlsTest = {
      getYaw: () => s.ship.yaw,
      getSpeed: () => Math.hypot(s.ship.vx, s.ship.vy),
      setSteer: (v) => {
        input.state.qaSteer = v;
      },
      setKeys: (codes) => {
        input.state.qaKeys = codes;
      },
      place: (x, y, vx, vy) => {
        s.phase = "flight";
        s.landedId = null;
        s.crashedId = null;
        s.orbitLockId = null;
        s.orbitDwell = 0;
        s.orbitLockCooldown = 0;
        s.orbitLockE = 0;
        s.orbitHint = null;
        s.orbitDragAlarm = false;
        s.orbitDragHintT = 0;
        s.status = "deep";
        s.ship.x = x;
        s.ship.y = y;
        s.ship.vx = vx;
        s.ship.vy = vy;
        s.ship.thrusting = false;
        s.ship.reverse = false;
        s.camera.x = x;
        s.camera.y = y;
      },
      getPhase: () => s.phase,
      getLanded: () => s.landedId,
      getCrashed: () => s.crashedId,
      getOrbitLock: () => s.orbitLockId,
      getOrbitE: () => (s.orbitLockId ? s.orbitLockE : 0),
      getNearestBody: () =>
        s.nearest
          ? { id: s.nearest.id, x: s.nearest.x, y: s.nearest.y, mass: s.nearest.mass, radius: s.nearest.radius }
          : null,
      getPos: () => ({ x: s.ship.x, y: s.ship.y, vx: s.ship.vx, vy: s.ship.vy }),
      getGravityScale: () => s.gravityScale,
      getAtmoScale: () => s.atmoScale,
      getDrag: () => atmoDrag(s),
      getOrbitHint: () => s.orbitHint,
      adjustGravity: (dir) => adjustGravityScale(s, dir),
      adjustAtmo: (dir) => adjustAtmoScale(s, dir),
    };
  };

  const frame = (now: number) => {
    if (!running || !sim) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    if (acc > 0.25) acc = 0.25;

    if (consumeEnter()) {
      if (sim.phase === "title") {
        audio.unlock();
        launchSim(sim);
        publish();
      } else if (sim.phase === "crashed") {
        audio.unlock();
        rebootSim(sim);
        publish();
      } else if (sim.phase === "landed") {
        audio.unlock();
        takeoff(sim);
        audio.bump(0.4);
        publish();
      }
    }

    while (acc >= STEP) {
      const steer = playing() || sim.phase === "landed" ? steerFrom(input.state) : 0;
      const thr = playing() || sim.phase === "landed" ? thrustFrom(input.state) : { forward: false, reverse: false };
      const aim = aimYaw();
      const aimThrust = !!input.state.pointer?.down && playing();
      stepSim(sim, STEP, {
        steer,
        forward: thr.forward,
        reverse: thr.reverse,
        aimYaw: aim,
        aimThrust,
      });
      acc -= STEP;
    }

    audio.setThrust(sim.ship.thrusting && playing(), Math.min(1, Math.hypot(sim.ship.vx, sim.ship.vy) / 120));

    if (sim.landedId && sim.landedId !== prevLanded) audio.land();
    prevLanded = sim.landedId;
    if (sim.crashedId && sim.crashedId !== prevCrashed) audio.crash();
    prevCrashed = sim.crashedId;
    if (sim.orbitDragAlarm) {
      audio.warn();
      sim.orbitDragAlarm = false;
    }
    if (sim.camera.trauma > prevTrauma + 0.2 && sim.phase === "flight") audio.bump(sim.camera.trauma);
    prevTrauma = sim.camera.trauma;

    drawFrame(ctx, sim, {
      w: canvas.width,
      h: canvas.height,
      dpr,
      cssW,
      cssH,
      status: sim.status,
      phase: sim.phase,
    });

    hudTick += dt;
    if (hudTick > 0.08) {
      hudTick = 0;
      publish();
    }

    raf = requestAnimationFrame(frame);
  };

  const begin = () => {
    if (!running || sim) return;
    createSystem();
    sim = createSim();
    sim.reducedMotion = reducedMotion;
    attachProbe(sim);
    last = performance.now();
    publish();
    raf = requestAnimationFrame(frame);
  };

  window.__controlsTest = {
    getYaw: () => 0,
    getSpeed: () => 0,
    getPhase: () => "creating",
    getLanded: () => null,
    getCrashed: () => null,
    getOrbitLock: () => null,
    getOrbitE: () => 0,
    getNearestBody: () => null,
    getPos: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
    getGravityScale: () => 1,
    getAtmoScale: () => 1,
    getDrag: () => 0,
    getOrbitHint: () => null,
    adjustGravity: () => {},
    adjustAtmo: () => {},
  };

  const minMs = reducedMotion ? 90 : 720;
  bootTimer = window.setTimeout(begin, minMs);

  return {
    launch() {
      if (!sim || sim.phase !== "title") return;
      audio.unlock();
      launchSim(sim);
      publish();
    },
    takeoff() {
      if (!sim) return;
      audio.unlock();
      takeoff(sim);
      audio.bump(0.4);
      publish();
    },
    reboot() {
      if (!sim) return;
      audio.unlock();
      rebootSim(sim);
      input.state.qaKeys = null;
      input.state.qaSteer = null;
      publish();
    },
    setMuted(next) {
      muted = next;
      audio.setMuted(next);
      publish();
    },
    adjustGravity(dir) {
      if (!sim) return;
      if (adjustGravityScale(sim, dir)) publish();
    },
    adjustAtmo(dir) {
      if (!sim) return;
      if (adjustAtmoScale(sim, dir)) publish();
    },
    destroy() {
      running = false;
      window.clearTimeout(bootTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.destroy();
      audio.destroy();
      if (window.__controlsTest) delete window.__controlsTest;
    },
  };
}

function screenToWorld(sim: Sim, sx: number, sy: number, cssW: number, cssH: number) {
  const cam = sim.camera;
  return {
    x: cam.x + (sx - cssW / 2) / cam.zoom,
    y: cam.y + (sy - cssH / 2) / cam.zoom,
  };
}
