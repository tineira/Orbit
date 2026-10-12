import { CLOCK_REVEAL_MS } from "./adrift";
import {
  campaignFromSearch,
  campaignShipFrom,
  keepCampaignMarks,
  loadCampaign,
  newCampaign,
  resumePlaceSave,
  saveCampaign,
} from "./campaign";
import { applyBodyGrant, chartStoryPlace, placeFromSearch, storyPlaceById } from "./place";
import { runTriggers, spokenLine } from "./triggers";
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
  cycleHudMode,
  listLagrangePoints,
  predictPlanetPaths,
  launchSim,
  applyDebugWarp,
  applyCampaignBoot,
  bindCampaignChart,
  applyStoryStart,
  commitPadCheckpoint,
  rebootSim,
  setUserZoom,
  simViewPrefs,
  stepSim,
  STEP,
  takeoff,
  trySpawnComet,
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
import { applyLoadout, cycleDrive as stepDrive, cycleTank as stepTank, syncFuelMass } from "./fuel";
import { HULL_MAX } from "./hull";
import type { EngineKind, FuelKind, GameUiHandler, HudSnapshot, TankKind } from "./types";
import {
  isVoiceSource,
  makeVoiceLine,
  voiceSnapshot,
  voiceTtlMs,
  type VoiceLine,
  type VoiceSource,
} from "./voice.ts";
import {
  HALLEY_BASE_URL,
  HALLEY_CORRUPT_CHECK_MS,
  HALLEY_MANIFEST_URL,
  HALLEY_POWER_OFF_MS,
  HALLEY_POWER_ON_MS,
  createHalleyView,
  halleyClipUrls,
  halleyCorruptStep,
  halleyDamage,
  halleySignal,
  isHalleyClipId,
  type HalleyManifest,
} from "./halley.ts";
import {
  PILOT_MANIFEST_URL,
  PILOT_TRIGGER_CLIP,
  isPilotClipId,
  pilotTriggersFor,
  type PilotManifest,
  type PilotSnapshot,
  type PilotTrigger,
} from "./pilot.ts";

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
  cycleHud: () => void;
  cycleDrive: (dir: number) => void;
  cycleFuel: (dir: number) => void;
  cycleEngine: (dir: number) => void;
  cycleTank: (dir: number) => void;
  playVoice: (source: VoiceSource, text: string) => void;
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
        kicker?: string | null;
        parentId?: string;
        radius: number;
        orbitR?: number;
        orbitA?: number;
        orbitW?: number;
        orbitE?: number;
        orbitPeri?: number;
        mass?: number;
        settlement?: string | null;
        pad?: "on" | "off" | null;
        matter?: string | null;
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
      getHudMode?: () => string;
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
      getNearby?: () => {
        angle: number;
        name: string;
        target?: { place?: string; leg?: string } | null;
        requires?: string | null;
      }[];
      getCampaign?: () => {
        place: string | null;
        leg: { id: string; step: number; seed: number; length?: number } | null;
        flags: string[];
        aside: boolean;
      } | null;
      getLoadout?: () => { fuel: number; fuelKind: string; engineKind: string; tankKind: string };
      setLoadout?: (fuelKind: string, engineKind: string, tankKind: string, fuel?: number) => void;
      setModules?: (ids: string[]) => void;
      getComet?: () => { x: number; y: number; vx: number; vy: number; radius: number } | null;
      getCometSpent?: () => boolean;
      getCometHeading?: () => { angle: number; kind: string; name: string } | null;
      spawnComet?: () => boolean;
      playVoice?: (source: string, text: string) => void;
      getVoice?: () => { source: string; text: string } | null;
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
  hudMode: "all",
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
  cometAvailable: false,
  voice: null,
  voiceLoading: false,
  voiceError: null,
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
  let prevCometEntered = false;
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
  let hWasDown = false;
  let eWasDown = false;
  let tWasDown = false;
  let cWasDown = false;
  let pendingPrefs: SimViewPrefs | null = null;
  let voiceLine: VoiceLine | null = null;
  let voiceTimer = 0;
  let voiceLoading = false;
  let voiceError: string | null = null;
  let voiceGen = 0;
  // Halley: the cabin CRT. Example clips are named by id in public/dev/halley,
  // and the manifest loads only with ?dev. No synthesized speech: a line with
  // no clip is the panel on her base image, static, and the subtitle.
  const halley = createHalleyView();
  let halleyBase: HTMLImageElement | null = null;
  let halleyManifest: HalleyManifest | null = null;
  let halleyGen = 0;
  let halleyVideo: HTMLVideoElement | null = null;
  let halleyAudio: { stop: () => void } | null = null;
  let halleyTimer = 0;
  let halleyCorruptTimer = 0;
  let halleyFastWarned = false;
  /** Set once the ship has been clear of every well this chart; the warning is for arrivals, not the launch. */
  let halleyLeftWell = false;
  let prevStatus: string | null = null;
  // Pilot thoughts: once per first. The example manifest loads only with ?dev.
  let pilotManifest: PilotManifest | null = null;
  const pilotFired = new Set<PilotTrigger>();
  let prevPilot: PilotSnapshot | null = null;
  /** Lines waiting for the channel (Halley talking, or another thought); played in order. */
  const thoughtQueue: { id: string; text: string; trigger: PilotTrigger | null }[] = [];
  if (devTools) {
    void fetch(PILOT_MANIFEST_URL)
      .then((r) => (r.ok ? (r.json() as Promise<PilotManifest>) : null))
      .then((m) => {
        if (m && typeof m === "object") pilotManifest = m;
      })
      .catch(() => {
        /* no clips on this build */
      });
  }
  if (devTools) {
    void fetch(HALLEY_MANIFEST_URL)
      .then((r) => (r.ok ? (r.json() as Promise<HalleyManifest>) : null))
      .then((m) => {
        if (m && typeof m === "object") halleyManifest = m;
      })
      .catch(() => {
        /* no clips on this build */
      });
  }

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
        halley,
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
      hudMode: sim.hudMode,
      ...spectroHud(sim),
      dev: devTools,
      warpCharge: sim.warpCharge,
      transitBeat: sim.phase === "transit" ? transitBeat(sim.transitAge, sim.reducedMotion) : "off",
      adrift: sim.adrift,
      adriftStartedAt: sim.adriftStartedAt,
      foodUntil: sim.foodUntil,
      airlockSeqAt: sim.airlockSeqAt,
      reducedMotion: sim.reducedMotion,
      cometAvailable: devTools && !sim.cometSpent,
      voice: voiceSnapshot(voiceLine, performance.now()),
      voiceLoading,
      voiceError,
    };
    onUi(hud);
  };

  const halleyBaseImage = () => {
    if (!halleyBase) {
      halleyBase = new Image();
      halleyBase.decoding = "async";
      halleyBase.src = HALLEY_BASE_URL;
    }
    return halleyBase;
  };

  const halleySignalNow = () => halleySignal(halleyDamage(sim?.ship.hull ?? HULL_MAX));

  const cancelHalley = () => {
    halleyGen++;
    window.clearTimeout(halleyTimer);
    window.clearInterval(halleyCorruptTimer);
    if (halleyVideo) {
      try {
        halleyVideo.pause();
      } catch {
        /* never started */
      }
      halleyVideo.removeAttribute("src");
      halleyVideo.load();
      halleyVideo.remove();
      halleyVideo = null;
    }
    halleyAudio?.stop();
    halleyAudio = null;
    halley.frame = null;
    halley.frozen = null;
    halley.freezeUntil = 0;
  };

  const halleyPowerOff = (animate = true) => {
    if (!halley.on) return;
    halley.on = false;
    halley.offAt = animate ? performance.now() : -1e9;
    if (animate) audio.spectroPower(false);
  };

  /**
   * One line through the cabin CRT: power on, 600 ms later the clip (or the
   * TTS fallback over the base image), then power off 250 ms after it ends.
   * The subtitle is the `ship` voice line; Mute keeps it.
   */
  const speakHalley = (clipId: string | null, text: string) => {
    cancelHalley();
    const gen = halleyGen;
    const vgen = ++voiceGen;
    window.clearTimeout(voiceTimer);
    audio.unlock();
    audio.stopVoice();
    const now = performance.now();
    const reduced = sim?.reducedMotion ?? reducedMotion;
    if (!halley.on) {
      halley.on = true;
      halley.onAt = now;
      audio.spectroPower(true);
    }
    voiceLine = makeVoiceLine("ship", text, now);
    voiceLine.until = now + 120_000;
    voiceLoading = true;
    voiceError = null;
    publish();

    let finished = false;
    const finish = () => {
      if (gen !== halleyGen || finished) return;
      finished = true;
      window.clearInterval(halleyCorruptTimer);
      window.clearTimeout(halleyTimer);
      halleyAudio?.stop();
      halleyAudio = null;
      halleyTimer = window.setTimeout(() => {
        if (gen !== halleyGen) return;
        halleyPowerOff();
        halley.frame = null;
        halley.frozen = null;
        halley.freezeUntil = 0;
        if (halleyVideo) {
          try {
            halleyVideo.pause();
          } catch {
            /* never started */
          }
          halleyVideo.removeAttribute("src");
          halleyVideo.load();
          halleyVideo.remove();
          halleyVideo = null;
        }
        if (vgen === voiceGen) {
          voiceLine = null;
          audio.stopVoice();
        }
        publish();
      }, HALLEY_POWER_OFF_MS);
    };

    const startClip = (id: string) => {
      const v = document.createElement("video");
      const urls = halleyClipUrls(id);
      v.src = v.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') ? urls.mp4 : urls.webm;
      v.playsInline = true;
      v.preload = "auto";
      v.muted = false;
      v.setAttribute("aria-hidden", "true");
      v.style.cssText = "position:fixed;left:-4px;top:-4px;width:2px;height:2px;opacity:0;pointer-events:none;";
      document.body.appendChild(v);
      halleyVideo = v;
      v.addEventListener(
        "loadeddata",
        () => {
          if (gen !== halleyGen) return;
          halley.frame = v;
          voiceLoading = false;
          publish();
        },
        { once: true },
      );
      v.addEventListener("ended", finish, { once: true });
      v.addEventListener(
        "error",
        () => {
          if (gen !== halleyGen) return;
          voiceError = "halley clip failed to load";
          voiceLoading = false;
          finish();
        },
        { once: true },
      );
      halleyAudio = audio.playHalleyMedia(v, halleySignalNow);
      // Corrupt memory: freeze the picture or jump the clip back and repeat a piece.
      let skips = 0;
      halleyCorruptTimer = window.setInterval(() => {
        if (gen !== halleyGen || v.paused || v.ended) return;
        const nowMs = performance.now();
        if (halley.freezeUntil && nowMs > halley.freezeUntil) {
          halley.freezeUntil = 0;
          halley.frozen = null;
          halley.glitchAt = nowMs;
        }
        const step = halleyCorruptStep(
          halleyDamage(sim?.ship.hull ?? HULL_MAX),
          v.currentTime,
          skips,
          halley.freezeUntil > 0,
          Math.random,
        );
        if (!step) return;
        if (step.kind === "freeze") {
          const fc = document.createElement("canvas");
          fc.width = Math.max(1, v.videoWidth);
          fc.height = Math.max(1, v.videoHeight);
          fc.getContext("2d")?.drawImage(v, 0, 0);
          halley.frozen = fc;
          halley.freezeUntil = nowMs + step.ms;
        } else {
          skips++;
          v.currentTime = Math.max(0.2, v.currentTime - step.seconds);
        }
        halley.glitchAt = nowMs;
      }, HALLEY_CORRUPT_CHECK_MS);
      void v.play().catch(() => {
        if (gen !== halleyGen) return;
        voiceError = "halley clip could not play";
        voiceLoading = false;
        finish();
      });
    };

    const startStatic = () => {
      halley.frame = halleyBaseImage();
      halleyAudio = audio.playHalleyStatic(halleySignalNow);
      voiceLoading = false;
      const hold = voiceTtlMs(text, "ship");
      if (voiceLine) voiceLine.until = performance.now() + hold + HALLEY_POWER_OFF_MS;
      publish();
      halleyTimer = window.setTimeout(finish, hold);
    };

    halleyTimer = window.setTimeout(
      () => {
        if (gen !== halleyGen) return;
        if (clipId) startClip(clipId);
        else startStatic();
      },
      reduced ? 0 : HALLEY_POWER_ON_MS,
    );
  };

  /**
   * A recorded pilot thought: tick, clip, white subtitle. One line at a time;
   * while Halley talks it waits and plays when her panel goes dark.
   */
  const speakThought = (id: string, text: string, trigger: PilotTrigger | null = null) => {
    if (halley.on || (voiceLine && voiceLine.source === "thought")) {
      if (!thoughtQueue.some((q) => q.id === id)) thoughtQueue.push({ id, text, trigger });
      return;
    }
    if (trigger) pilotFired.add(trigger);
    cancelHalley();
    const gen = ++voiceGen;
    audio.unlock();
    const now = performance.now();
    voiceLine = makeVoiceLine("thought", text, now);
    voiceLine.until = now + 120_000;
    voiceLoading = true;
    voiceError = null;
    publish();
    void (async () => {
      let ms = 0;
      try {
        ms = await audio.playThought(id);
      } catch (err) {
        voiceError = err instanceof Error ? err.message : String(err);
      }
      if (gen !== voiceGen) return;
      voiceLoading = false;
      if (ms === 0) voiceError = voiceError ?? "pilot clip failed to load";
      const hold = Math.max(voiceTtlMs(text, "thought"), ms + 280);
      if (voiceLine) voiceLine.until = performance.now() + hold;
      window.clearTimeout(voiceTimer);
      voiceTimer = window.setTimeout(() => {
        if (gen !== voiceGen) return;
        voiceLine = null;
        audio.stopVoice();
        publish();
      }, hold);
      publish();
    })();
  };

  const drainCampaignEvents = () => {
    if (!sim) return;
    const events = sim.campaignEvents.splice(0, sim.campaignEvents.length);
    if (events.length === 0) return;
    const campaign = sim.campaign;
    if (!campaign?.place) return;
    const place = storyPlaceById(campaign.place);
    if (!place || place.seed !== getSystem().seed) return;
    const marks = () =>
      JSON.stringify({
        flags: campaign.flags,
        firedTriggers: campaign.firedTriggers,
        revealed: campaign.revealed,
        modules: campaign.modules,
      });
    const before = marks();
    const effects = runTriggers(place.id, place.triggers, events, campaign);
    for (const effect of effects) {
      if ("grant" in effect) applyBodyGrant(sim.ship, effect.grant, campaign);
      const line = spokenLine(effect, halleyManifest, pilotManifest);
      if (!line) continue;
      if (line.source === "ship" && isHalleyClipId(line.id)) speakHalley(line.id, line.text);
      else if (line.source === "thought" && isPilotClipId(line.id)) speakThought(line.id, line.text);
    }
    if (marks() !== before) {
      keepCampaignMarks(campaign);
      saveCampaign(campaign);
    }
  };

  const playVoiceLine = (source: VoiceSource, text: string) => {
    if (!devTools) return;
    if (source === "thought") {
      const id = text.trim().toLowerCase();
      const clip = isPilotClipId(id) && pilotManifest?.[id] ? pilotManifest[id] : null;
      if (clip) {
        speakThought(id, clip.text);
        return;
      }
    }
    if (source === "ship") {
      // The ship is Halley. A clip id (`halley-01`) plays the clip when this build has it.
      const id = text.trim().toLowerCase();
      const clip = isHalleyClipId(id) && halleyManifest?.[id] ? halleyManifest[id] : null;
      if (clip) speakHalley(id, clip.text);
      else speakHalley(null, text);
      return;
    }
    cancelHalley();
    halleyPowerOff();
    const gen = ++voiceGen;
    audio.unlock();
    const now = performance.now();
    voiceLine = makeVoiceLine(source, text, now);
    voiceLoading = false;
    voiceError = null;
    // Text plus the visor bed. Recorded pilot clips come with fase 3.
    audio.playVoice(source);
    const hold = voiceTtlMs(voiceLine.text, source);
    window.clearTimeout(voiceTimer);
    voiceTimer = window.setTimeout(() => {
      if (gen !== voiceGen) return;
      voiceLine = null;
      audio.stopVoice();
      publish();
    }, hold);
    publish();
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

  const consumeHud = () => {
    const { pressed, down } = consumePress(input.state, "KeyH", hWasDown);
    hWasDown = down;
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

  const consumeComet = () => {
    const { pressed, down } = consumePress(input.state, "KeyC", cWasDown);
    cWasDown = down;
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
          kicker: p.kicker,
          parentId: p.parentId,
          radius: p.radius,
          orbitR: p.orbitR,
          orbitA: p.orbitA,
          orbitW: p.orbitW,
          orbitE: p.orbitE,
          orbitPeri: p.orbitPeri,
          mass: p.mass,
          settlement: p.settlement,
          pad: p.pad ?? null,
          matter: p.matter,
        })),
      getPos: () => ({ x: s.ship.x, y: s.ship.y, vx: s.ship.vx, vy: s.ship.vy }),
      getCamera: () => ({ x: s.camera.x, y: s.camera.y, zoom: s.camera.zoomAuto }),
      getGravityScale: () => s.gravityScale,
      getAtmoScale: () => s.atmoScale,
      getDrag: () => atmoDrag(s),
      getOrbitHint: () => s.orbitHint,
      getUserZoom: () => s.camera.userZoom,
      getOrbitShell: () => s.showOrbitShell,
      getHudMode: () => s.hudMode,
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
      getNearby: () =>
        s.nearby.map((n) => ({
          angle: n.angle,
          name: n.name,
          target: n.target ?? null,
          requires: n.requires ?? null,
        })),
      getCampaign: () =>
        s.campaign
          ? {
              place: s.campaign.place,
              leg: s.campaign.leg,
              flags: s.campaign.flags.slice(),
              aside: s.campaignAside,
            }
          : null,
      getLoadout: () => ({
        fuel: s.ship.fuel,
        fuelKind: s.ship.fuelKind,
        engineKind: s.ship.engineKind,
        tankKind: s.ship.tankKind,
      }),
      setLoadout: (fuelKind: string, engineKind: string, tankKind: string, fuel?: number) => {
        s.ship.fuelKind = fuelKind as FuelKind;
        s.ship.engineKind = engineKind as EngineKind;
        s.ship.tankKind = tankKind as TankKind;
        applyLoadout(s.ship);
        if (fuel != null) s.ship.fuel = Math.min(s.ship.fuelCapacity, Math.max(0, fuel));
        syncFuelMass(s.ship);
      },
      setModules: (ids: string[]) => {
        if (!s.campaign) return;
        const allowed = new Set(["transceiver", "atmoTrap", "hushDetector"]);
        s.campaign.modules = ids
          .filter((id): id is "transceiver" | "atmoTrap" | "hushDetector" => allowed.has(id))
          .map((module) => ({ module }));
      },
      getComet: () =>
        s.comet
          ? { x: s.comet.x, y: s.comet.y, vx: s.comet.vx, vy: s.comet.vy, radius: s.comet.radius }
          : null,
      getCometSpent: () => s.cometSpent,
      getCometHeading: () =>
        s.cometHeading
          ? { angle: s.cometHeading.angle, kind: s.cometHeading.kind, name: s.cometHeading.name }
          : null,
      spawnComet: () => trySpawnComet(s),
      playVoice: (source, text) => {
        if (!isVoiceSource(source)) return;
        playVoiceLine(source, text);
      },
      getVoice: () => voiceSnapshot(voiceLine, performance.now()),
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
    if (consumeHud()) {
      sim.hudMode = cycleHudMode(sim.hudMode);
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
    if (consumeComet() && devTools) {
      trySpawnComet(sim);
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
    drainCampaignEvents();

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
      if (sim.campaign) commitPadCheckpoint(sim);
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
    if (sim.cometEntered && !prevCometEntered) audio.cometEnter();
    prevCometEntered = sim.cometEntered;
    prevPunched = sim.transitPunched;
    if (sim.transitBoomed && !prevBoomed) audio.sonicBooms();
    prevBoomed = sim.transitBoomed;
    if (sim.phase === "transit") publish();
    prevPhase = sim.phase;
    // Halley's first line: the fast-landing warning, once per chart, when this build has the clip.
    // Only on an approach: after the ship has left its launch well, and while closing on the body.
    const nearest = sim.nearest;
    if (sim.phase === "flight" && sim.status === "deep") halleyLeftWell = true;
    const closing =
      !!nearest &&
      (sim.ship.vx - nearest.vx) * (sim.ship.x - nearest.x) +
        (sim.ship.vy - nearest.vy) * (sim.ship.y - nearest.y) <
        0;
    if (
      sim.phase === "flight" &&
      sim.status === "too-fast" &&
      prevStatus !== "too-fast" &&
      halleyLeftWell &&
      closing &&
      !halleyFastWarned &&
      halleyManifest?.["halley-01"]
    ) {
      halleyFastWarned = true;
      speakHalley("halley-01", halleyManifest["halley-01"].text);
    }
    prevStatus = sim.status;
    // Pilot thoughts: one per first (takeoff, landing, adrift, Camp in scope), from events that already exist.
    const pilotNow: PilotSnapshot = {
      phase: sim.phase,
      landedId: sim.landedId,
      adrift: sim.adrift,
      campInScope:
        !!nearest &&
        nearest.kicker === "Camp" &&
        nearest.settlement === "active" &&
        sim.status !== "deep" &&
        sim.phase !== "title",
    };
    for (const trigger of pilotTriggersFor(prevPilot, pilotNow, pilotFired)) {
      const clipId = PILOT_TRIGGER_CLIP[trigger];
      const clip = pilotManifest?.[clipId];
      if (clip) speakThought(clipId, clip.text, trigger);
    }
    prevPilot = pilotNow;
    if (thoughtQueue.length && !halley.on && !voiceLine) {
      const next = thoughtQueue.shift()!;
      speakThought(next.id, next.text, next.trigger);
    }

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
      halley,
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
    const campaignOn = campaignFromSearch(window.location.search);
    const placeId = campaignOn ? placeFromSearch(window.location.search) : null;
    const forced = placeId ? storyPlaceById(placeId) : null;
    if (campaignOn && placeId && !forced && import.meta.env.DEV) {
      throw new Error(`unknown story place ${placeId}`);
    }
    const stored = campaignOn ? loadCampaign() : null;
    const resume = resumePlaceSave(stored, forced);
    const loaded = forced && !resume ? null : stored;
    const savedPlace = loaded?.place ? storyPlaceById(loaded.place) : null;
    if (campaignOn && loaded?.place && !savedPlace && import.meta.env.DEV) {
      throw new Error(`unknown story place ${loaded.place}`);
    }
    if (forced && !resume) chartStoryPlace(forced, import.meta.env.DEV);
    else if (savedPlace) chartStoryPlace(savedPlace, import.meta.env.DEV);
    else if (loaded) createSystem(loaded.checkpoint.seed);
    else createSystem();
    sim = createSim();
    if (campaignOn) {
      if (forced && !resume) {
        sim.campaign = newCampaign({
          seed: getSystem().seed,
          landedId: sim.landedId,
          ship: campaignShipFrom(sim.ship),
          place: forced.id,
        });
        applyStoryStart(sim, forced);
        saveCampaign(sim.campaign);
      } else if (loaded) {
        sim.campaign = loaded;
        sim.campaignPlaceId = savedPlace?.id ?? null;
        applyCampaignBoot(sim);
      } else {
        sim.campaign = newCampaign({
          seed: getSystem().seed,
          landedId: sim.landedId,
          ship: campaignShipFrom(sim.ship),
        });
        saveCampaign(sim.campaign);
      }
      bindCampaignChart(sim);
    }
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
    prevCometEntered = false;
    prevSpectroVoice = "off";
    prevAirlockSeq = 0;
    prevRefueling = false;
    prevRepairing = false;
    halleyFastWarned = false;
    halleyLeftWell = false;
    prevStatus = null;
    pilotFired.clear();
    prevPilot = null;
    thoughtQueue.length = 0;
    const keys = held(input.state);
    oWasDown = keys.has("KeyO");
    lWasDown = keys.has("KeyL");
    pWasDown = keys.has("KeyP");
    gWasDown = keys.has("KeyG");
    mWasDown = keys.has("KeyM");
    nWasDown = keys.has("KeyN");
    hWasDown = keys.has("KeyH");
    eWasDown = keys.has("KeyE");
    tWasDown = keys.has("KeyT");
    cWasDown = keys.has("KeyC");
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
    window.clearTimeout(voiceTimer);
    voiceGen++;
    voiceLine = null;
    audio.stopVoice();
    cancelHalley();
    halleyPowerOff(false);
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
      getHudMode: () => "all",
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
    cycleHud() {
      if (!sim) return;
      sim.hudMode = cycleHudMode(sim.hudMode);
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
    playVoice(source, text) {
      playVoiceLine(source, text);
    },
    destroy() {
      running = false;
      window.clearTimeout(bootTimer);
      window.clearTimeout(voiceTimer);
      voiceGen++;
      cancelHalley();
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
