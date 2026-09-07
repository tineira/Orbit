import { useCallback, useEffect, useRef, useState } from "react";
import { Overlay } from "./Overlay";
import { startGame, type GameHandle } from "./runtime";
import type { HudSnapshot } from "./types";

const INITIAL: HudSnapshot = {
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
  const onToggleOrbitShell = useCallback(() => {
    gameRef.current?.toggleOrbitShell();
  }, []);
  const onToggleLagrange = useCallback(() => {
    gameRef.current?.toggleLagrange();
  }, []);
  const onToggleGravityGrid = useCallback(() => {
    gameRef.current?.toggleGravityGrid();
  }, []);
  const onToggleVerbose = useCallback(() => {
    gameRef.current?.toggleVerbose();
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
        onNewWorld={onNewWorld}
        onMute={onMute}
        onGravity={onGravity}
        onAtmo={onAtmo}
        onToggleOrbitShell={onToggleOrbitShell}
        onToggleLagrange={onToggleLagrange}
        onToggleGravityGrid={onToggleGravityGrid}
        onToggleVerbose={onToggleVerbose}
      />
    </div>
  );
}
