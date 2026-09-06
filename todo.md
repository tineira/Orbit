# Todo

## Fix projected path vs locked-orbit divergence

The dashed coasting line and the orbit you actually catch often disagree. The line is a short n-body forecast; lock is a 2-body Kepler snap around one planet. Make them agree so the path you see is the orbit you enter.

**Why they diverge today**

- `predictPath` in `src/game/sim.ts` (drawn from `src/game/draw.ts`) only coasts ~10s under **all** gravity plus atmosphere drag. Planets are frozen. It never applies capture.
- Capture (`captureOrbit` / `readKepler` / `applyKepler`) switches to a **2-body Kepler ellipse** around the nearest body, then **puts the ship on that orbit**. Near-circular cases (`e < 0.04`) rewrite speed to circular at the current radius.
- Lock only accepts a compact bound ellipse (energy, `e < 0.92`, periapsis clear of the surface, apoapsis inside `radius + min(radius * 4.8, 720)`), and only after a 0.55s dwell in a low altitude shell. The approach line is often a solar flyby; the lock ring is a tight oval.
- After lock, `predictPath` traces the Kepler ellipse instead of n-body, so the dashed line itself jumps.

**Fix**

- Predict the path with the same rules as flight: if this coast would capture, show the Kepler orbit that would lock — not a 10s n-body stub.
- Stop snapping the ship onto a different orbit than the one the line just showed (drop the circular rewrite, or apply it in the predictor too).
- Keep the dashed line continuous across the lock moment.

**Where**

- `src/game/sim.ts` — `predictPath`, `readKepler`, `captureOrbit`, `applyKepler`, `orbitReady`
- `src/game/draw.ts` — `drawPath`, `drawLockRing`
