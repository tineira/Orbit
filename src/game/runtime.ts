import { CLOCK_REVEAL_MS } from "./adrift";
import { createAudio } from "./audio";
import { drawFrame } from "./draw";
import {
  consumePress,
  createInput,
  dropHeldPresses,
  enterHeld,
  held,
  steerFrom,
  thrustFrom,
} from "./input";
import {
  adjustAtmoScale,
  adjustGravityScale,
  applySimViewPrefs,
  atmoDrag,
  createSim,
  listLagrangePoints,
  predictPlanetPaths,
  launchSim,
  applyDebugWarp,
  rebootSim,
  setUserZoom,
  simViewPrefs,
  stepSim,
  STEP,
  takeoff,
  wrapPi,
  spectroHud,
  spectroVoice,
  spectroScanProgress,
  clearSpectroScan,
  openAirLock,
  hullSafeKind,
  shipIsRefueling,
  shipIsRepairing,
  type Sim,
  type SimViewPrefs,
  type SpectroVoice,
} from "./sim";
import { cycleDrive as stepDrive, cycleTank as stepTank } from "./fuel";
import { HULL_MAX } from "./hull";
import type { GameUiHandler, HudSnapshot } from "./types";
import {
  createSystem,
  devToolsFromSearch,
  getSystem,
  SHIP_FUEL_CAPACITY,
  transitBeat,
  transitArriveU,
  warpSpool,
  WARP_LOST_FADE,
  WARP_LOST_FADE_REDUCED,
  WARP_TRANSIT_VOL,
} from "./world";

export type GameHandle = {
  launch: () => void;
  takeoff: () => void;
  reboot: () => void;
  openAirLock: () => void;
  newWorld: () => void;
  setMuted: (muted: boolean) => void;
  adjustGravity: (dir: number) => void;
  adjustAtmo: (dir: number) => void;
  toggleOrbitShell: () => void;
  toggleLagrange: () => void;
  toggleGravityGrid: () => void;
  toggleSpectro: () => void;
  cycleDrive: (dir: number) => void;
  cycleFuel: (dir: number) => void;
  cycleEngine: (dir: number) => void;
  cycleTank: (dir: number) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getFuel?: () => number;
      setFuel?: (v: number) => void;
      getHull?: () => number;
      setHull?: (v: number) => void;
      getAdrift?: () => boolean;
      getFoodUntil?: () => number;
      getAdriftStartedAt?: () => number;
      setAdriftStartedAt?: (t: number) => void;
      openAirLock?: () => boolean | void;
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
      getCamera?: () => { x: number; y: number; zoom: number };
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
      getSpectro?: () => boolean;
      getScanned?: () => string[];
      getSpectroScan?: () => { id: string | null; t: number };
      markScanned?: () => string[];
      getSeed?: () => number | null;
      getWarpCharge?: () => number;
      getStarDrift?: () => { x: number; y: number };
      getTransitPunched?: () => boolean;
      getTransitBoomed?: () => boolean;
      getTransitAge?: () => number;
      getNearby?: () => { angle: number; name: string }[];
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
  fuel: SHIP_FUEL_CAPACITY,
  fuelCapacity: SHIP_FUEL_CAPACITY,
  fuelKind: "ch4",
  refueling: false,
  hull: HULL_MAX,
  repairing: false,
  engineKind: "v1",
  tankKind: "fuel",
  engineIsp: 1,
  engineThrust: 1,
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
  wreckSeed: 0,
  lostCopy: null,
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
  spectro: false,
  spectroScan: 0,
  spectroScanning: false,
  composition: null,
  dev: false,
  warpCharge: 0,
  transitBeat: "off",
  adrift: false,
  adriftStartedAt: 0,
  foodUntil: 0,
  airlockSeqAt: 0,
  reducedMotion: false,
};

export function startGame(canvas: HTMLCanvasElement, onUi: GameUiHandler): GameHandle {
  // viewport size is copied onto sim each frame for off-screen streak placement
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D is not available");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const devTools = devToolsFromSearch(window.location.search);
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
  let prevPhase: string | null = null;
  let prevSpectroVoice: SpectroVoice = "off";
  let prevPunched = false;
  let prevBoomed = false;
  let prevAirlockSeq = 0;
  let prevRefueling = false;
  let prevRepairing = false;
  let lastBeepSec = -1;
  let enterWasDown = false;
  let enterNeedsUp = false;
  let oWasDown = false;
  let lWasDown = false;
  let pWasDown = false;
  let gWasDown = false;
  let mWasDown = false;
  let nWasDown = false;
  let eWasDown = false;
  let tWasDown = false;
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
      fuel: s.fuel,
      fuelCapacity: s.fuelCapacity,
      fuelKind: s.fuelKind,
      refueling: shipIsRefueling(sim),
      hull: s.hull,
      repairing: shipIsRepairing(sim),
      engineKind: s.engineKind,
      tankKind: s.tankKind,
      engineIsp: s.engineIsp,
      engineThrust: s.engineThrust,
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
      wreckSeed: sim.wreckSeed,
      lostCopy: sim.lostCopy,
      muted,
      touching: !!input.state.pointer?.down,
      gravityScale: sim.gravityScale,
      atmoScale: sim.atmoScale,
      orbitShell: sim.showOrbitShell,
      lagrangePoints: sim.showLagrange,
      lagrangeLocked: !!sim.lagrangeLockKey,
      lagrangeLabel: (sim.lagrangeLockKey ?? sim.lagrangeDwellKey)?.split(":")[1] ?? null,
      physicsMenu: devTools && sim.showPhysics,
      gravityGrid: sim.showGravityGrid,
      ...spectroHud(sim),
      dev: devTools,
      warpCharge: sim.warpCharge,
      transitBeat: sim.phase === "transit" ? transitBeat(sim.transitAge, sim.reducedMotion) : "off",
      adrift: sim.adrift,
      adriftStartedAt: sim.adriftStartedAt,
      foodUntil: sim.foodUntil,
      airlockSeqAt: sim.airlockSeqAt,
      reducedMotion: sim.reducedMotion,
    };
    onUi(hud);
  };

  const aimYaw = (): number | null => {
    if (!sim) return null;
    const p = input.state.pointer;
    if (!p?.down) return null;
    if (
      sim.adrift ||
      sim.phase === "title" ||
      sim.phase === "crashed" ||
      sim.phase === "landed" ||
      sim.phase === "creating" ||
      sim.phase === "transit"
    )
      return null;
    const world = screenToWorld(sim, p.x, p.y, cssW, cssH);
    const dx = world.x - sim.ship.x;
    const dy = world.y - sim.ship.y;
    if (dx * dx + dy * dy < 16) return null;
    return Math.atan2(-dx, -dy);
  };

  const playing = () => sim?.phase === "flight" && !sim.adrift;

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
    const { pressed, down } = consumePress(input.state, "KeyO", oWasDown);
    oWasDown = down;
    return pressed;
  };

  const consumeLagrange = () => {
    const { pressed, down } = consumePress(input.state, "KeyL", lWasDown);
    lWasDown = down;
    return pressed;
  };

  const consumePhysics = () => {
    const { pressed, down } = consumePress(input.state, "KeyP", pWasDown);
    pWasDown = down;
    return pressed;
  };

  const consumeGravityGrid = () => {
    const { pressed, down } = consumePress(input.state, "KeyG", gWasDown);
    gWasDown = down;
    return pressed;
  };

  const consumeSpectro = () => {
    const { pressed, down } = consumePress(input.state, "KeyM", mWasDown);
    mWasDown = down;
    return pressed;
  };

  const flipSpectro = () => {
    if (!sim) return;
    sim.showSpectro = !sim.showSpectro;
    if (sim.showSpectro) sim.spectroOnAt = performance.now();
    else sim.spectroOffAt = performance.now();
    if (!sim.showSpectro) clearSpectroScan(sim);
    audio.spectroPower(sim.showSpectro);
  };

  const consumeNewWorld = () => {
    const { pressed, down } = consumePress(input.state, "KeyN", nWasDown);
    nWasDown = down;
    return pressed;
  };

  const cycleDir = () => {
    const keys = held(input.state);
    return keys.has("ShiftLeft") || keys.has("ShiftRight") ? -1 : 1;
  };

  const consumeDrive = () => {
    const { pressed, down } = consumePress(input.state, "KeyE", eWasDown);
    eWasDown = down;
    return pressed;
  };

  const consumeTank = () => {
    const { pressed, down } = consumePress(input.state, "KeyT", tWasDown);
    tWasDown = down;
    return pressed;
  };

  const attachProbe = (s: Sim) => {
    if (!import.meta.env.DEV) return;
    window.__controlsTest = {
      getYaw: () => s.ship.yaw,
      getSpeed: () => Math.hypot(s.ship.vx, s.ship.vy),
      getFuel: () => s.ship.fuel,
      setFuel: (v: number) => {
        s.ship.fuel = Math.max(0, v);
      },
      getHull: () => s.ship.hull,
      setHull: (v: number) => {
        s.ship.hull = Math.max(0, Math.min(HULL_MAX, v));
      },
      getAdrift: () => s.adrift,
      getFoodUntil: () => s.foodUntil,
      getAdriftStartedAt: () => s.adriftStartedAt,
      setAdriftStartedAt: (t: number) => {
        s.adriftStartedAt = t;
      },
      openAirLock: () => openAirLock(s),
      setSteer: (v) => {
        input.state.qaSteer = v;
      },
      setKeys: (codes) => {
        input.state.qaKeys = codes;
      },
      place: (x, y, vx, vy) => {
        s.phase = "flight";
        s.landedId = null;
        s.takeoffIgnoreId = null;
        s.crashedId = null;
        s.burned = false;
        s.burnCause = null;
        s.crashKind = null;
        s.crashAge = 0;
        s.adrift = false;
        s.adriftStartedAt = 0;
        s.foodUntil = 0;
        s.airlockSeqAt = 0;
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
      getCamera: () => ({ x: s.camera.x, y: s.camera.y, zoom: s.camera.zoomAuto }),
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
      getSpectro: () => s.showSpectro,
      getScanned: () => [...s.scannedIds],
      getSpectroScan: () => ({ id: s.spectroScanId, t: s.spectroScanT }),
      markScanned: () => {
        if (s.nearest?.id && s.nearest.matter) s.scannedIds.add(s.nearest.id);
        return [...s.scannedIds];
      },
      getSeed: () => getSystem().seed,
      getWarpCharge: () => s.warpCharge,
      getStarDrift: () => ({ x: s.camera.starDriftX, y: s.camera.starDriftY }),
      getTransitPunched: () => s.transitPunched,
      getTransitBoomed: () => s.transitBoomed,
      getTransitAge: () => s.transitAge,
      getNearby: () => s.nearby.map((n) => ({ angle: n.angle, name: n.name })),
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
    if (consumePhysics() && devTools) {
      sim.showPhysics = !sim.showPhysics;
      publish();
    }
    if (consumeGravityGrid()) {
      sim.showGravityGrid = !sim.showGravityGrid;
      publish();
    }
    if (consumeSpectro()) {
      flipSpectro();
      publish();
    }
    if (consumeDrive() && devTools) {
      stepDrive(sim.ship, cycleDir());
      publish();
    }
    if (consumeTank() && devTools) {
      stepTank(sim.ship, cycleDir());
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

    sim.viewCssW = canvas.clientWidth;
    sim.viewCssH = canvas.clientHeight;

    const live = sim;
    let stepped = false;
    const stepOnce = () => {
      const steer = playing() ? steerFrom(input.state) : 0;
      const thr = playing()
        ? thrustFrom(input.state)
        : { forward: false, reverse: false };
      const aim = aimYaw();
      const aimThrust = !!input.state.pointer?.down && playing();
      stepSim(live, STEP, {
        steer,
        forward: thr.forward,
        reverse: thr.reverse,
        aimYaw: aim,
        aimThrust,
      });
      stepped = true;
    };
    while (acc >= STEP) {
      stepOnce();
      acc -= STEP;
    }
    // 60 Hz displays often land a hair under 1/60; skipping that tick freezes the starfield.
    if (acc > STEP * 0.88) {
      stepOnce();
      acc = 0;
    }
    if (stepped) dropHeldPresses(input.state);

    audio.setThrust(
      sim.ship.thrusting && playing(),
      Math.min(1, Math.hypot(sim.ship.vx, sim.ship.vy) / 120),
    );
    audio.setAtmo(sim.phase === "flight" ? atmoDrag(sim) : 0);
    if (sim.phase === "flight") {
      audio.setBeltDust(sim.beltDust, sim.beltDustBright);
      for (const tick of sim.beltTicks) audio.hullTick(tick);
    } else {
      audio.setBeltDust(0);
    }
    audio.setAdriftAlarm(false);
    if (sim.adrift && sim.phase === "flight" && !sim.airlockSeqAt && Date.now() - sim.adriftStartedAt >= CLOCK_REVEAL_MS) {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastBeepSec) {
        lastBeepSec = sec;
        audio.clockBeep();
      }
    } else {
      lastBeepSec = -1;
    }
    const specVoice = playing() ? spectroVoice(sim) : "off";
    audio.setSpectro(specVoice, spectroScanProgress(sim), sim.reducedMotion);
    if (specVoice === "done" && prevSpectroVoice === "scan") audio.spectroPing();
    prevSpectroVoice = specVoice;
    const refueling = shipIsRefueling(sim);
    const repairing = shipIsRepairing(sim);
    audio.setRefuel(refueling, sim.reducedMotion);
    audio.setRepair(repairing, hullSafeKind(sim) ?? "landed", sim.reducedMotion);
    if (prevRefueling && !refueling && sim.ship.fuel >= sim.ship.fuelCapacity - 1e-6) {
      audio.refuelDone();
    }
    if (prevRepairing && !repairing && sim.ship.hull >= HULL_MAX - 1e-6) {
      audio.repairDone();
    }
    prevRefueling = refueling;
    prevRepairing = repairing;
    const beat = sim.phase === "transit" ? transitBeat(sim.transitAge, sim.reducedMotion) : "off";
    const lostFade = sim.reducedMotion ? WARP_LOST_FADE_REDUCED : WARP_LOST_FADE;
    if (sim.warpLost) {
      const fade =
        sim.phase === "transit" ? Math.max(0, 1 - sim.transitAge / lostFade) : 0;
      audio.setWarp(fade > 0.02, fade * WARP_TRANSIT_VOL, 1);
    } else {
      const spool =
        beat === "tunnel" || beat === "streak"
          ? WARP_TRANSIT_VOL
          : beat === "brake"
            ? transitArriveU(sim.transitAge, sim.reducedMotion) * WARP_TRANSIT_VOL
            : warpSpool(Math.hypot(sim.ship.vx, sim.ship.vy));
      audio.setWarp(spool > 0.02, spool);
    }
    if (sim.phase === "transit" && prevPhase !== "transit") {
      audio.warpJump();
    }
    prevPunched = sim.transitPunched;
    if (sim.transitBoomed && !prevBoomed) audio.sonicBooms();
    prevBoomed = sim.transitBoomed;
    if (sim.phase === "transit") publish();
    prevPhase = sim.phase;

    if (sim.landedId && sim.landedId !== prevLanded && sim.phase !== "title") audio.land();
    prevLanded = sim.landedId;
    const crashKey =
      sim.crashedId ??
      (sim.crashKind === "lost" || sim.crashKind === "airlock" || sim.crashKind === "starve"
        ? sim.crashKind
        : null);
    if (crashKey && crashKey !== prevCrashed && sim.crashKind !== "lost" && sim.crashKind !== "starve" && sim.crashKind !== "airlock") {
      audio.crash();
    }
    prevCrashed = crashKey;
    if (prevAirlockSeq && !sim.airlockSeqAt && sim.crashKind !== "airlock") {
      audio.cancelAirlockSequence();
    }
    prevAirlockSeq = sim.airlockSeqAt;
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
    if (sim.airlockSeqAt || hudTick > 0.08) {
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
    applyDebugWarp(sim);
    last = performance.now();
    acc = 0;
    prevLanded = sim.landedId;
    prevCrashed = null;
    prevTrauma = 0;
    prevSpectroVoice = "off";
    prevAirlockSeq = 0;
    prevRefueling = false;
    prevRepairing = false;
    const keys = held(input.state);
    oWasDown = keys.has("KeyO");
    lWasDown = keys.has("KeyL");
    pWasDown = keys.has("KeyP");
    gWasDown = keys.has("KeyG");
    mWasDown = keys.has("KeyM");
    nWasDown = keys.has("KeyN");
    eWasDown = keys.has("KeyE");
    tWasDown = keys.has("KeyT");
    input.state.presses.clear();
    publish();
    raf = requestAnimationFrame(frame);
  };

  const creatingDelay = () => (reducedMotion ? 90 : 720);

  const chartNewWorld = () => {
    if (!running || !sim) return;
    if (sim.phase !== "title" && sim.phase !== "crashed") return;
    pendingPrefs = simViewPrefs(sim);
    audio.unlock();
    audio.cancelAirlockSequence();
    input.state.qaKeys = null;
    input.state.qaSteer = null;
    input.state.presses.clear();
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
      getFuel: () => SHIP_FUEL_CAPACITY,
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
      getSpectro: () => false,
      getScanned: () => [],
      getSpectroScan: () => ({ id: null, t: 0 }),
      getPlanetPaths: () => [],
      getSeed: () => null,
      getWarpCharge: () => 0,
      getStarDrift: () => ({ x: 0, y: 0 }),
      getTransitPunched: () => false,
      getTransitBoomed: () => false,
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
      audio.cancelAirlockSequence();
      rebootToPad();
      input.state.qaKeys = null;
      input.state.qaSteer = null;
      input.state.presses.clear();
      publish();
    },
    openAirLock() {
      if (!sim) return;
      audio.unlock();
      if (openAirLock(sim)) {
        audio.airlockSequence(sim.reducedMotion);
        publish();
      }
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
    toggleSpectro() {
      flipSpectro();
      publish();
    },
    cycleDrive(dir) {
      if (!sim || !devTools) return;
      stepDrive(sim.ship, dir);
      publish();
    },
    cycleFuel(dir) {
      if (!sim || !devTools) return;
      stepDrive(sim.ship, dir);
      publish();
    },
    cycleEngine(dir) {
      if (!sim || !devTools) return;
      stepDrive(sim.ship, dir);
      publish();
    },
    cycleTank(dir) {
      if (!sim || !devTools) return;
      stepTank(sim.ship, dir);
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
