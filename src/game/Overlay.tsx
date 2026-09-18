import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import type {
  CompositionReadout,
  EngineKind,
  FuelKind,
  HudMode,
  HudSnapshot,
  TankKind,
} from "./types";
import { engineGrade, fuelGrade, tankGrade } from "./fuel";
import { HULL_MAX } from "./hull";
import { SCAN_SECONDS } from "./matter";
import { ATMO_STEPS, GRAVITY_STEPS, ORBIT_DRAG_BREAK, getPlanets, isGhostBody, planetById } from "./world";
import { AIRLOCK_DELAY_MS, CLOCK_REVEAL_MS, airlockScreenFade, splitFoodClock, usesLostCard } from "./adrift";
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
  onToggleSpectro: () => void;
  onCycleHud: () => void;
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
  onToggleSpectro,
  onCycleHud,
  onOpenAirLock,
}: Props) {
  const landed = hud.landedId ? planetById(hud.landedId) : null;
  const crashed = hud.crashedId ? planetById(hud.crashedId) : null;
  const dev = hud.dev;
  const [instruments, setInstruments] = useState(false);

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
          hudMode={hud.hudMode}
          onToggleOrbitShell={onToggleOrbitShell}
          onToggleLagrange={onToggleLagrange}
          onToggleGravityGrid={onToggleGravityGrid}
          spectro={hud.spectro}
          onToggleSpectro={onToggleSpectro}
          onCycleHud={onCycleHud}
          onCycleDrive={() => onCycleFuel(1)}
          onCycleTank={() => onCycleTank(1)}
          dev={dev}
          cometAvailable={hud.cometAvailable}
        />
      ) : null}

      {hud.phase !== "title" && hud.phase !== "creating" && hud.phase !== "transit" ? (
        <>
          <FlightVisor
            hud={hud}
            expanded={instruments}
            onToggleExpand={() => setInstruments((open) => !open)}
            className={cn(
              "px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5",
              dev && hud.physicsMenu ? "pr-[13rem]" : "pr-4 sm:pr-6",
            )}
          />
          {dev && hud.physicsMenu ? (
            <div className="pointer-events-auto absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 sm:hidden">
              <PhysicsKnobs
                gravityScale={hud.gravityScale}
                atmoScale={hud.atmoScale}
                onGravity={onGravity}
                onAtmo={onAtmo}
              />
            </div>
          ) : null}
          {dev && hud.physicsMenu ? (
            <div className="pointer-events-auto absolute top-[4.75rem] right-6 z-10 hidden sm:block">
              <PhysicsKnobs
                gravityScale={hud.gravityScale}
                atmoScale={hud.atmoScale}
                onGravity={onGravity}
                onAtmo={onAtmo}
              />
            </div>
          ) : null}
          {hud.phase === "flight" && !hud.adrift ? (
            <div
              className="absolute left-4 z-10 flex flex-col items-start sm:hidden"
              style={{
                bottom: "calc(1rem + 8px)",
              }}
            >
              <MuteButton muted={hud.muted} onMute={onMute} className="mb-1 -ml-1" />
              <div
                style={{
                  height: "min(132px, max(96px, 16vw))",
                }}
              >
                <KeyTips
                  stack
                  orbitShell={hud.orbitShell}
                  lagrangePoints={hud.lagrangePoints}
                  physicsMenu={hud.physicsMenu}
                  gravityGrid={hud.gravityGrid}
                  spectro={hud.spectro}
                  hudMode={hud.hudMode}
                  onToggleOrbitShell={onToggleOrbitShell}
                  onToggleLagrange={onToggleLagrange}
                  onToggleGravityGrid={onToggleGravityGrid}
                  onToggleSpectro={onToggleSpectro}
                  onCycleHud={onCycleHud}
                  onCycleDrive={() => onCycleFuel(1)}
                  onCycleTank={() => onCycleTank(1)}
                  dev={dev}
                  cometAvailable={hud.cometAvailable}
                />
              </div>
            </div>
          ) : null}

          <div className="absolute bottom-8 left-6 hidden sm:block">
            <MuteButton muted={hud.muted} onMute={onMute} className="mb-2" />
            {hud.adrift ? null : (
              <KeyTips
                legend
                orbitShell={hud.orbitShell}
                lagrangePoints={hud.lagrangePoints}
                physicsMenu={hud.physicsMenu}
                gravityGrid={hud.gravityGrid}
                spectro={hud.spectro}
                hudMode={hud.hudMode}
                onToggleOrbitShell={onToggleOrbitShell}
                onToggleLagrange={onToggleLagrange}
                onToggleGravityGrid={onToggleGravityGrid}
                onToggleSpectro={onToggleSpectro}
                onCycleHud={onCycleHud}
                onCycleDrive={() => onCycleFuel(1)}
                onCycleTank={() => onCycleTank(1)}
                dev={dev}
                cometAvailable={hud.cometAvailable}
              />
            )}
          </div>
        </>
      ) : null}

      {hud.phase === "title" ? (
        <div className="pointer-events-auto absolute top-[max(1rem,env(safe-area-inset-top))] right-4 sm:right-8 flex flex-col items-end gap-3">
          <MuteButton muted={hud.muted} onMute={onMute} />
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
          sealing={hud.airlockSeqAt > 0}
          onAirlock={onOpenAirLock}
        />
      ) : null}

      {hud.phase === "landed" && landed ? (
        <LandingCard planet={landed} onTakeoff={onTakeoff} />
      ) : null}

      <AirlockVeil
        startedAt={hud.airlockSeqAt}
        hold={hud.crashKind === "airlock"}
        reduced={hud.reducedMotion}
      />

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
  hudMode,
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  spectro,
  onToggleSpectro,
  onCycleHud,
  onCycleDrive,
  onCycleTank,
  dev,
  cometAvailable,
}: {
  onLaunch: () => void;
  onNewWorld: () => void;
  physicsMenu: boolean;
  orbitShell: boolean;
  lagrangePoints: boolean;
  gravityGrid: boolean;
  hudMode: HudMode;
  spectro: boolean;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleSpectro: () => void;
  onCycleHud: () => void;
  onCycleDrive: () => void;
  onCycleTank: () => void;
  dev: boolean;
  cometAvailable: boolean;
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
              spectro={spectro}
              hudMode={hudMode}
              onToggleOrbitShell={onToggleOrbitShell}
              onToggleLagrange={onToggleLagrange}
              onToggleGravityGrid={onToggleGravityGrid}
              onToggleSpectro={onToggleSpectro}
              onCycleHud={onCycleHud}
              onCycleDrive={onCycleDrive}
              onCycleTank={onCycleTank}
              dev={dev}
              cometAvailable={cometAvailable}
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
    <div className="absolute inset-0 z-20 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
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

function AirlockVeil({
  startedAt,
  hold,
  reduced,
}: {
  startedAt: number;
  hold: boolean;
  reduced: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (hold || startedAt <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 40);
    return () => window.clearInterval(id);
  }, [hold, startedAt]);
  const fade = hold ? 1 : airlockScreenFade(startedAt, now, reduced);
  if (fade <= 0.001) return null;
  return <div className="absolute inset-0 bg-black" style={{ opacity: fade }} aria-hidden />;
}

function CircuitDigits({ value, width }: { value: number; width: number }) {
  const shown = String(Math.max(0, value)).padStart(width, "0");
  return (
    <span className="time-circuit-digits relative inline-block">
      <span className="time-circuit-ghost absolute inset-0" aria-hidden>
        {"8".repeat(width)}
      </span>
      <span className="relative">{shown}</span>
    </span>
  );
}

function CircuitCell({
  label,
  value,
  width,
}: {
  label: string;
  value: number;
  width: number;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span className="time-circuit-label">{label}</span>
      <div className={cn("time-circuit-window", width >= 4 && "time-circuit-window-year")}>
        <CircuitDigits value={value} width={width} />
      </div>
    </div>
  );
}

function CircuitColon({ on }: { on: boolean }) {
  return (
    <div
      className="time-circuit-colon mb-1.5 hidden sm:flex"
      data-on={on ? "true" : "false"}
      aria-hidden
    >
      <span />
      <span />
    </div>
  );
}

const HATCH_BOLTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return { x: 36 + 24 * Math.cos(a), y: 36 + 24 * Math.sin(a) };
});

function HatchGlyph() {
  return (
    <svg className="time-circuit-hatch-glyph" viewBox="0 0 72 72" aria-hidden>
      <g className="time-circuit-hatch-grid">
        <line x1="36" y1="7" x2="36" y2="65" />
        <line x1="7" y1="36" x2="65" y2="36" />
        <circle cx="36" cy="36" r="14.5" />
      </g>
      <circle className="time-circuit-hatch-ring" cx="36" cy="36" r="27" />
      <circle className="time-circuit-hatch-ring-inner" cx="36" cy="36" r="20.5" />
      {HATCH_BOLTS.map((b) => (
        <circle key={`${b.x}:${b.y}`} className="time-circuit-hatch-bolt" cx={b.x} cy={b.y} r="1.55" />
      ))}
      <circle className="time-circuit-hatch-iris" cx="36" cy="36" r="10" />
      <g className="time-circuit-hatch-latch">
        <line x1="22.5" y1="36" x2="49.5" y2="36" />
        <line x1="36" y1="27.5" x2="36" y2="36" />
      </g>
    </svg>
  );
}

function HatchCrtButton({
  colonOn,
  onAirlock,
}: {
  colonOn: boolean;
  onAirlock: () => void;
}) {
  return (
    <button
      type="button"
      data-ui
      onClick={onAirlock}
      className="time-circuit-hatch"
      data-on={colonOn ? "true" : "false"}
      aria-label="open air lock"
    >
      <span className="time-circuit-glass time-circuit-hatch-glass">
        <span className="time-circuit-label">hatch</span>
        <HatchGlyph />
        <span className="time-circuit-hatch-open">
          <span className="time-circuit-ghost absolute inset-0" aria-hidden>
            OPEN
          </span>
          <span className="relative">OPEN</span>
        </span>
        <p className="time-circuit-strip">air lock</p>
        <span className="time-circuit-band" aria-hidden />
      </span>
    </button>
  );
}

function AdriftCard({
  startedAt,
  foodUntil,
  sealing,
  onAirlock,
}: {
  startedAt: number;
  foodUntil: number;
  sealing: boolean;
  onAirlock: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, foodUntil - now);
  const parts = splitFoodClock(remaining);
  const shown = now - startedAt >= CLOCK_REVEAL_MS;
  const canOpen = shown && !sealing && now - startedAt >= AIRLOCK_DELAY_MS;
  // Colons blink with second parity so the panel keeps time with the tick-tock.
  const colonOn = Math.floor(now / 1000) % 2 === 0;
  if (!shown && !sealing) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
      <div className="time-circuit-row">
        {canOpen ? <HatchCrtButton colonOn={colonOn} onAirlock={onAirlock} /> : null}
        <article className="time-circuit">
          <div className="time-circuit-glass">
            <div className="flex items-end justify-between gap-1 sm:gap-2">
              <CircuitCell label="Year" value={parts.years} width={4} />
              <CircuitCell label="Month" value={parts.months} width={2} />
              <CircuitCell label="Day" value={parts.days} width={2} />
              <CircuitCell label="Hour" value={parts.hours} width={2} />
              <CircuitColon on={colonOn} />
              <CircuitCell label="Min" value={parts.minutes} width={2} />
              <CircuitColon on={colonOn} />
              <CircuitCell label="Sec" value={parts.seconds} width={2} />
            </div>
            <p className="time-circuit-strip">life support</p>
            <span className="time-circuit-band" aria-hidden />
          </div>
        </article>
      </div>
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
    <div className="absolute inset-0 z-20 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
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
    <div className="absolute inset-0 z-20 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
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

function fmtScale(n: number) {
  if (n === 0) return "0×";
  return `${n.toFixed(2).replace(/\.?0+$/, "")}×`;
}

function MuteButton({
  muted,
  onMute,
  className,
}: {
  muted: boolean;
  onMute: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-ui
      onClick={onMute}
      aria-label={muted ? "Unmute" : "Mute"}
      className={cn(
        "pointer-events-auto size-11 grid place-items-center rounded-md text-muted hover:text-fg transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]",
        className,
      )}
    >
      {muted ? (
        <VolumeX className="size-4" strokeWidth={1.75} />
      ) : (
        <Volume2 className="size-4" strokeWidth={1.75} />
      )}
    </button>
  );
}

function orbitHintTone(hud: HudSnapshot) {
  if (
    hud.adrift ||
    hud.status === "too-fast" ||
    hud.status === "crashed" ||
    hud.orbitHint === ORBIT_DRAG_HINT ||
    hud.orbitHint === ORBIT_PERTURB_HINT ||
    isOrbitLostHint(hud.orbitHint) ||
    (hud.status === "warp" && hud.warpCharge >= 0.7)
  ) {
    return "text-warn";
  }
  if (hud.status === "orbit" || hud.status === "lagrange") return "text-ok";
  return "text-accent";
}

function OrbitHint({ hud, className }: { hud: HudSnapshot; className?: string }) {
  if (!hud.orbitHint || hud.phase === "crashed" || hud.adrift) return null;
  if (isRedundantOrbitHint(hud.orbitHint)) return null;
  return (
    <p className={cn("font-mono text-xs tracking-wide uppercase", orbitHintTone(hud), className)}>
      {hud.orbitHint}
    </p>
  );
}

function isRedundantOrbitHint(hint: string) {
  if (hint === "Warp") return true;
  return /^(Ellipse locked|Orbit locked|.+ locked) · /.test(hint);
}

function statusTone(hud: HudSnapshot) {
  if (hud.adrift || hud.status === "too-fast" || hud.status === "crashed") return "text-warn";
  if (hud.status === "warp" && hud.warpCharge >= 0.7) return "text-warn";
  if (hud.status === "orbit" || hud.status === "lagrange") return "text-ok";
  if (hud.status === "approach" || hud.status === "warp") return "text-accent";
  return "text-muted";
}

function VisorReadout({
  label,
  value,
  valueClass,
  className,
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-end gap-2", className)}>
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted">{label}</span>
      <span
        className={cn(
          "min-w-[2.35rem] text-right font-mono text-xs tabular-nums text-fg",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function VisorGauge({
  label,
  activeLabel,
  frac,
  note,
  reduced,
}: {
  label: string;
  activeLabel: string;
  frac: number;
  note?: boolean;
  reduced?: boolean;
}) {
  const wasNote = useRef(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const servicing = !!note;
    if (servicing) setFlash(false);
    else if (wasNote.current && frac >= 1 - 1e-6 && !reduced) setFlash(true);
    wasNote.current = servicing;
  }, [note, frac, reduced]);
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(false), 250);
    return () => window.clearTimeout(id);
  }, [flash]);
  return (
    <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tracking-[0.16em] uppercase",
          note ? "text-ok" : "text-muted",
        )}
      >
        {note ? activeLabel : label}
      </span>
      <GaugePips frac={frac} pulse={!!note && !reduced} flash={flash} />
    </div>
  );
}

function FlightVisor({
  hud,
  className,
  expanded,
  onToggleExpand,
}: {
  hud: HudSnapshot;
  className?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const alt = hud.altitude != null ? fmt(hud.altitude) : "—";
  const dragWarn = hud.drag >= ORBIT_DRAG_BREAK;
  const dragOn = hud.drag > 0;
  const fuel = fuelGrade(hud.fuelKind);
  const engine = engineGrade(hud.engineKind);
  const isp = fuel.isp * hud.engineIsp;
  const thrust = fuel.thrust * hud.engineThrust;
  return (
    <header
      className={cn(
        "absolute top-0 left-0 right-0 bg-gradient-to-b from-bg/90 via-bg/55 to-transparent pb-6",
        className,
      )}
    >
      <div className="flex items-start gap-1 sm:items-center sm:gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "grid grid-cols-[auto_auto_auto] items-center gap-x-6 gap-y-1",
              expanded && "sm:grid-cols-[auto_auto_auto_auto_auto_auto]",
            )}
          >
          <p className="min-w-0 truncate font-display text-base leading-tight font-medium tracking-tight text-fg">
            {hud.nearestName ?? "—"}
            <span className="ml-1.5 font-mono text-xs font-normal tabular-nums text-muted">
              · {alt}
            </span>
          </p>
          <VisorGauge
            label="Fuel"
            activeLabel="Refuel"
            frac={hud.fuelCapacity > 0 ? hud.fuel / hud.fuelCapacity : 0}
            note={hud.refueling}
            reduced={hud.reducedMotion}
          />
          <VisorReadout label="Speed" value={fmt(hud.speed)} />
          {expanded ? (
            <>
              <VisorReadout
                className="hidden sm:flex"
                label="Heading"
                value={`${hud.headingDeg.toFixed(0).padStart(3, "0")}°`}
              />
              <VisorReadout className="hidden sm:flex" label="Engine" value={engine.hud} />
              <VisorReadout className="hidden sm:flex" label="Isp" value={fmtStat(isp)} />
            </>
          ) : null}
          <p
            className={cn(
              "font-mono text-[10px] tracking-[0.16em] uppercase",
              statusTone(hud),
            )}
          >
            {statusLabel(hud)}
          </p>
          <VisorGauge
            label="Hull"
            activeLabel="Repair"
            frac={hud.hull / HULL_MAX}
            note={hud.repairing}
            reduced={hud.reducedMotion}
          />
          <VisorReadout
            label="Drag"
            value={fmt(hud.drag)}
            valueClass={dragWarn ? "text-warn" : dragOn ? "text-caution" : undefined}
          />
          {expanded ? (
            <>
              <VisorReadout className="hidden sm:flex" label="Mass" value={hud.mass.toFixed(2)} />
              <VisorReadout className="hidden sm:flex" label="Mix" value={fuel.hud} />
              <VisorReadout className="hidden sm:flex" label="Thrust" value={fmtStat(thrust)} />
            </>
          ) : null}
          </div>
          {expanded ? (
            <div className="mt-1 grid grid-cols-[auto_auto_auto] items-center gap-x-6 gap-y-1 sm:hidden">
              <VisorReadout
                label="Heading"
                value={`${hud.headingDeg.toFixed(0).padStart(3, "0")}°`}
              />
              <VisorReadout label="Engine" value={engine.hud} />
              <VisorReadout label="Isp" value={fmtStat(isp)} />
              <VisorReadout label="Mass" value={hud.mass.toFixed(2)} />
              <VisorReadout label="Mix" value={fuel.hud} />
              <VisorReadout label="Thrust" value={fmtStat(thrust)} />
            </div>
          ) : null}
        </div>
        {onToggleExpand ? (
          <button
            type="button"
            data-ui
            aria-label={expanded ? "Hide instruments" : "Show instruments"}
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className="pointer-events-auto size-8 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4 sm:hidden" strokeWidth={1.75} />
                <ChevronLeft className="hidden size-4 sm:block" strokeWidth={1.75} />
              </>
            ) : (
              <>
                <ChevronDown className="size-4 sm:hidden" strokeWidth={1.75} />
                <ChevronRight className="hidden size-4 sm:block" strokeWidth={1.75} />
              </>
            )}
          </button>
        ) : null}
      </div>
      {hud.composition ? <BodyMixLines className="mt-1.5" mix={hud.composition} /> : null}
      {hud.spectroScanning ? <ScanPips frac={hud.spectroScan} /> : null}
      <OrbitHint hud={hud} className="mt-2" />
    </header>
  );
}

function KeyTips({
  orbitShell,
  lagrangePoints,
  physicsMenu,
  gravityGrid,
  spectro,
  hudMode,
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleSpectro,
  onCycleHud,
  onCycleDrive,
  onCycleTank,
  dev,
  cometAvailable,
  stack,
  legend,
}: {
  orbitShell: boolean;
  lagrangePoints: boolean;
  physicsMenu: boolean;
  gravityGrid: boolean;
  spectro: boolean;
  hudMode: HudMode;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleSpectro: () => void;
  onCycleHud: () => void;
  onCycleDrive?: () => void;
  onCycleTank?: () => void;
  dev: boolean;
  cometAvailable: boolean;
  stack?: boolean;
  legend?: boolean;
}) {
  const asLegend = Boolean(legend || stack);
  return (
    <span
      className={cn(
        "inline-flex items-center",
        stack
          ? "h-full flex-col items-stretch justify-between"
          : asLegend
            ? "flex-wrap gap-x-4 gap-y-1"
            : "flex-wrap gap-x-2 gap-y-1 sm:gap-x-3",
      )}
    >
      <KeyTip
        code="H"
        rest="ud"
        label="HUD"
        tone={hudTipTone(hudMode)}
        onToggle={onCycleHud}
        legend={asLegend}
        fill={stack}
      />
      <KeyTip
        code="O"
        rest="rbit"
        label="orbit shell"
        on={orbitShell}
        onToggle={onToggleOrbitShell}
        legend={asLegend}
        fill={stack}
      />
      <KeyTip
        code="L"
        rest="agrange"
        label="Lagrange"
        on={lagrangePoints}
        onToggle={onToggleLagrange}
        legend={asLegend}
        fill={stack}
      />
      <KeyTip
        code="M"
        rest="ass spec"
        label="mass spec"
        on={spectro}
        onToggle={onToggleSpectro}
        legend={asLegend}
        fill={stack}
      />
      {dev ? (
        <KeyTip
          code="E"
          rest="ngine"
          label="engine"
          onToggle={onCycleDrive}
          legend={asLegend}
          fill={stack}
        />
      ) : null}
      {dev ? (
        <KeyTip
          code="T"
          rest="ank"
          label="tank"
          onToggle={onCycleTank}
          legend={asLegend}
          fill={stack}
        />
      ) : null}
      {dev ? (
        <KeyTip
          code="P"
          rest="hysics"
          label="physics"
          on={physicsMenu}
          legend={asLegend}
          className="hidden sm:inline-flex"
        />
      ) : null}
      {dev && cometAvailable ? (
        <KeyTip code="C" rest="omet" label="comet" legend={asLegend} fill={stack} />
      ) : null}
      <KeyTip
        code="G"
        rest="rid"
        label="grid"
        on={gravityGrid}
        onToggle={onToggleGravityGrid}
        legend={asLegend}
        fill={stack}
      />
    </span>
  );
}

function hudTipTone(mode: HudMode): "ok" | "caution" | "off" {
  if (mode === "all") return "ok";
  if (mode === "low") return "caution";
  return "off";
}

function KeyTip({
  code,
  rest,
  label,
  on,
  tone,
  onToggle,
  className,
  legend,
  fill,
}: {
  code: string;
  rest?: string;
  label: string;
  on?: boolean;
  tone?: "ok" | "caution" | "off";
  onToggle?: () => void;
  className?: string;
  legend?: boolean;
  fill?: boolean;
}) {
  const level = tone ?? (on ? "ok" : "off");
  const color =
    level === "ok" ? "text-ok" : level === "caution" ? "text-caution" : "text-muted";
  const keyColor =
    level === "ok" ? "text-ok" : level === "caution" ? "text-caution" : "text-fg";
  const pressed = level === "ok" ? true : level === "caution" ? "mixed" : false;
  const legendWord =
    legend && rest != null ? (
      <span className="font-mono text-sm leading-none tracking-normal">
        <span className={keyColor}>[{code}]</span>{rest}
      </span>
    ) : null;
  const kbd = (
    <kbd
      className={cn(
        "font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded border",
        level === "ok"
          ? "border-ok/40 text-ok"
          : level === "caution"
            ? "border-caution/40 text-caution"
            : "border-border text-fg/70",
      )}
    >
      {code}
    </kbd>
  );
  if (onToggle) {
    return (
      <button
        type="button"
        data-ui
        aria-label={
          tone
            ? `HUD ${level === "ok" ? "all" : level === "caution" ? "low" : "off"}`
            : label
        }
        aria-pressed={pressed}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "pointer-events-auto inline-flex rounded-md",
          legend
            ? cn("min-h-0 items-center", fill ? "flex-1 px-2 -mx-2" : "px-0 py-0.5")
            : "min-h-11 items-center gap-1.5 px-1.5 sm:min-h-0 sm:px-0",
          color,
          className,
        )}
      >
        {legendWord ?? (
          <>
            {kbd}
            <span className="hidden sm:inline">{label}</span>
          </>
        )}
      </button>
    );
  }
  return (
    <span className={cn("inline-flex items-baseline", color, className)}>
      {legendWord ?? (
        <>
          {kbd}
          <span>{label}</span>
        </>
      )}
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

function GaugePips({
  frac,
  pulse,
  flash,
}: {
  frac: number;
  pulse?: boolean;
  flash?: boolean;
}) {
  const t = Math.max(0, Math.min(1, frac));
  const filled = flash ? FUEL_PIPS : Math.round(t * FUEL_PIPS);
  const tone = fuelTone(flash ? 1 : t);
  const pip =
    tone === "ok" ? "bg-ok" : tone === "caution" ? "bg-caution" : "bg-warn";
  const filling =
    pulse && !flash && t < 1 - 1e-6 ? Math.min(FUEL_PIPS - 1, Math.floor(t * FUEL_PIPS)) : -1;
  return (
    <span className="flex h-3 items-center gap-px rounded-sm bg-bg px-px">
      {Array.from({ length: FUEL_PIPS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-1.5",
            i === filling ? "bg-ok gauge-pip-fill" : i < filled ? pip : "bg-surface-2",
          )}
        />
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
