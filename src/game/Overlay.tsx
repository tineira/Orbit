import { useEffect } from "react";
import { Minus, Plus, Volume2, VolumeX } from "lucide-react";
import type { HudSnapshot, VerboseDiag } from "./types";
import { ATMO_STEPS, GRAVITY_STEPS, getPlanets, planetById } from "./world";
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
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
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
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleVerbose,
}: Props) {
  const landed = hud.landedId ? planetById(hud.landedId) : null;
  const crashed = hud.crashedId ? planetById(hud.crashedId) : null;

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
        />
      ) : null}

      {hud.phase !== "title" && hud.phase !== "creating" ? (
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
                  <PhysicsKnobs
                    gravityScale={hud.gravityScale}
                    atmoScale={hud.atmoScale}
                    onGravity={onGravity}
                    onAtmo={onAtmo}
                  />
                ) : null}
              </div>
            </div>
            {hud.verbose && hud.verboseDiag ? <VerbosePanel diag={hud.verboseDiag} /> : null}
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
              <span className="hidden sm:inline">
                Left / right yaw. Up burns. Down retro. + / − or scroll to zoom.
              </span>
              <span className="sm:hidden">Hold to point and burn. Pinch to zoom.</span>
            </p>
            <p className="mt-2 flex font-mono text-xs">
              <KeyTips
                orbitShell={hud.orbitShell}
                lagrangePoints={hud.lagrangePoints}
                physicsMenu={hud.physicsMenu}
                gravityGrid={hud.gravityGrid}
                verbose={hud.verbose}
                onToggleOrbitShell={onToggleOrbitShell}
                onToggleLagrange={onToggleLagrange}
                onToggleGravityGrid={onToggleGravityGrid}
                onToggleVerbose={onToggleVerbose}
              />
            </p>
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
            {hud.verbose ? (
              <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ok">
                Verbose
              </p>
            ) : null}
            {hud.orbitHint && hud.phase !== "crashed" ? (
              <p
                className={cn(
                  "mt-2 font-mono text-xs tracking-wide uppercase",
                  hud.status === "too-fast" ||
                    hud.status === "crashed" ||
                    hud.orbitHint === ORBIT_DRAG_HINT ||
                    hud.orbitHint === ORBIT_PERTURB_HINT ||
                    isOrbitLostHint(hud.orbitHint)
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
          {hud.physicsMenu ? (
            <PhysicsKnobs
              gravityScale={hud.gravityScale}
              atmoScale={hud.atmoScale}
              onGravity={onGravity}
              onAtmo={onAtmo}
            />
          ) : null}
        </div>
      ) : null}

      {hud.phase === "landed" && landed ? (
        <LandingCard planet={landed} onTakeoff={onTakeoff} />
      ) : null}

      {hud.phase === "crashed" && crashed ? (
        <CrashCard
          burned={hud.burned}
          crashKind={hud.crashKind}
          detail={crashDetail(crashed.name, hud.burned, hud.burnCause, hud.crashKind)}
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
}: {
  onLaunch: () => void;
  onNewWorld: () => void;
  physicsMenu: boolean;
  orbitShell: boolean;
  lagrangePoints: boolean;
  gravityGrid: boolean;
  verbose: boolean;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
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
          A 2D craft with mass and inertia. Each world has its own well. Catch a circular or
          elliptical orbit and it locks. Burn to leave. Land if you arrive slow.
        </p>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-muted sm:grid-cols-3">
          {destinations.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2">
              <span className="font-display text-sm font-medium tracking-tight text-fg">
                {p.name}
              </span>
              <span className="text-subtle">{p.kicker}</span>
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
              onToggleOrbitShell={onToggleOrbitShell}
              onToggleLagrange={onToggleLagrange}
              onToggleGravityGrid={onToggleGravityGrid}
              onToggleVerbose={onToggleVerbose}
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

function crashDetail(
  name: string,
  burned: boolean,
  cause: HudSnapshot["burnCause"],
  kind: HudSnapshot["crashKind"],
) {
  if (kind === "sink") return `The craft fell into ${name}. The clouds closed.`;
  if (!burned) {
    return `The approach into ${name} was too fast. The well won. Bring the craft back and try a slower pass — or catch an orbit first.`;
  }
  if (cause === "flare") return `A flare from ${name} reached the craft.`;
  return `Too close to ${name}. The hull cooked.`;
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
  onToggleOrbitShell,
  onToggleLagrange,
  onToggleGravityGrid,
  onToggleVerbose,
}: {
  orbitShell: boolean;
  lagrangePoints: boolean;
  physicsMenu: boolean;
  gravityGrid: boolean;
  verbose: boolean;
  onToggleOrbitShell: () => void;
  onToggleLagrange: () => void;
  onToggleGravityGrid: () => void;
  onToggleVerbose: () => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
      <KeyTip code="O" label="orbit shell" on={orbitShell} onToggle={onToggleOrbitShell} />
      <KeyTip code="L" label="Lagrange" on={lagrangePoints} onToggle={onToggleLagrange} />
      <KeyTip code="P" label="physics" on={physicsMenu} className="hidden sm:inline-flex" />
      <KeyTip code="G" label="grid" on={gravityGrid} onToggle={onToggleGravityGrid} />
      <KeyTip code="V" label="verbose" on={verbose} onToggle={onToggleVerbose} />
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
