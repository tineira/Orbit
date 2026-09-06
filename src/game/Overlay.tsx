import { useEffect } from "react";
import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import type { HudSnapshot } from "./types";
import { ATMO_STEPS, GRAVITY_STEPS, ORBIT_DRAG_HINT } from "./sim";
import { getPlanets, planetById } from "./world";
import { cn } from "@/lib/utils";

type Props = {
  hud: HudSnapshot;
  onLaunch: () => void;
  onTakeoff: () => void;
  onReboot: () => void;
  onMute: () => void;
  onGravity: (dir: number) => void;
  onAtmo: (dir: number) => void;
};

function isEnterKey(e: KeyboardEvent) {
  return e.code === "Enter" || e.code === "NumpadEnter" || e.key === "Enter";
}

export function Overlay({ hud, onLaunch, onTakeoff, onReboot, onMute, onGravity, onAtmo }: Props) {
  const landed = hud.landedId ? planetById(hud.landedId) : null;
  const crashed = hud.crashedId ? planetById(hud.crashedId) : null;

  useEffect(() => {
    if (hud.phase !== "title") return;
    const onKey = (e: KeyboardEvent) => {
      if (!isEnterKey(e)) return;
      e.preventDefault();
      onLaunch();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onLaunch]);

  useEffect(() => {
    if (hud.phase !== "crashed") return;
    const onKey = (e: KeyboardEvent) => {
      if (isEnterKey(e) || e.code === "KeyR" || e.code === "Space") {
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
      if (!isEnterKey(e) && e.code !== "Space") return;
      e.preventDefault();
      onTakeoff();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hud.phase, onTakeoff]);

  return (
    <div className="pointer-events-none absolute inset-0 text-fg">
      {hud.phase === "creating" ? <Creating /> : null}
      {hud.phase === "title" ? (
        <Title
          onLaunch={onLaunch}
          physicsMenu={hud.physicsMenu}
          orbitShell={hud.orbitShell}
          lagrangePoints={hud.lagrangePoints}
          gravityGrid={hud.gravityGrid}
        />
      ) : null}

      {hud.phase !== "title" && hud.phase !== "creating" ? (
        <>
          <header className="absolute top-0 left-0 right-0 flex items-start justify-between gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
            <div className="min-w-0">
              <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted">Nearest body</p>
              <p className="mt-1 font-display text-2xl leading-tight font-medium tracking-tight text-fg">{hud.nearestName ?? "—"}</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                {hud.altitude != null ? `ALT ${fmt(hud.altitude)}` : "DEEP SPACE"}
                <span className="mx-2 text-subtle">/</span>
                {statusLabel(hud)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="text-right">
                <p className="font-mono text-xs tracking-[0.18em] uppercase text-muted">Ship</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-fg">
                  {fmt(hud.speed)} <span className="text-muted">u/s</span>
                  <span className="mx-2 text-subtle">·</span>
                  {fmt(hud.drag)} <span className="text-muted">drag</span>
                </p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
                  HDG {hud.headingDeg.toFixed(0).padStart(3, "0")}° · MASS {hud.mass.toFixed(1)}
                </p>
              </div>
              {hud.physicsMenu ? (
                <PhysicsKnobs gravityScale={hud.gravityScale} atmoScale={hud.atmoScale} onGravity={onGravity} onAtmo={onAtmo} />
              ) : null}
            </div>
          </header>

          <div className="absolute bottom-16 left-0 p-4 sm:p-6 max-w-[22rem]">
            <button
              type="button"
              data-ui
              onClick={onMute}
              aria-label={hud.muted ? "Unmute" : "Mute"}
              className="pointer-events-auto mb-3 size-11 grid place-items-center rounded-md text-muted hover:text-fg transition-colors duration-[var(--motion-quick)] ease-[var(--ease-out)]"
            >
              {hud.muted ? <VolumeX className="size-4" strokeWidth={1.75} /> : <Volume2 className="size-4" strokeWidth={1.75} />}
            </button>
            <p className="font-mono text-xs leading-relaxed text-muted">
              <span className="hidden sm:inline">Left / right yaw. Up burns. Down retro. + / − or scroll to zoom.</span>
              <span className="sm:hidden">Hold to point and burn. Pinch to zoom.</span>
            </p>
            <p className="mt-2 hidden sm:flex font-mono text-xs">
              <KeyTips
                orbitShell={hud.orbitShell}
                lagrangePoints={hud.lagrangePoints}
                physicsMenu={hud.physicsMenu}
                gravityGrid={hud.gravityGrid}
              />
            </p>
            {hud.orbitShell ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">Orbit shell · {hud.nearestName ?? "—"}</p>
            ) : null}
            {hud.lagrangePoints ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">Lagrange points</p>
            ) : null}
            {hud.gravityGrid ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">Gravity grid</p>
            ) : null}
            {hud.orbitHint && hud.phase !== "crashed" ? (
              <p
                className={cn(
                  "mt-2 font-mono text-xs tracking-wide uppercase",
                  hud.status === "too-fast" || hud.status === "crashed" || hud.orbitHint === ORBIT_DRAG_HINT
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
            {hud.muted ? <VolumeX className="size-4" strokeWidth={1.75} /> : <Volume2 className="size-4" strokeWidth={1.75} />}
          </button>
          {hud.physicsMenu ? (
            <PhysicsKnobs gravityScale={hud.gravityScale} atmoScale={hud.atmoScale} onGravity={onGravity} onAtmo={onAtmo} />
          ) : null}
        </div>
      ) : null}

      {hud.phase === "landed" && landed ? (
        <LandingCard planet={landed} onTakeoff={onTakeoff} />
      ) : null}

      {hud.phase === "crashed" && crashed ? (
        <CrashCard planet={crashed} onReboot={onReboot} />
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
      <p className="creating-world font-mono text-sm tracking-[0.2em] uppercase text-muted" aria-live="polite">
        Creating world
      </p>
    </div>
  );
}

function Title({
  onLaunch,
  physicsMenu,
  orbitShell,
  lagrangePoints,
  gravityGrid,
}: {
  onLaunch: () => void;
  physicsMenu: boolean;
  orbitShell: boolean;
  lagrangePoints: boolean;
  gravityGrid: boolean;
}) {
  const destinations = getPlanets().filter((p) => p.kind !== "star");
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
          A 2D craft with mass and inertia. Each world has its own well. Catch a circular or elliptical orbit and it locks. Burn to leave. Land if you arrive slow.
        </p>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-muted sm:grid-cols-3">
          {destinations.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2">
              <span className="font-display text-sm font-medium tracking-tight text-fg">{p.name}</span>
              <span className="text-subtle">{p.kicker}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-start gap-3 lg:mr-[13.5rem]">
          <p className="font-mono text-xs text-subtle max-w-xs">
            Press Enter to take off. Left / right rotate. Up burns. On a phone, tap the sky.
          </p>
          <p className="hidden sm:flex font-mono text-xs max-w-[12.5rem]">
            <KeyTips
              orbitShell={orbitShell}
              lagrangePoints={lagrangePoints}
              physicsMenu={physicsMenu}
              gravityGrid={gravityGrid}
            />
          </p>
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
        </div>
      </div>
    </div>
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
        <h2 className="mt-2 font-display text-3xl leading-tight font-semibold tracking-tight text-fg">{planet.title}</h2>
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

function CrashCard({
  planet,
  onReboot,
}: {
  planet: NonNullable<ReturnType<typeof planetById>>;
  onReboot: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-5 pointer-events-none">
      <article
        data-ui
        className="pointer-events-auto w-full max-w-md rounded-xl bg-surface border border-border p-5 sm:p-6 shadow-lg"
      >
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-warn">Hull loss</p>
        <h2 className="mt-2 font-display text-3xl leading-tight text-fg">You crashed</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The approach into {planet.name} was too fast. The well won. Bring the craft back and try a slower pass — or catch an orbit first.
        </p>
        <div className="mt-5">
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
        </div>
      </article>
    </div>
  );
}

function fmt(n: number) {
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
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
}: {
  orbitShell: boolean;
  lagrangePoints: boolean;
  physicsMenu: boolean;
  gravityGrid: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <KeyTip code="O" label="orbit shell" on={orbitShell} />
      <KeyTip code="L" label="Lagrange" on={lagrangePoints} />
      <KeyTip code="P" label="physics" on={physicsMenu} />
      <KeyTip code="G" label="grid" on={gravityGrid} />
    </span>
  );
}

function KeyTip({ code, label, on }: { code: string; label: string; on?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", on ? "text-ok" : "text-muted")}>
      <kbd
        className={cn(
          "font-mono text-[10px] tracking-widest uppercase px-1 py-0.5 rounded border",
          on ? "border-ok/40 text-ok" : "border-border text-fg/70",
        )}
      >
        {code}
      </kbd>
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
        <p className="flex-1 text-center font-mono text-sm tabular-nums text-fg">{fmtScale(value)}</p>
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

function statusLabel(hud: HudSnapshot) {
  switch (hud.status) {
    case "orbit":
      return hud.orbitLocked ? (hud.orbitEcc >= 0.08 ? "ELLIPSE" : "LOCKED") : "ORBIT";
    case "lagrange":
      return hud.lagrangeLabel ?? "L-POINT";
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
