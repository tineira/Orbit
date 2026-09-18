import { useCallback, useEffect, useRef, useState } from "react";
import { Overlay } from "./Overlay";
import { startGame, type GameHandle } from "./runtime";
import type { HudSnapshot } from "./types";
import { HULL_MAX } from "./hull";
import { SHIP_FUEL_CAPACITY } from "./world";

const INITIAL: HudSnapshot = {
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
};

export function SpaceGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = startGame(canvas, setHud);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const onLaunch = useCallback(() => {
    if (hud.phase !== "title") return;
    gameRef.current?.launch();
  }, [hud.phase]);
  const onTakeoff = useCallback(() => {
    gameRef.current?.takeoff();
  }, []);
  const onReboot = useCallback(() => {
    gameRef.current?.reboot();
  }, []);
  const onOpenAirLock = useCallback(() => {
    gameRef.current?.openAirLock();
  }, []);
  const onNewWorld = useCallback(() => {
    if (hud.phase !== "title" && hud.phase !== "crashed") return;
    gameRef.current?.newWorld();
  }, [hud.phase]);
  const onMute = useCallback(() => {
    gameRef.current?.setMuted(!hud.muted);
  }, [hud.muted]);
  const onGravity = useCallback((dir: number) => {
    gameRef.current?.adjustGravity(dir);
  }, []);
  const onAtmo = useCallback((dir: number) => {
    gameRef.current?.adjustAtmo(dir);
  }, []);
  const onCycleFuel = useCallback((dir: number) => {
    gameRef.current?.cycleFuel(dir);
  }, []);
  const onCycleEngine = useCallback((dir: number) => {
    gameRef.current?.cycleEngine(dir);
  }, []);
  const onCycleTank = useCallback((dir: number) => {
    gameRef.current?.cycleTank(dir);
  }, []);
  const onToggleOrbitShell = useCallback(() => {
    gameRef.current?.toggleOrbitShell();
  }, []);
  const onToggleLagrange = useCallback(() => {
    gameRef.current?.toggleLagrange();
  }, []);
  const onToggleGravityGrid = useCallback(() => {
    gameRef.current?.toggleGravityGrid();
  }, []);
  const onToggleSpectro = useCallback(() => {
    gameRef.current?.toggleSpectro();
  }, []);
  const onCycleHud = useCallback(() => {
    gameRef.current?.cycleHud();
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none select-none"
        style={{ touchAction: "none" }}
        aria-label="Space flight"
      />
      <Overlay
        hud={hud}
        onLaunch={onLaunch}
        onTakeoff={onTakeoff}
        onReboot={onReboot}
        onOpenAirLock={onOpenAirLock}
        onNewWorld={onNewWorld}
        onMute={onMute}
        onGravity={onGravity}
        onAtmo={onAtmo}
        onCycleFuel={onCycleFuel}
        onCycleEngine={onCycleEngine}
        onCycleTank={onCycleTank}
        onToggleOrbitShell={onToggleOrbitShell}
        onToggleLagrange={onToggleLagrange}
        onToggleGravityGrid={onToggleGravityGrid}
        onToggleSpectro={onToggleSpectro}
        onCycleHud={onCycleHud}
      />
    </div>
  );
}
