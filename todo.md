# Todo

## Kepler lock vs n-body: dump when they diverge

Keep the Kepler snap. Same warning + lock exit as atmosphere drag (`ORBIT_DRAG_BREAK = 0.4`), but when tidal pull from other bodies makes the ellipse a lie — e.g. a heavy moon rakes a giant's orbit.

**Done**

- Ratio is |a_other(ship) − a_other(host)| / |a_host|. Kepler already rides the host's frame; raw n-body vs host would dump every moon orbit because the parent is always pulling.
- Break at `ORBIT_PERTURB_BREAK = 0.4` with `Perturbed — orbit lost` (warn color + the drag alarm sound). Also refuse capture at that ratio.
- Do not rewrite `predictPath` to agree with lock.

## Chrome Android: white hairline flashes on stars / gravity grid

On Chrome for Android, the starfield and gravity grid sparkle with brief white line artifacts. Not tracked in-repo; it is a known Chrome GPU 2D-canvas issue (thin ~1px strokes and subpixel `fillRect`s, noisy coverage/AA, worse with MSAA). Later, not now.

**Why Orbit triggers it**

- Stars: thousands of subpixel `fillRect`s (0.4–1.25 CSS px) with `globalCompositeOperation = "lighter"`, so coverage errors blow toward white.
- Gravity grid: `lineWidth = 1.05 / zoom`, which lands at ~1 CSS pixel after camera scale — the weight Chrome antialiases worst.
- Camera motion (and shake) keeps those features sliding across pixel centers every frame.
- Context is `{ alpha: false, desynchronized: true }`; desynchronized on Android can present a buffer mid-frame.
- DPR is capped at 2 while many Androids are 2.625–3.5, so the bitmap is CSS-upscaled and thin geometry shimmers more.

**Likely later work**

- Snap stars/grid to device pixels; skip `lighter` on the starfield.
- Drop `desynchronized` on Android.
- Draw at true device DPR, or integer-pixel star dots.

**Where**

- `src/game/runtime.ts` — `getContext`, DPR cap
- `src/game/draw.ts` — `drawStars`, `drawStarDot`, `drawGravityGrid`
