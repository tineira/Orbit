import { createAudio } from "./audio";
import { drawFrame } from "./draw";
import { createInput, enterHeld, held, steerFrom, thrustFrom } from "./input";
import {
  adjustAtmoScale,
  adjustGravityScale,
  applySimViewPrefs,
  atmoDrag,
  createSim,
  listLagrangePoints,
  predictPlanetPaths,
  launchSim,
  rebootSim,
  setUserZoom,
  simViewPrefs,
  stepSim,
  STEP,
  takeoff,
  verboseDiag,
  wrapPi,
  type Sim,
  type SimViewPrefs,
} from "./sim";
import type { GameUiHandler, HudSnapshot } from "./types";
import { createSystem, getSystem } from "./world";

export type GameHandle = {
  launch: () => void;
  takeoff: () => void;
  reboot: () => void;
  newWorld: () => void;
  setMuted: (muted: boolean) => void;
  adjustGravity: (dir: number) => void;
  adjustAtmo: (dir: number) => void;
  toggleOrbitShell: () => void;
  toggleLagrange: () => void;
  toggleGravityGrid: () => void;
  toggleVerbose: () => void;
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
      getBurned?: () => boolean;
      getFlares?: () => { angle: number; span: number; reach: number; life: number; max: number }[];
      getOrbitLock?: () => string | null;
      getOrbitE?: () => number;
      getNearestBody?: () => {
        id: string;
        x: number;
        y: number;
        mass: number;
        radius: number;
      } | null;
      getBodies?: () => {
        id: string;
        x: number;
        y: number;
        vx?: number;
        vy?: number;
        kind: string;
        parentId?: string;
        radius: number;
        orbitR?: number;
        orbitA?: number;
        orbitW?: number;
        orbitE?: number;
        orbitPeri?: number;
        mass?: number;
      }[];
      getPos?: () => { x: number; y: number; vx: number; vy: number };
      getGravityScale?: () => number;
      getAtmoScale?: () => number;
      getDrag?: () => number;
      getOrbitHint?: () => string | null;
      getPlanetPaths?: () => { id: string; n: number; travel: number }[];
      getUserZoom?: () => number;
      getOrbitShell?: () => boolean;
      getLagrangeLock?: () => string | null;
      getLagrangeShown?: () => boolean;
      getLagrangePoints?: () => {
        key: string;
        kind: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
      }[];
      getPhysicsMenu?: () => boolean;
      getGravityGrid?: () => boolean;
      getVerbose?: () => boolean;
      getSeed?: () => number | null;
      newWorld?: () => void;
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
  burned: false,
  burnCause: null,
  crashKind: null,
  muted: false,
  touching: false,
  gravityScale: 1,
  atmoScale: 1,
  orbitShell: false,
  lagrangePoints: false,
  lagrangeLocked: false,
  lagrangeLabel: null,
  physicsMenu: false,
  gravityGrid: false,
  verbose: false,
  verboseDiag: null,
};

export function startGame(canvas: HTMLCanvasElement, onUi: GameUiHandler): GameHandle {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D is not available");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sim: Sim | null = null;
  const input = createInput(canvas, {
    getUserZoom: () => sim?.camera.userZoom ?? 1,
    setUserZoom: (z) => {
      if (sim) setUserZoom(sim, z);
    },
  });
  const audio = createAudio();
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
  let enterNeedsUp = false;
  let oWasDown = false;
  let lWasDown = false;
  let pWasDown = false;
  let gWasDown = false;
  let vWasDown = false;
  let nWasDown = false;
  let pendingPrefs: SimViewPrefs | null = null;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    if (!sim) paintBoot();
    else {
      drawFrame(ctx, sim, {
        w: canvas.width,
        h: canvas.height,
        dpr,
        cssW,
        cssH,
        status: sim.status,
        phase: sim.phase,
      });
    }
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
      burned: sim.burned,
      burnCause: sim.burnCause,
      crashKind: sim.crashKind,
      muted,
      touching: !!input.state.pointer?.down,
      gravityScale: sim.gravityScale,
      atmoScale: sim.atmoScale,
      orbitShell: sim.showOrbitShell,
      lagrangePoints: sim.showLagrange,
      lagrangeLocked: !!sim.lagrangeLockKey,
      lagrangeLabel: (sim.lagrangeLockKey ?? sim.lagrangeDwellKey)?.split(":")[1] ?? null,
      physicsMenu: sim.showPhysics,
      gravityGrid: sim.showGravityGrid,
      verbose: sim.showVerbose,
      verboseDiag: sim.showVerbose ? verboseDiag(sim) : null,
    };
    onUi(hud);
  };

  const aimYaw = (): number | null => {
    if (!sim) return null;
    const p = input.state.pointer;
    if (!p?.down) return null;
    if (
      sim.phase === "title" ||
      sim.phase === "crashed" ||
      sim.phase === "landed" ||
      sim.phase === "creating"
    )
      return null;
    const world = screenToWorld(sim, p.x, p.y, cssW, cssH);
    const dx = world.x - sim.ship.x;
    const dy = world.y - sim.ship.y;
    if (dx * dx + dy * dy < 16) return null;
    return Math.atan2(-dx, -dy);
  };

  const playing = () => sim?.phase === "flight";

  const consumeEnter = () => {
    const down = enterHeld(input.state);
    if (!down) enterNeedsUp = false;
    const pressed = down && !enterWasDown;
    enterWasDown = down;
    return pressed && !enterNeedsUp;
  };

  const rebootToPad = () => {
    if (!sim) return;
    rebootSim(sim);
    enterNeedsUp = true;
    enterWasDown = true;
  };

  const consumeOrbitShell = () => {
    const down = held(input.state).has("KeyO");
    const pressed = down && !oWasDown;
    oWasDown = down;
    return pressed;
  };

  const consumeLagrange = () => {
    const down = held(input.state).has("KeyL");
    const pressed = down && !lWasDown;
    lWasDown = down;
    return pressed;
  };

  const consumePhysics = () => {
    const down = held(input.state).has("KeyP");
    const pressed = down && !pWasDown;
    pWasDown = down;
    return pressed;
  };

  const consumeGravityGrid = () => {
    const down = held(input.state).has("KeyG");
    const pressed = down && !gWasDown;
    gWasDown = down;
    return pressed;
  };

  const consumeVerbose = () => {
    const down = held(input.state).has("KeyV");
    const pressed = down && !vWasDown;
    vWasDown = down;
    return pressed;
  };

  const consumeNewWorld = () => {
    const down = held(input.state).has("KeyN");
    const pressed = down && !nWasDown;
    nWasDown = down;
    return pressed;
  };

  const attachProbe = (s: Sim) => {
    if (!import.meta.env.DEV) return;
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
        s.burned = false;
        s.burnCause = null;
        s.crashKind = null;
        s.crashAge = 0;
        s.orbitLockId = null;
        s.orbitDwell = 0;
        s.orbitLockCooldown = 0;
        s.orbitLockE = 0;
        s.orbitHint = null;
        s.lagrangeLockKey = null;
        s.lagrangeDwell = 0;
        s.lagrangeDwellKey = null;
        s.orbitDragAlarm = false;
        s.orbitDragHintT = 0;
        s.orbitBreakHint = null;
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
      getBurned: () => s.burned,
      getFlares: () =>
        s.flares.map((f) => ({
          angle: f.angle,
          span: f.span,
          reach: f.reach,
          life: f.life,
          max: f.max,
        })),
      getOrbitLock: () => s.orbitLockId,
      getOrbitE: () => (s.orbitLockId ? s.orbitLockE : 0),
      getNearestBody: () =>
        s.nearest
          ? {
              id: s.nearest.id,
              x: s.nearest.x,
              y: s.nearest.y,
              mass: s.nearest.mass,
              radius: s.nearest.radius,
            }
          : null,
      getBodies: () =>
        s.planets.map((p) => ({
          id: p.id,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          kind: p.kind,
          parentId: p.parentId,
          radius: p.radius,
          orbitR: p.orbitR,
          orbitA: p.orbitA,
          orbitW: p.orbitW,
          orbitE: p.orbitE,
          orbitPeri: p.orbitPeri,
          mass: p.mass,
        })),
      getPos: () => ({ x: s.ship.x, y: s.ship.y, vx: s.ship.vx, vy: s.ship.vy }),
      getGravityScale: () => s.gravityScale,
      getAtmoScale: () => s.atmoScale,
      getDrag: () => atmoDrag(s),
      getOrbitHint: () => s.orbitHint,
      getUserZoom: () => s.camera.userZoom,
      getOrbitShell: () => s.showOrbitShell,
      getLagrangeLock: () => s.lagrangeLockKey,
      getLagrangeShown: () => s.showLagrange,
      getPhysicsMenu: () => s.showPhysics,
      getGravityGrid: () => s.showGravityGrid,
      getVerbose: () => s.showVerbose,
      getSeed: () => getSystem().seed,
      newWorld: () => chartNewWorld(),
      getLagrangePoints: () =>
        listLagrangePoints(s).map((p) => ({
          key: p.key,
          kind: p.kind,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
        })),
      getPlanetPaths: () =>
        predictPlanetPaths(s, 10).map(({ planet, path }) => {
          const end = path[path.length - 1];
          return {
            id: planet.id,
            n: path.length,
            travel: end ? Math.hypot(end.x - planet.x, end.y - planet.y) : 0,
          };
        }),
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

    if (consumeOrbitShell()) {
      sim.showOrbitShell = !sim.showOrbitShell;
      publish();
    }
    if (consumeLagrange()) {
      sim.showLagrange = !sim.showLagrange;
      publish();
    }
    if (consumePhysics()) {
      sim.showPhysics = !sim.showPhysics;
      publish();
    }
    if (consumeGravityGrid()) {
      sim.showGravityGrid = !sim.showGravityGrid;
      publish();
    }
    if (consumeVerbose()) {
      sim.showVerbose = !sim.showVerbose;
      publish();
    }

    if (consumeEnter()) {
      if (sim.phase === "title") {
        audio.unlock();
        launchSim(sim);
        publish();
      } else if (sim.phase === "crashed") {
        audio.unlock();
        rebootToPad();
        publish();
      } else if (sim.phase === "landed") {
        audio.unlock();
        takeoff(sim);
        audio.bump(0.4);
        publish();
      }
    }
    if (consumeNewWorld() && (sim.phase === "title" || sim.phase === "crashed")) {
      chartNewWorld();
      return;
    }

    while (acc >= STEP) {
      const steer = playing() ? steerFrom(input.state) : 0;
      const thr = playing()
        ? thrustFrom(input.state)
        : { forward: false, reverse: false };
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

    audio.setThrust(
      sim.ship.thrusting && playing(),
      Math.min(1, Math.hypot(sim.ship.vx, sim.ship.vy) / 120),
    );

    if (sim.landedId && sim.landedId !== prevLanded && sim.phase !== "title") audio.land();
    prevLanded = sim.landedId;
    if (sim.crashedId && sim.crashedId !== prevCrashed) audio.crash();
    prevCrashed = sim.crashedId;
    if (sim.orbitDragAlarm) {
      audio.warn();
      sim.orbitDragAlarm = false;
    }
    if (sim.camera.trauma > prevTrauma + 0.2 && sim.phase === "flight")
      audio.bump(sim.camera.trauma);
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
    if (pendingPrefs) {
      applySimViewPrefs(sim, pendingPrefs);
      pendingPrefs = null;
    }
    attachProbe(sim);
    last = performance.now();
    acc = 0;
    prevLanded = sim.landedId;
    prevCrashed = null;
    prevTrauma = 0;
    nWasDown = held(input.state).has("KeyN");
    publish();
    raf = requestAnimationFrame(frame);
  };

  const creatingDelay = () => (reducedMotion ? 90 : 720);

  const chartNewWorld = () => {
    if (!running || !sim) return;
    if (sim.phase !== "title" && sim.phase !== "crashed") return;
    pendingPrefs = simViewPrefs(sim);
    audio.unlock();
    input.state.qaKeys = null;
    input.state.qaSteer = null;
    window.clearTimeout(bootTimer);
    cancelAnimationFrame(raf);
    sim = null;
    paintBoot();
    onUi({ ...CREATING_HUD, muted });
    attachCreatingProbe();
    bootTimer = window.setTimeout(begin, creatingDelay());
  };

  const attachCreatingProbe = () => {
    if (!import.meta.env.DEV) return;
    window.__controlsTest = {
      getYaw: () => 0,
      getSpeed: () => 0,
      getPhase: () => "creating",
      getLanded: () => null,
      getCrashed: () => null,
      getBurned: () => false,
      getFlares: () => [],
      getOrbitLock: () => null,
      getOrbitE: () => 0,
      getNearestBody: () => null,
      getBodies: () => [],
      getPos: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
      getGravityScale: () => 1,
      getAtmoScale: () => 1,
      getDrag: () => 0,
      getOrbitHint: () => null,
      getUserZoom: () => 1,
      getOrbitShell: () => false,
      getLagrangeLock: () => null,
      getLagrangeShown: () => false,
      getLagrangePoints: () => [],
      getPhysicsMenu: () => false,
      getGravityGrid: () => false,
      getVerbose: () => false,
      getPlanetPaths: () => [],
      getSeed: () => null,
      newWorld: () => {},
      adjustGravity: () => {},
      adjustAtmo: () => {},
    };
  };

  attachCreatingProbe();
  bootTimer = window.setTimeout(begin, creatingDelay());

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
      rebootToPad();
      input.state.qaKeys = null;
      input.state.qaSteer = null;
      publish();
    },
    newWorld() {
      chartNewWorld();
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
    toggleOrbitShell() {
      if (!sim) return;
      sim.showOrbitShell = !sim.showOrbitShell;
      publish();
    },
    toggleLagrange() {
      if (!sim) return;
      sim.showLagrange = !sim.showLagrange;
      publish();
    },
    toggleGravityGrid() {
      if (!sim) return;
      sim.showGravityGrid = !sim.showGravityGrid;
      publish();
    },
    toggleVerbose() {
      if (!sim) return;
      sim.showVerbose = !sim.showVerbose;
      publish();
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
