import { useEffect, useState, type ReactNode } from "react";
import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import type {
  CompositionReadout,
  EngineKind,
  FuelKind,
  HudSnapshot,
  TankKind,
  VerboseDiag,
} from "./types";
import { engineGrade, fuelGrade, tankGrade } from "./fuel";
import { HULL_MAX } from "./hull";
import { bodyReadout, SCAN_SECONDS } from "./matter";
import { ATMO_STEPS, GRAVITY_STEPS, getPlanets, isGhostBody, planetById } from "./world";
import { AIRLOCK_DELAY_MS, splitFoodClock, usesLostCard } from "./adrift";
import { cn } from "@/lib/utils";

const ORBIT_DRAG_HINT = "Atmosphere — orbit lost";
const ORBIT_PERTURB_HINT = "Perturbed — orbit lost";

function isOrbitLostHint(hint: string | null) {
  return hint === ORBIT_DRAG_HINT || hint === ORBIT_PERTURB_HINT;
}

type Props = {
  hud: HudSnapshot;
  onLaunch: () => void;
  onTakeoff: () => void;
  onReboot: () => void;
  onNewWorld: () => void;
  onMute: () => void;
  onGravity: (dir: number) => void;
  onAtmo: (dir: number) => void;
  onCycleFuel: (dir: number) => void;
  onCycleEngine: (dir: number) => void;
  onCycleTank: (dir: number) => void;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
  onToggleSpectro: () => void;
  onOpenAirLock: () => void;
};

function isEnterKey(e: KeyboardEvent) {
  return e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter";
}

export function Overlay({
  hud,
  onLaunch,
  onTakeoff,
  onReboot,
  onNewWorld,
  onMute,
  onGravity,
  onAtmo,
  onCycleFuel,
  onCycleEngine,
  onCycleTank,
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleVerbose,
  onToggleSpectro,
  onOpenAirLock,
}: Props) {
  const landed = hud.landedId ? planetById(hud.landedId) : null;
  const crashed = hud.crashedId ? planetById(hud.crashedId) : null;
  const dev = hud.dev;

  useEffect(() => {
    if (hud.phase !== "title") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isEnterKey(e)) return;
      e.preventDefault();
      onLaunch();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onLaunch]);

  useEffect(() => {
    if (hud.phase !== "crashed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyR" || e.code === "Space" || isEnterKey(e)) {
        e.preventDefault();
        onReboot();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onReboot]);

  useEffect(() => {
    if (hud.phase !== "landed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !isEnterKey(e)) return;
      e.preventDefault();
      onTakeoff();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onTakeoff]);

  useEffect(() => {
    if (hud.phase !== "title" && hud.phase !== "crashed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== "KeyN") return;
      e.preventDefault();
      onNewWorld();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onNewWorld]);

  return (
    <div className="pointer-events-none absolute inset-0 text-fg">
      {hud.phase === "creating" ? <Creating /> : null}
      {hud.phase === "transit" ? (
        <Transit beat={hud.transitBeat} name={hud.nearestName} />
      ) : null}
      {hud.phase === "title" ? (
        <Title
          onLaunch={onLaunch}
          onNewWorld={onNewWorld}
          physicsMenu={hud.physicsMenu}
          orbitShell={hud.orbitShell}
          lagrangePoints={hud.lagrangePoints}
          gravityGrid={hud.gravityGrid}
          onToggleOrbitShell={onToggleOrbitShell}
          onToggleLagrange={onToggleLagrange}
          onToggleGravityGrid={onToggleGravityGrid}
          verbose={hud.verbose}
          onToggleVerbose={onToggleVerbose}
          spectro={hud.spectro}
          onToggleSpectro={onToggleSpectro}
          dev={dev}
        />
      ) : null}

      {hud.phase !== "title" && hud.phase !== "creating" && hud.phase !== "transit" ? (
        <>
          <header className="absolute top-0 left-0 right-0 flex flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted">
                  Nearest body
                </p>
                <p className="mt-1 font-display text-2xl leading-tight font-medium tracking-tight text-fg">
                  {hud.nearestName ?? "—"}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                  {hud.altitude != null ? `ALT ${fmt(hud.altitude)}` : "DEEP SPACE"}
                  <span className="mx-2 text-subtle">/</span>
                  {statusLabel(hud)}
                </p>
                {hud.composition ? (
                  <BodyMixLines className="mt-1.5" mix={hud.composition} />
                ) : null}
                {hud.spectroScanning ? <ScanPips frac={hud.spectroScan} /> : null}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div
                  data-ui
                  className="pointer-events-auto w-64 rounded-lg border border-border bg-surface/80 p-3 backdrop-blur-sm sm:w-[28rem]"
                >
                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <PanelRow label="Speed">
                        {fmt(hud.speed)} <span className="text-muted">u/s</span>
                      </PanelRow>
                      <PanelRow label="Drag">{fmt(hud.drag)}</PanelRow>
                      <PanelRow label="Heading">
                        {hud.headingDeg.toFixed(0).padStart(3, "0")}°
                      </PanelRow>
                      <PanelRow label="Mass">{hud.mass.toFixed(2)}</PanelRow>
                    </div>
                    <div className="mt-2.5 border-t border-border pt-2.5 sm:mt-0 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
                      <FuelPanel
                        kind={hud.fuelKind}
                        engineKind={hud.engineKind}
                        tankKind={hud.tankKind}
                        engineIsp={hud.engineIsp}
                        engineThrust={hud.engineThrust}
                        dev={dev}
                        onCycleFuel={onCycleFuel}
                        onCycleEngine={onCycleEngine}
                        onCycleTank={onCycleTank}
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-border pt-2.5 sm:grid-cols-2">
                    <GaugeRow
                      label="Hull"
                      ariaLabel="Hull integrity"
                      value={hud.hull}
                      max={HULL_MAX}
                      unit=""
                      note={hud.repairing ? "Repair" : null}
                    />
                    <GaugeRow
                      label="Fuel"
                      ariaLabel="Fuel"
                      value={hud.fuel}
                      max={hud.fuelCapacity}
                      unit=" L"
                      note={hud.refueling ? "Refuel" : null}
                    />
                  </div>
                </div>
                {dev && hud.physicsMenu ? (
                  <PhysicsKnobs
                    gravityScale={hud.gravityScale}
                    atmoScale={hud.atmoScale}
                    onGravity={onGravity}
                    onAtmo={onAtmo}
                  />
                ) : null}
              </div>
            </div>
            {dev && hud.verbose && hud.verboseDiag ? <VerbosePanel diag={hud.verboseDiag} /> : null}
            {dev && hud.verbose && hud.phase === "flight" ? <VerboseMatter /> : null}
          </header>

          <div className="absolute bottom-16 left-0 p-4 sm:p-6 max-w-[22rem]">
            <button
              type="button"
              data-ui
              onClick={onMute}
              aria-label={hud.muted ? "Unmute" : "Mute"}
              className="pointer-events-auto mb-3 size-11 grid place-items-center rounded-md text-muted hover:text-fg transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]"
            >
              {hud.muted ? (
                <VolumeX className="size-4" strokeWidth={1.75} />
              ) : (
                <Volume2 className="size-4" strokeWidth={1.75} />
              )}
            </button>
            <p className="font-mono text-xs leading-relaxed text-muted">
              {hud.adrift ? (
                <span>No propellant. The craft coasts.</span>
              ) : (
                <>
                  <span className="hidden sm:inline">
                    Left / right yaw. Up burns. Down retro. + / − or scroll to zoom.
                  </span>
                  <span className="sm:hidden">Hold to point and burn. Pinch to zoom.</span>
                </>
              )}
            </p>
            {hud.adrift ? null : (
              <p className="mt-2 flex font-mono text-xs">
                <KeyTips
                  orbitShell={hud.orbitShell}
                  lagrangePoints={hud.lagrangePoints}
                  physicsMenu={hud.physicsMenu}
                  gravityGrid={hud.gravityGrid}
                  verbose={hud.verbose}
                  spectro={hud.spectro}
                  onToggleOrbitShell={onToggleOrbitShell}
                  onToggleLagrange={onToggleLagrange}
                  onToggleGravityGrid={onToggleGravityGrid}
                  onToggleVerbose={onToggleVerbose}
                  onToggleSpectro={onToggleSpectro}
                  dev={dev}
                />
              </p>
            )}
            {hud.orbitShell ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Orbit shell · {hud.nearestName ?? "—"}
              </p>
            ) : null}
            {hud.lagrangePoints ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Lagrange points
              </p>
            ) : null}
            {hud.gravityGrid ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Gravity grid
              </p>
            ) : null}
            {dev && hud.verbose ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Verbose
              </p>
            ) : null}
            {hud.spectro ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Mass spec
              </p>
            ) : null}
            {hud.orbitHint && hud.phase !== "crashed" ? (
              <p
                className={cn(
                  "mt-2 font-mono text-xs tracking-wide uppercase",
                  hud.adrift ||
                  hud.status === "too-fast" ||
                    hud.status === "crashed" ||
                    hud.orbitHint === ORBIT_DRAG_HINT ||
                    hud.orbitHint === ORBIT_PERTURB_HINT ||
                    isOrbitLostHint(hud.orbitHint) ||
                    (hud.status === "warp" && hud.warpCharge >= 0.7)
                    ? "text-warn"
                    : hud.status === "orbit" || hud.status === "lagrange"
                      ? "text-ok"
                      : "text-accent",
                )}
              >
                {hud.orbitHint}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {hud.phase === "title" ? (
        <div className="pointer-events-auto absolute top-[max(1rem,env(safe-area-inset-top))] right-4 sm:right-8 flex flex-col items-end gap-3">
          <button
            type="button"
            data-ui
            onClick={onMute}
            aria-label={hud.muted ? "Unmute" : "Mute"}
            className="size-11 grid place-items-center rounded-md text-muted hover:text-fg transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]"
          >
            {hud.muted ? (
              <VolumeX className="size-4" strokeWidth={1.75} />
            ) : (
              <Volume2 className="size-4" strokeWidth={1.75} />
            )}
          </button>
          {dev && hud.physicsMenu ? (
            <PhysicsKnobs
              gravityScale={hud.gravityScale}
              atmoScale={hud.atmoScale}
              onGravity={onGravity}
              onAtmo={onAtmo}
            />
          ) : null}
        </div>
      ) : null}

      {hud.phase === "flight" && hud.adrift ? (
        <AdriftCard
          startedAt={hud.adriftStartedAt}
          foodUntil={hud.foodUntil}
          onAirlock={onOpenAirLock}
        />
      ) : null}

      {hud.phase === "landed" && landed ? (
        <LandingCard planet={landed} onTakeoff={onTakeoff} />
      ) : null}

      {hud.phase === "crashed" && usesLostCard(hud.crashKind) && hud.lostCopy ? (
        <LostCard copy={hud.lostCopy} onReboot={onReboot} onNewWorld={onNewWorld} />
      ) : null}
      {hud.phase === "crashed" && !usesLostCard(hud.crashKind) ? (
        <CrashCard
          burned={hud.burned}
          crashKind={hud.crashKind}
          detail={crashDetail(
            crashed?.name ?? null,
            hud.burned,
            hud.burnCause,
            hud.crashKind,
            crashed,
            hud.wreckSeed,
          )}
          onReboot={onReboot}
          onNewWorld={onNewWorld}
        />
      ) : null}
    </div>
  );
}

function Creating() {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-muted">A small system</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl md:text-7xl leading-none tracking-tight font-semibold text-fg">
          Lumen
        </h1>
      </div>
      <p
        className="creating-world font-mono text-sm tracking-[0.2em] uppercase text-muted"
        aria-live="polite"
      >
        Creating world
      </p>
    </div>
  );
}

function Transit({ beat, name }: { beat: HudSnapshot["transitBeat"]; name: string | null }) {
  if (beat !== "brake") return null;
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-muted">A small system</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl md:text-7xl leading-none tracking-tight font-semibold text-fg">
          {name ?? "Lumen"}
        </h1>
      </div>
    </div>
  );
}

function Title({
  onLaunch,
  onNewWorld,
  physicsMenu,
  orbitShell,
  lagrangePoints,
  gravityGrid,
  verbose,
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleVerbose,
  spectro,
  onToggleSpectro,
  dev,
}: {
  onLaunch: () => void;
  onNewWorld: () => void;
  physicsMenu: boolean;
  orbitShell: boolean;
  lagrangePoints: boolean;
  gravityGrid: boolean;
  verbose: boolean;
  spectro: boolean;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
  onToggleSpectro: () => void;
  dev: boolean;
}) {
  const destinations = getPlanets().filter((p) => {
    if (p.kind === "star" || isGhostBody(p)) return false;
    return true;
  });
  return (
    <div
      className="pointer-events-auto absolute inset-0 flex flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8"
      onClick={(e) => {
        if ((e.target as HTMLElement | null)?.closest("[data-ui]")) return;
        onLaunch();
      }}
    >
      <div className={physicsMenu ? "pr-[13rem]" : "pr-14"}>
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-muted">A small system</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl md:text-7xl leading-none tracking-tight font-semibold text-fg">
          Lumen
        </h1>
        <p className="mt-4 max-w-md text-sm sm:text-base leading-relaxed text-muted">
          A 2D craft with mass and inertia. Each world has its own well. Catch a circular or
          elliptical orbit and it locks. Burn to leave. Land if you arrive slow.
        </p>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-muted sm:grid-cols-3">
          {destinations.map((p) => (
            <li key={p.id} className="flex flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className="font-display text-sm font-medium tracking-tight text-fg">
                  {p.name}
                </span>
                <span className="text-subtle">{p.kicker}</span>
              </span>
              {verbose ? <BodyMixLines mix={bodyReadout(p)} /> : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-start gap-3 lg:mr-[13.5rem]">
          <p className="font-mono text-xs text-subtle max-w-xs">
            Press Enter to take off. Left / right rotate. Up burns. On a phone, tap the sky.
          </p>
          <p className="flex font-mono text-xs max-w-[16rem]">
            <KeyTips
              orbitShell={orbitShell}
              lagrangePoints={lagrangePoints}
              physicsMenu={physicsMenu}
              gravityGrid={gravityGrid}
              verbose={verbose}
              spectro={spectro}
              onToggleOrbitShell={onToggleOrbitShell}
              onToggleLagrange={onToggleLagrange}
              onToggleGravityGrid={onToggleGravityGrid}
              onToggleVerbose={onToggleVerbose}
              onToggleSpectro={onToggleSpectro}
              dev={dev}
            />
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-ui
              onClick={onLaunch}
              className="pointer-events-auto h-12 px-5 rounded-lg bg-fg text-accent-fg text-sm font-medium tracking-wide inline-flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
            >
              <span>Take off</span>
              <kbd className="font-mono text-xs tracking-widest uppercase px-1.5 py-0.5 rounded border border-accent-fg/25 opacity-70">
                Enter
              </kbd>
            </button>
            <NewWorldButton onNewWorld={onNewWorld} size="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NewWorldButton({
  onNewWorld,
  size = "md",
}: {
  onNewWorld: () => void;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      data-ui
      onClick={(e) => {
        e.stopPropagation();
        onNewWorld();
      }}
      className={cn(
        "pointer-events-auto rounded-md border border-border-strong text-sm font-medium text-fg inline-flex items-center gap-3 hover:bg-surface-2 active:scale-[0.98] transition-[background-color,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
        size === "lg" ? "h-12 px-5 rounded-lg" : "h-11 px-5",
      )}
    >
      <span>Create new world</span>
      <kbd className="font-mono text-xs tracking-widest uppercase px-1.5 py-0.5 rounded border border-border-strong opacity-70">
        N
      </kbd>
    </button>
  );
}

function LandingCard({
  planet,
  onTakeoff,
}: {
  planet: NonNullable<ReturnType<typeof planetById>>;
  onTakeoff: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
      <article
        data-ui
        className="pointer-events-auto w-full max-w-md rounded-xl bg-surface border border-border p-5 sm:p-6 shadow-lg"
      >
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-muted">{planet.kicker}</p>
        <h2 className="mt-2 font-display text-3xl leading-tight font-semibold tracking-tight text-fg">
          {planet.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{planet.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTakeoff}
            className="h-11 px-5 rounded-md bg-fg text-accent-fg text-sm font-medium inline-flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
          >
            <span>Take off</span>
            <kbd className="font-mono text-xs tracking-widest uppercase px-1.5 py-0.5 rounded border border-accent-fg/25 opacity-70">
              Enter
            </kbd>
          </button>
          {planet.href ? (
            <a
              href={planet.href.url}
              target="_blank"
              rel="noreferrer"
              className="h-11 px-4 grid place-items-center rounded-md border border-border-strong text-sm text-fg hover:bg-surface-2 transition-colors duration-[var(--motion-quick)]"
            >
              {planet.href.label}
            </a>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function AdriftCard({
  startedAt,
  foodUntil,
  onAirlock,
}: {
  startedAt: number;
  foodUntil: number;
  onAirlock: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, foodUntil - now);
  const parts = splitFoodClock(remaining);
  const canOpen = now - startedAt >= AIRLOCK_DELAY_MS;
  const cells = [
    { n: parts.years, label: "Years" },
    { n: parts.months, label: "Months" },
    { n: parts.days, label: "Days" },
    { n: parts.hours, label: "Hours" },
    { n: parts.minutes, label: "Min" },
    { n: parts.seconds, label: "Sec" },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
      <article className="w-full max-w-xl rounded-xl border border-border bg-surface/85 px-4 py-5 shadow-lg backdrop-blur-sm sm:px-6">
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-warn">Rations remaining</p>
        <div className="mt-4 flex items-end justify-between gap-1 sm:gap-2">
          {cells.map((cell, i) => (
            <div key={cell.label} className="flex min-w-0 flex-1 items-end justify-center gap-1 sm:gap-2">
              {i > 0 ? (
                <span className="mb-5 hidden font-mono text-lg text-subtle sm:mb-6 sm:inline sm:text-2xl">
                  :
                </span>
              ) : null}
              <div className="min-w-0 text-center">
                <p className="font-mono text-2xl tabular-nums leading-none tracking-wider text-fg sm:text-4xl">
                  {String(cell.n).padStart(2, "0")}
                </p>
                <p className="mt-2 font-mono text-[9px] tracking-[0.16em] uppercase text-muted sm:text-[10px]">
                  {cell.label}
                </p>
              </div>
            </div>
          ))}
        </div>
        {canOpen ? (
          <div className="mt-6 flex justify-center pointer-events-auto">
            <button
              type="button"
              data-ui
              onClick={onAirlock}
              className="h-11 px-5 rounded-md border border-warn/40 bg-transparent text-sm font-medium text-warn hover:bg-warn/10 active:scale-[0.98] transition-[background,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
            >
              open air lock
            </button>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function crashDetail(
  name: string | null,
  burned: boolean,
  cause: HudSnapshot["burnCause"],
  kind: HudSnapshot["crashKind"],
  body: NonNullable<ReturnType<typeof planetById>> | null,
  seed: number,
) {
  // Seed is fixed per crash, so the variant is stable across renders but rotates between crashes.
  const pick = (pool: string[]) => pool[Math.floor(seed) % pool.length]!;
  if (kind === "wreck" && !body) {
    return pick([
      "The belt wore through the hull. Nothing left to hold the dark out.",
      "Rock after rock, the belt collected its toll. The hull ran out first.",
      "The belt does not aim. It does not need to.",
    ]);
  }
  if (kind === "sink") {
    const where = name ?? "the clouds";
    return pick([
      `The craft fell into ${where}. The clouds closed. No wreck, no crater — no proof you were ever there.`,
      `${where} has no ground to hit. You fell until falling stopped meaning anything.`,
      `The clouds of ${where} parted for you once. They will not part again.`,
    ]);
  }
  if (!burned) {
    if (body?.kind === "asteroid" && !body.landable) {
      return pick([
        `${name} is too small to land on and too hard to forgive. The hull took the hit.`,
        `${name} is barely a place. It was still enough to end the flight.`,
      ]);
    }
    const well = name ?? "the well";
    return pick([
      `The approach into ${well} was too fast. The well always wins. Try a slower pass — or catch an orbit first.`,
      `${well} came up faster than the retros could answer. Bleed speed early next time — or catch an orbit first.`,
      `The ground of ${well} did not move. You did — too fast. Try a slower pass, or let an orbit tame the fall.`,
    ]);
  }
  const star = name ?? "the star";
  if (cause === "flare") {
    return pick([
      `The star exhaled. The flare crossed the distance in silence, and the craft was in its way.`,
      `A flare from ${star} reached the craft. It was not aimed. It did not need to be.`,
      `You never saw it leave ${star}. Light does not warn.`,
    ]);
  }
  return pick([
    `Too close to ${star}. The hull cooked.`,
    `${star} did not reach for you. You reached for it. The hull gave first.`,
    `Past a certain line, ${star} is not a light in the sky. It is the whole sky. The hull cooked.`,
  ]);
}

function LostCard({
  copy,
  onReboot,
  onNewWorld,
}: {
  copy: NonNullable<HudSnapshot["lostCopy"]>;
  onReboot: () => void;
  onNewWorld: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
      <article
        data-ui
        className="pointer-events-auto w-full max-w-md rounded-xl bg-surface border border-border p-5 sm:p-6 shadow-lg"
      >
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-warn">{copy.kicker}</p>
        <h2 className="mt-2 font-display text-3xl leading-tight text-fg">{copy.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{copy.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onReboot}
            className="h-11 px-5 rounded-md bg-fg text-accent-fg text-sm font-medium inline-flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
          >
            <span>Reboot</span>
            <kbd className="font-mono text-xs tracking-widest uppercase px-1.5 py-0.5 rounded border border-accent-fg/25 opacity-70">
              Enter
            </kbd>
          </button>
          <NewWorldButton onNewWorld={onNewWorld} />
        </div>
      </article>
    </div>
  );
}

function CrashCard({
  burned,
  crashKind,
  detail,
  onReboot,
  onNewWorld,
}: {
  burned: boolean;
  crashKind: HudSnapshot["crashKind"];
  detail: string;
  onReboot: () => void;
  onNewWorld: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
      <article
        data-ui
        className="pointer-events-auto w-full max-w-md rounded-xl bg-surface border border-border p-5 sm:p-6 shadow-lg"
      >
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-warn">Hull loss</p>
        <h2 className="mt-2 font-display text-3xl leading-tight text-fg">
          {burned ? "You burned" : crashKind === "sink" ? "You vanished" : "You crashed"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{detail}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onReboot}
            className="h-11 px-5 rounded-md bg-fg text-accent-fg text-sm font-medium inline-flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
          >
            <span>Reboot</span>
            <kbd className="font-mono text-xs tracking-widest uppercase px-1.5 py-0.5 rounded border border-accent-fg/25 opacity-70">
              Enter
            </kbd>
          </button>
          <NewWorldButton onNewWorld={onNewWorld} />
        </div>
      </article>
    </div>
  );
}

function fmt(n: number) {
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function fmtV(n: number | null, digits = 2) {
  if (n == null) return "—";
  if (!Number.isFinite(n)) return "∞";
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  return n.toFixed(digits);
}

function VCell({
  label,
  value,
  warn,
  wide,
}: {
  label: string;
  value: string;
  warn?: boolean;
  wide?: boolean;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        wide ? "sm:col-span-2" : undefined,
        warn ? "text-warn" : undefined,
      )}
    >
      <span className="text-subtle">{label}</span> {value}
    </span>
  );
}

function BodyMixLines({
  mix,
  className,
}: {
  mix: CompositionReadout;
  className?: string;
}) {
  if (!mix.atmosphere && !mix.bulk) return null;
  return (
    <div
      className={cn(
        "font-mono text-[10px] leading-4 tabular-nums uppercase tracking-wide text-muted",
        className,
      )}
    >
      {mix.atmosphere ? (
        <p>
          <span className="text-subtle">Atmo</span> {mix.atmosphere}
        </p>
      ) : null}
      {mix.bulk ? (
        <p>
          <span className="text-subtle">Core</span> {mix.bulk}
        </p>
      ) : null}
    </div>
  );
}

function ScanPips({ frac }: { frac: number }) {
  const t = Math.max(0, Math.min(1, frac));
  const pips = 8;
  const filled = Math.round(t * pips);
  const left = Math.max(0, Math.ceil((1 - t) * SCAN_SECONDS));
  return (
    <div
      className="mt-2"
      role="meter"
      aria-label="Mass spec scan"
      aria-valuemin={0}
      aria-valuemax={SCAN_SECONDS}
      aria-valuenow={Math.round(t * SCAN_SECONDS)}
    >
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted">Scan</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex h-3 items-center gap-px rounded-sm bg-bg px-px">
          {Array.from({ length: pips }, (_, i) => (
            <span key={i} className={cn("h-2 w-1.5", i < filled ? "bg-ok" : "bg-surface-2")} />
          ))}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted">{left}s</span>
      </div>
    </div>
  );
}

function VerboseMatter() {
  const bodies = getPlanets().filter((p) => p.matter);
  if (!bodies.length) return null;
  return (
    <div className="pointer-events-auto max-h-[22vh] max-w-[28rem] overflow-y-auto font-mono text-[10px] leading-4 tabular-nums uppercase tracking-wide text-muted">
      {bodies.map((p) => {
        const mix = bodyReadout(p);
        const bits = [
          mix.atmosphere ? `Atmo ${mix.atmosphere}` : null,
          mix.bulk ? `Core ${mix.bulk}` : null,
        ].filter((s): s is string => !!s);
        return (
          <p key={p.id} className="mt-1 first:mt-0">
            <span className="text-fg">{p.name}</span> {bits.join("  ")}
          </p>
        );
      })}
    </div>
  );
}

function VerbosePanel({ diag }: { diag: VerboseDiag }) {
  const vOverC = diag.vCirc && diag.vCirc > 0 ? diag.relSpeed / diag.vCirc : null;
  const shellWarn =
    diag.alt != null && diag.shellMin != null && diag.shellMax != null
      ? diag.alt < diag.shellMin || diag.alt > diag.shellMax
      : false;
  const shell =
    diag.alt != null && diag.shellMin != null && diag.shellMax != null
      ? `${fmtV(diag.alt, 1)} [${fmtV(diag.shellMin, 0)}–${fmtV(diag.shellMax, 0)}]`
      : null;
  return (
    <div className="max-w-[22rem] font-mono text-[10px] leading-4 tabular-nums uppercase tracking-wide">
      <p className={diag.ok ? "text-ok" : "text-warn"}>{diag.gate}</p>
      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-muted">
        <VCell label="Rel" value={fmtV(diag.relSpeed, 1)} />
        <VCell label="V/Vc" value={fmtV(vOverC)} />
        <VCell
          label="Ecc"
          value={diag.ecc == null ? "—" : `${fmtV(diag.ecc, 3)} / ${fmtV(diag.eccLim, 2)}`}
          warn={diag.ecc != null && diag.ecc >= diag.eccLim}
        />
        <VCell label="Eng" value={fmtV(diag.energy)} />
        {shell ? <VCell label="Shell" value={shell} warn={shellWarn} wide /> : null}
        <VCell
          label="Drag"
          value={`${fmtV(diag.drag)} / ${fmtV(diag.dragLim)}`}
          warn={diag.drag > diag.dragLim}
        />
        <VCell
          label="Pert"
          value={`${fmtV(diag.perturb)} / ${fmtV(diag.perturbLim)}`}
          warn={Number.isFinite(diag.perturb) && diag.perturb > diag.perturbLim}
        />
        <VCell
          label="A"
          value={`G ${fmtV(diag.accelG)}  T ${fmtV(diag.accelThrust, 1)}  D ${fmtV(diag.accelDrag)}`}
          wide
        />
        {diag.well != null && diag.wellLim != null ? (
          <VCell
            label="Well"
            value={`${fmtV(diag.well)} / ${fmtV(diag.wellLim)}`}
            warn={diag.well <= diag.wellLim}
          />
        ) : null}
        {diag.periAlt != null || diag.apoAlt != null ? (
          <VCell label="Pe/Ap" value={`${fmtV(diag.periAlt, 1)}  ${fmtV(diag.apoAlt, 1)}`} />
        ) : null}
      </div>
      {diag.lagrange ? <p className="mt-1 text-muted">{diag.lagrange}</p> : null}
    </div>
  );
}

function fmtScale(n: number) {
  if (n === 0) return "0×";
  return `${n.toFixed(2).replace(/\.?0+$/, "")}×`;
}

function KeyTips({
  orbitShell,
  lagrangePoints,
  physicsMenu,
  gravityGrid,
  verbose,
  spectro,
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleVerbose,
  onToggleSpectro,
  dev,
}: {
  orbitShell: boolean;
  lagrangePoints: boolean;
  physicsMenu: boolean;
  gravityGrid: boolean;
  verbose: boolean;
  spectro: boolean;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
  onToggleSpectro: () => void;
  dev: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
      <KeyTip code="O" label="orbit shell" on={orbitShell} onToggle={onToggleOrbitShell} />
      <KeyTip code="L" label="Lagrange" on={lagrangePoints} onToggle={onToggleLagrange} />
      <KeyTip code="M" label="mass spec" on={spectro} onToggle={onToggleSpectro} />
      {dev ? (
        <KeyTip code="P" label="physics" on={physicsMenu} className="hidden sm:inline-flex" />
      ) : null}
      <KeyTip code="G" label="grid" on={gravityGrid} onToggle={onToggleGravityGrid} />
      {dev ? <KeyTip code="V" label="verbose" on={verbose} onToggle={onToggleVerbose} /> : null}
    </span>
  );
}

function KeyTip({
  code,
  label,
  on,
  onToggle,
  className,
}: {
  code: string;
  label: string;
  on?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const kbd = (
    <kbd
      className={cn(
        "font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded border",
        on ? "border-ok/40 text-ok" : "border-border text-fg/70",
      )}
    >
      {code}
    </kbd>
  );
  const color = on ? "text-ok" : "text-muted";
  if (onToggle) {
    return (
      <button
        type="button"
        data-ui
        aria-label={label}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "pointer-events-auto inline-flex items-center gap-1.5 rounded-md min-h-11 px-1.5 sm:min-h-0 sm:px-0",
          color,
          className,
        )}
      >
        {kbd}
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5", color, className)}>
      {kbd}
      <span>{label}</span>
    </span>
  );
}

function PhysicsKnobs({
  gravityScale,
  atmoScale,
  onGravity,
  onAtmo,
}: {
  gravityScale: number;
  atmoScale: number;
  onGravity: (dir: number) => void;
  onAtmo: (dir: number) => void;
}) {
  return (
    <div
      data-ui
      className="pointer-events-auto w-[12.25rem] rounded-lg border border-border bg-surface/80 p-2 text-left backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <ScaleRow
        label="Gravity"
        value={gravityScale}
        min={GRAVITY_STEPS[0]}
        max={GRAVITY_STEPS[GRAVITY_STEPS.length - 1]!}
        onDown={() => onGravity(-1)}
        onUp={() => onGravity(1)}
      />
      <ScaleRow
        className="mt-2 pt-2 border-t border-border"
        label="Atmo"
        value={atmoScale}
        min={ATMO_STEPS[0]}
        max={ATMO_STEPS[ATMO_STEPS.length - 1]!}
        onDown={() => onAtmo(-1)}
        onUp={() => onAtmo(1)}
      />
    </div>
  );
}

function ScaleRow({
  label,
  value,
  min,
  max,
  onDown,
  onUp,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onDown: () => void;
  onUp: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          data-ui
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={onDown}
          className="size-8 grid place-items-center rounded-md border border-border text-muted hover:text-fg hover:border-border-strong disabled:opacity-30 disabled:hover:text-muted disabled:hover:border-border transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]"
        >
          <Minus className="size-3.5" strokeWidth={1.75} />
        </button>
        <p className="flex-1 text-center font-mono text-sm tabular-nums text-fg">
          {fmtScale(value)}
        </p>
        <button
          type="button"
          data-ui
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={onUp}
          className="size-8 grid place-items-center rounded-md border border-border text-muted hover:text-fg hover:border-border-strong disabled:opacity-30 disabled:hover:text-muted disabled:hover:border-border transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

const FUEL_PIPS = 8;
const FUEL_CAUTION = 0.55;
const FUEL_WARN = 0.28;

function fuelTone(frac: number) {
  if (frac > FUEL_CAUTION) return "ok" as const;
  if (frac > FUEL_WARN) return "caution" as const;
  return "warn" as const;
}

function PanelRow({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-3", className)}>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase text-muted">
        {label}
      </span>
      <span className="flex items-center gap-2 text-right font-mono text-xs tabular-nums text-fg">
        {children}
      </span>
    </div>
  );
}

function GaugePips({ frac }: { frac: number }) {
  const t = Math.max(0, Math.min(1, frac));
  const filled = Math.round(t * FUEL_PIPS);
  const tone = fuelTone(t);
  const pip =
    tone === "ok" ? "bg-ok" : tone === "caution" ? "bg-caution" : "bg-warn";
  return (
    <span className="flex h-3 items-center gap-px rounded-sm bg-bg px-px">
      {Array.from({ length: FUEL_PIPS }, (_, i) => (
        <span key={i} className={cn("h-2 w-1.5", i < filled ? pip : "bg-surface-2")} />
      ))}
    </span>
  );
}

function gaugeCountColor(frac: number) {
  const tone = fuelTone(Math.max(0, Math.min(1, frac)));
  return tone === "ok" ? "text-muted" : tone === "caution" ? "text-caution" : "text-warn";
}

function GaugeRow({
  label,
  ariaLabel,
  value,
  max,
  unit,
  note,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  max: number;
  unit: string;
  note?: string | null;
}) {
  const cap = Math.round(Math.max(0, max));
  const t = cap > 0 ? Math.max(0, Math.min(1, value / cap)) : 0;
  const shown = Math.round(Math.max(0, value));
  const reading = `${shown} / ${cap}${unit}`;
  return (
    <div
      className="flex min-h-5 items-center justify-between gap-2"
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={shown}
      aria-valuetext={note ? `${reading}, ${note}` : reading}
    >
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase",
          note ? "text-ok" : "text-muted",
        )}
      >
        {note ?? label}
      </span>
      <span className="flex items-center gap-2">
        <GaugePips frac={t} />
        <span
          className={cn(
            "w-[5.5rem] whitespace-nowrap text-right font-mono text-xs tabular-nums",
            gaugeCountColor(t),
          )}
        >
          {reading}
        </span>
      </span>
    </div>
  );
}

function fmtStat(n: number) {
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(2);
}

function MiniStep({
  label,
  onDown,
  onUp,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
}) {
  const btn =
    "pointer-events-auto size-7 grid place-items-center rounded-md border border-border text-muted hover:text-fg hover:border-border-strong transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]";
  return (
    <span className="inline-flex items-center gap-0.5" data-ui>
      <button
        type="button"
        data-ui
        aria-label={`Previous ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
        className={btn}
      >
        <Minus className="size-3" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        data-ui
        aria-label={`Next ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
        className={btn}
      >
        <Plus className="size-3" strokeWidth={1.75} />
      </button>
    </span>
  );
}

function FuelPanel({
  kind,
  engineKind,
  tankKind,
  engineIsp,
  engineThrust,
  dev,
  onCycleFuel,
  onCycleEngine,
  onCycleTank,
}: {
  kind: FuelKind;
  engineKind: EngineKind;
  tankKind: TankKind;
  engineIsp: number;
  engineThrust: number;
  dev: boolean;
  onCycleFuel: (dir: number) => void;
  onCycleEngine: (dir: number) => void;
  onCycleTank: (dir: number) => void;
}) {
  const grade = fuelGrade(kind);
  const engine = engineGrade(engineKind);
  const tank = tankGrade(tankKind);
  const isp = grade.isp * engineIsp;
  const thrust = grade.thrust * engineThrust;
  return (
    <div className="space-y-1.5">
      <PanelRow label="Engine">
        {dev ? (
          <MiniStep label="engine" onDown={() => onCycleEngine(-1)} onUp={() => onCycleEngine(1)} />
        ) : null}
        {engine.hud}
      </PanelRow>
      <PanelRow label="Fuel">
        {dev ? (
          <MiniStep label="fuel" onDown={() => onCycleFuel(-1)} onUp={() => onCycleFuel(1)} />
        ) : null}
        <span>
          {grade.hud} <span className="text-muted">{grade.name}</span>
        </span>
      </PanelRow>
      <PanelRow label="Tank">
        {dev ? (
          <MiniStep label="tank" onDown={() => onCycleTank(-1)} onUp={() => onCycleTank(1)} />
        ) : null}
        <span>
          {tank.hud} <span className="text-muted">{tank.volume} L</span>
        </span>
      </PanelRow>
      <PanelRow
        label={
          <>
            I<sub className="relative -bottom-px text-[0.8em] tracking-normal">sp</sub>
          </>
        }
      >
        <span className="text-muted">{fmtStat(isp)}</span>
      </PanelRow>
      <PanelRow label="Thrust">
        <span className="text-muted">{fmtStat(thrust)}</span>
      </PanelRow>
    </div>
  );
}

function statusLabel(hud: HudSnapshot) {
  if (hud.adrift) return "ADRIFT";
  switch (hud.status) {
    case "orbit":
      return hud.orbitLocked ? (hud.orbitEcc >= 0.08 ? "ELLIPSE" : "LOCKED") : "ORBIT";
    case "lagrange":
      return hud.lagrangeLabel ?? "L-POINT";
    case "warp":
      return "WARP";
    case "too-fast":
      return "FAST";
    case "approach":
      return "APPROACH";
    case "landed":
      return "LANDED";
    case "crashed":
      return "CRASH";
    default:
      return "COAST";
  }
}
