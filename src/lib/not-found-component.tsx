import { Link } from "@tanstack/react-router";

export function AppNotFoundComponent() {
  return (
    <main className="flex min-h-dvh flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.22em] uppercase text-muted">Deep space</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl leading-none tracking-tight font-semibold text-fg">
          Off the chart
        </h1>
        <p className="mt-4 max-w-md text-sm sm:text-base leading-relaxed text-muted">
          This heading is not in the system. Burn back to Lumen and try a known orbit.
        </p>
      </div>
      <Link
        to="/"
        className="h-12 w-fit px-5 rounded-lg bg-fg text-accent-fg text-sm font-medium tracking-wide inline-flex items-center hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]"
      >
        Return
      </Link>
    </main>
  );
}
