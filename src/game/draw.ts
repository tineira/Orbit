import type { Camera, FlightStatus, Particle, Planet, SolarFlare } from "./types";
import type { Sim } from "./sim";
import {
  atmoDrag,
  atmoRadius,
  bodyMu,
  forwardOf,
  gravityPulls,
  LAGRANGE_CAPTURE_R,
  listLagrangePoints,
  lockedOrbitPolyline,
  orbitPerturb,
  predictPath,
  predictPlanetPaths,
  predictRelativePath,
  relativePathTarget,
  flareArcPoints,
  flareApexNow,
  sinkAlpha,
  spectroFocus,
} from "./sim";
import { bodyPeaks, MZ_MAX, SCAN_SECONDS, SUBSTANCES, type SpectrumPeak } from "./matter";
import {
  getMinimapWorldR,
  getSystemName,
  headingVec,
  lockedNearby,
  WARP_AIM_DEG,
  WARP_BAR_SPEED,
  isGhostBody,
  ORBIT_DRAG_BREAK,
  ORBIT_PERTURB_BREAK,
  orbitShellAlts,
  STAR_ATMO_FACTOR,
  transitBeat,
  transitBoomAt,
  transitLaunchU,
  transitArriveU,
  warpApproach,
  warpCharge,
  flightStarStreak,
  WARP_FLASH,
  WARP_FLIGHT_STREAK,
  WARP_LAUNCH,
  WARP_FX_SPEED,
  WARP_JUMP_SPEED,
  WARP_LOST_FADE,
  WARP_LOST_FADE_REDUCED,
  WARP_RUMBLE_REF_SPEED,
  WARP_TUNNEL_STREAK,
  beltBands,
} from "./world";
import { asteroidWorldPath, surfaceRadius } from "./asteroid";
import { asteroidMine, MINE_BEACON_PERIOD_MS, mineBeaconLit } from "./occupancy";
import { beltPhase, moteAt } from "./belt";

type DrawOpts = {
  w: number;
  h: number;
  dpr: number;
  cssW: number;
  cssH: number;
  status: FlightStatus;
  phase: Sim["phase"];
};

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function drawFrame(ctx: CanvasRenderingContext2D, sim: Sim, opts: DrawOpts) {
  const { w, h, dpr, cssW, cssH } = opts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, cssW, cssH);

  const cam = sim.camera;
  const now = performance.now();
  const rumble = warpRumbleStrength(sim);
  const shakeX = sim.reducedMotion
    ? 0
    : (hash(now * 0.08) - 0.5) * cam.shake * 18 +
      (hash(now * 0.62) - 0.5) * rumble * 5.5 +
      (hash(now * 1.85) - 0.5) * rumble * 2.4;
  const shakeY = sim.reducedMotion
    ? 0
    : (hash(now * 0.09 + 9) - 0.5) * cam.shake * 18 +
      (hash(now * 0.71 + 3) - 0.5) * rumble * 4.8 +
      (hash(now * 1.6 + 5) - 0.5) * rumble * 2.1;

  if (!sim.showGravityGrid) drawStars(ctx, cam, cssW, cssH, shakeX, shakeY, sim);
  ctx.save();
  ctx.translate(cssW / 2 + shakeX, cssH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const fade = chartFade(sim);
  if (sim.showGravityGrid && fade > 0.05) drawGravityGrid(ctx, sim, cam, cssW, cssH);
  if (fade > 0.04) {
    ctx.save();
    ctx.globalAlpha *= fade;
    drawSunBloom(ctx, sim);
    drawStarCorona(ctx, sim);
    drawLockRing(ctx, sim);
    if (sim.phase === "flight") {
      const sp = Math.hypot(sim.ship.vx, sim.ship.vy);
      drawPath(ctx, predictPath(sim, sp > 400 ? 3 : 10), sim);
    }
    const star = sim.planets.find((b) => b.kind === "star") ?? null;
    drawBelts(ctx, sim);
    for (const p of sim.planets) {
      if (!isGhostBody(p)) drawPlanet(ctx, p, cam, star, sim.planets, now, sim.reducedMotion);
    }
    drawSolarFlares(ctx, sim);
    drawOrbitShell(ctx, sim);
    drawLagrangePoints(ctx, sim, cam);
    drawRelativePath(ctx, sim);
    drawPlanetPaths(ctx, sim);
    ctx.restore();
  }
  const particlesOver = sim.burned || sim.crashKind === "sink";
  drawIonTrail(ctx, sim);
  if (!particlesOver) drawParticles(ctx, sim.particles);
  if (fade > 0.04) drawGravityArrows(ctx, sim);
  const star = sim.planets.find((b) => b.kind === "star") ?? null;
  const shipUmbra = star ? pointUmbraMax(sim.ship.x, sim.ship.y, sim.planets, star, null) : 0;
  drawWarpRings(ctx, sim);
  drawShip(ctx, sim, shipUmbra);
  if (particlesOver) drawParticles(ctx, sim.particles);
  drawShipLockBars(ctx, sim, cam);

  ctx.restore();
  drawVignette(ctx, cssW, cssH);
  drawArrivalFlash(ctx, sim, cssW, cssH);
  drawWarpAims(ctx, sim, cssW, cssH);
  if (sim.phase !== "transit" && !sim.warpLost) {
    drawMinimap(ctx, sim, cssW, cssH);
    // Keep drawing through the CRT power-off collapse after the panel is toggled off.
    const specOffAnim = !sim.reducedMotion && performance.now() - sim.spectroOffAt < 700;
    if (sim.showSpectro || specOffAnim) drawSpectrograph(ctx, sim, cssW, cssH);
  }
  void w;
  void h;
}

function worldToScreen(cam: Camera, x: number, y: number, cssW: number, cssH: number) {
  return {
    x: (x - cam.x) * cam.zoom + cssW / 2,
    y: (y - cam.y) * cam.zoom + cssH / 2,
  };
}

function wrapSpan(v: number, span: number) {
  return ((v % span) + span) % span;
}

/** Well depth as a fraction of a body's surface potential (mu / R). */
const GRID_WELL_DEPTH_K = 2;
/** Falloff exponent. Lower reaches farther; below ~1.2 the star visibly drags planet wells sunward. */
const GRID_WELL_FALLOFF = 1.3;
/**
 * Depth cap in body radii. Keeps every vertex displacement under 1.7R so points
 * that fold past the center still land inside the hidden disc (|r - d| < 0.88R
 * for any visible vertex with r >= 0.88R), and the body sprite covers them.
 */
const GRID_WELL_MAX_R = 1.7;

function gridLod(zoom: number) {
  const target = Math.max(16, 40 / Math.max(0.04, zoom));
  const log = Math.log2(target);
  const fineExp = Math.floor(log);
  const fine = 2 ** fineExp;
  return { fine, coarse: fine * 2, fade: log - fineExp, target };
}

function onLattice(v: number, step: number) {
  const q = Math.round(v / step) * step;
  return Math.abs(v - q) <= step * 1e-6;
}

function gridBuried(x: number, y: number, planets: Planet[]) {
  for (const p of planets) {
    if (isGhostBody(p) || p.radius <= 0) continue;
    if (Math.hypot(x - p.x, y - p.y) < p.radius * 0.88) return true;
  }
  return false;
}

/**
 * Slide a grid vertex toward each body by d(r) = D * (R / max(r, R))^p, summed
 * as vectors (p = GRID_WELL_FALLOFF). Each body's depth D is constant in r, so
 * d(r) is monotonically decreasing and the radial spacing ratio
 * s'(r) = 1 + p*D*R^p/r^(p+1) stays > 1 everywhere: the mesh always stretches
 * toward mass (reads as "down"), with no clamp crossover that would invert the
 * gradient partway in.
 */
function warpGridPoint(x: number, y: number, sim: Sim) {
  let dx = 0;
  let dy = 0;
  for (const p of sim.planets) {
    if (isGhostBody(p) || p.mass <= 0 || p.radius <= 0) continue;
    const bx = p.x - x;
    const by = p.y - y;
    const r = Math.hypot(bx, by);
    if (r < 1e-6) continue;
    const depth = Math.min(
      (GRID_WELL_DEPTH_K * bodyMu(p, sim.gravityScale)) / p.radius,
      GRID_WELL_MAX_R * p.radius,
    );
    const rr = Math.max(r, p.radius);
    const d = depth * Math.pow(p.radius / rr, GRID_WELL_FALLOFF);
    dx += (bx / r) * d;
    dy += (by / r) * d;
  }
  return { x: x + dx, y: y + dy };
}

function strokeGridRun(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  xs: Float64Array,
  ys: Float64Array,
  hide: Uint8Array,
  alongRows: boolean,
  index: number,
) {
  ctx.beginPath();
  let pen = false;
  const n = alongRows ? cols : rows;
  for (let k = 0; k < n; k++) {
    const i = alongRows ? k : index;
    const j = alongRows ? index : k;
    const p = j * cols + i;
    if (hide[p]) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(xs[p]!, ys[p]!);
      pen = true;
    } else ctx.lineTo(xs[p]!, ys[p]!);
  }
  ctx.stroke();
}

function drawGravityGrid(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cam: Camera,
  cssW: number,
  cssH: number,
) {
  const zoom = Math.max(0.04, cam.zoom);
  const { fine: step, coarse, fade } = gridLod(zoom);
  const pad = step * 9;
  const halfW = cssW / (2 * zoom) + pad;
  const halfH = cssH / (2 * zoom) + pad;
  const x0 = Math.floor((cam.x - halfW) / step) * step;
  const y0 = Math.floor((cam.y - halfH) / step) * step;
  const cols = Math.min(96, Math.ceil((cam.x + halfW - x0) / step) + 1);
  const rows = Math.min(72, Math.ceil((cam.y + halfH - y0) / step) + 1);
  const n = cols * rows;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const hide = new Uint8Array(n);

  for (let j = 0; j < rows; j++) {
    const gy = y0 + j * step;
    for (let i = 0; i < cols; i++) {
      const gx = x0 + i * step;
      const k = j * cols + i;
      hide[k] = gridBuried(gx, gy, sim.planets) ? 1 : 0;
      const w = warpGridPoint(gx, gy, sim);
      xs[k] = w.x;
      ys[k] = w.y;
    }
  }

  const baseA = 0.16;
  const fineA = baseA * (1 - fade);
  ctx.save();
  ctx.lineWidth = 1.05 / zoom;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let j = 0; j < rows; j++) {
    const a = onLattice(y0 + j * step, coarse) ? baseA : fineA;
    if (a < 0.005) continue;
    ctx.strokeStyle = `rgba(183, 192, 204, ${a})`;
    strokeGridRun(ctx, cols, rows, xs, ys, hide, true, j);
  }
  for (let i = 0; i < cols; i++) {
    const a = onLattice(x0 + i * step, coarse) ? baseA : fineA;
    if (a < 0.005) continue;
    ctx.strokeStyle = `rgba(183, 192, 204, ${a})`;
    strokeGridRun(ctx, cols, rows, xs, ys, hide, false, i);
  }
  ctx.restore();
}

const STAR_TINTS: [number, number, number][] = [
  [210, 224, 255],
  [248, 248, 252],
  [255, 232, 196],
  [255, 186, 138],
];
const STAR_TINT_CSS = STAR_TINTS.map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);

type StarSpec = {
  gx: number;
  gy: number;
  size: number;
  a: number;
  tint: number;
};

type StarLayer = {
  par: number;
  span: number;
  lineW: number;
  stars: StarSpec[];
};

function starTint(i: number) {
  const t = hash(i * 3.17);
  if (t < 0.52) return 0;
  if (t < 0.8) return 1;
  if (t < 0.93) return 2;
  return 3;
}

function makeStarLayer(
  n: number,
  par: number,
  size: number,
  a: number,
  span: number,
  seed = 0,
): StarLayer {
  const stars: StarSpec[] = [];
  for (let i = 0; i < n; i++) {
    const mag = hash(i * 11.9 + par + seed);
    stars.push({
      gx: hash(i * 19.17 + par * 8 + seed) * span,
      gy: hash(i * 47.3 + par * 3 + seed) * span,
      size: size * (0.65 + mag * 0.7),
      a: a * (0.55 + mag * 0.45),
      tint: starTint(i + seed),
    });
  }
  stars.sort((p, q) => p.tint - q.tint || p.a - q.a);
  return { par, span, lineW: Math.max(size, 0.85), stars };
}

function makeMilkyLayer(): StarLayer {
  const span = 2600;
  const par = 0.022;
  const stars: StarSpec[] = [];
  const ca = Math.cos(-0.48);
  const sa = Math.sin(-0.48);
  for (let i = 0; i < 1600; i++) {
    const along = (hash(i * 2.13) - 0.5) * span * 1.35;
    const u = hash(i * 8.41) * 2 - 1;
    const across = u * u * u * 520;
    const mag = hash(i * 4.6);
    stars.push({
      gx: span * 0.5 + along * ca - across * sa,
      gy: span * 0.5 + along * sa + across * ca,
      size: 0.4 + mag * 0.55,
      a: 0.14 + mag * 0.24,
      tint: starTint(i + 400),
    });
  }
  stars.sort((p, q) => p.tint - q.tint || p.a - q.a);
  return { par, span, lineW: 0.85, stars };
}

const STAR_LAYERS: StarLayer[] = [
  makeStarLayer(1400, 0.018, 0.5, 0.28, 2400),
  makeStarLayer(900, 0.028, 0.72, 0.44, 2100),
  makeStarLayer(420, 0.04, 1.0, 0.62, 1800),
  makeStarLayer(160, 0.055, 1.25, 0.78, 1600),
];
const MILKY_LAYER = makeMilkyLayer();
const BRIGHT_LAYER = makeStarLayer(36, 0.06, 1.45, 0.82, 2000, 90);

function chartFade(sim: Sim) {
  if (sim.warpLost) return 0;
  if (sim.phase !== "transit" || sim.transitPunched) return 1;
  const t = Math.min(1, sim.transitAge / WARP_LAUNCH);
  return (1 - t) * (1 - t);
}

function rumbleFromSpeed(speed: number) {
  const w = warpApproach(speed) * 0.35 + warpCharge(speed);
  return w * w;
}

function warpRumbleStrength(sim: Sim) {
  if (sim.reducedMotion) return 0;
  // In-flight spool only. Transit is a smooth ride — no camera rumble.
  if (sim.phase === "transit") return 0;
  const sp = Math.hypot(sim.ship.vx, sim.ship.vy);
  if (sp <= WARP_FX_SPEED) return 0;
  const t = Math.min(1, (sp - WARP_FX_SPEED) / (WARP_JUMP_SPEED - WARP_FX_SPEED));
  return rumbleFromSpeed(WARP_FX_SPEED + t * (WARP_RUMBLE_REF_SPEED - WARP_FX_SPEED));
}

function starStreak(sim: Sim | undefined) {
  if (!sim || sim.reducedMotion) return 0;
  if (sim.warpLost || (sim.phase === "transit" && !sim.transitPunched)) {
    const u = transitLaunchU(sim.transitAge);
    return WARP_FLIGHT_STREAK + u * (WARP_TUNNEL_STREAK - WARP_FLIGHT_STREAK);
  }
  if (sim.phase === "transit" && sim.transitPunched) {
    return transitArriveU(sim.transitAge, sim.reducedMotion) * WARP_TUNNEL_STREAK;
  }
  return flightStarStreak(Math.hypot(sim.ship.vx, sim.ship.vy));
}

const STAR_PAR_NEAR = 0.06;
const STAR_PAR_FAR = 0.018;

function starStreakFull(sim: Sim | undefined) {
  if (!sim || sim.reducedMotion) return false;
  if (sim.warpLost || (sim.phase === "transit" && !sim.transitPunched)) return true;
  return (
    sim.phase === "transit" &&
    sim.transitPunched &&
    transitArriveU(sim.transitAge, sim.reducedMotion) > 0.04
  );
}

/** Near field streaks first. Far layers stay as dots until the spool is much higher. */
function layerStreakLen(base: number, par: number, full: boolean) {
  if (base <= 0) return 0;
  const d = Math.max(0, Math.min(1, (par - STAR_PAR_FAR) / (STAR_PAR_NEAR - STAR_PAR_FAR)));
  if (full) return base * (0.38 + 0.62 * d);
  const hold = (1 - d) * (1 - d) * 11;
  return Math.max(0, base - hold) * (0.2 + 0.8 * d);
}

function lostStarDim(sim?: Sim) {
  if (!sim?.warpLost) return 1;
  const dur = sim.reducedMotion ? WARP_LOST_FADE_REDUCED : WARP_LOST_FADE;
  const t = Math.max(0, Math.min(1, sim.transitAge / dur));
  const u = t * t * (3 - 2 * t);
  return 1 - 0.93 * u;
}

function drawStarLayer(
  ctx: CanvasRenderingContext2D,
  layer: StarLayer,
  ox: number,
  oy: number,
  cssW: number,
  cssH: number,
  streak: number,
  ux: number,
  uy: number,
  lenScale: number,
  dim = 1,
) {
  const { span, stars, lineW } = layer;
  const cx = cssW / 2 - span / 2;
  const cy = cssH / 2 - span / 2;
  const len = streak * lenScale;
  ctx.globalAlpha = dim;
  if (len < 0.45) {
    let tint = -1;
    for (const s of stars) {
      const x = wrapSpan(s.gx - ox, span) + cx;
      const y = wrapSpan(s.gy - oy, span) + cy;
      if (s.tint !== tint) {
        tint = s.tint;
        ctx.fillStyle = STAR_TINT_CSS[tint]!;
      }
      ctx.globalAlpha = s.a * dim;
      if (s.size <= 1.05) {
        const sz = Math.max(0.7, s.size);
        ctx.fillRect(x - sz * 0.5, y - sz * 0.5, sz, sz);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }
  const mix = Math.min(1, (len - 0.45) / 7.5);
  if (mix < 0.98) {
    let tint = -1;
    for (const s of stars) {
      const x = wrapSpan(s.gx - ox, span) + cx;
      const y = wrapSpan(s.gy - oy, span) + cy;
      if (s.tint !== tint) {
        tint = s.tint;
        ctx.fillStyle = STAR_TINT_CSS[tint]!;
      }
      ctx.globalAlpha = s.a * (1 - mix) * dim;
      if (s.size <= 1.05) {
        const sz = Math.max(0.7, s.size);
        ctx.fillRect(x - sz * 0.5, y - sz * 0.5, sz, sz);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.lineCap = "round";
  ctx.lineWidth = lineW;
  const lineA = 0.95 + 0.35 * mix;
  let i = 0;
  while (i < stars.length) {
    const tint = stars[i]!.tint;
    ctx.strokeStyle = STAR_TINT_CSS[tint]!;
    let end = i;
    while (end < stars.length && stars[end]!.tint === tint) end += 1;
    const mid = i + ((end - i) >> 1);
    for (const [from, to, band] of [
      [i, mid, 0.5],
      [mid, end, 0.92],
    ] as const) {
      ctx.globalAlpha = band * lineA * dim;
      ctx.beginPath();
      for (let k = from; k < to; k++) {
        const s = stars[k]!;
        const x = wrapSpan(s.gx - ox, span) + cx;
        const y = wrapSpan(s.gy - oy, span) + cy;
        ctx.moveTo(x - ux * len, y - uy * len);
        ctx.lineTo(x + ux * len * 0.15, y + uy * len * 0.15);
      }
      ctx.stroke();
    }
    i = end;
  }
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cssW: number,
  cssH: number,
  sx: number,
  sy: number,
  sim?: Sim,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const base = starStreak(sim);
  const full = starStreakFull(sim);
  const dim = lostStarDim(sim);
  const sp = sim ? Math.hypot(sim.ship.vx, sim.ship.vy) : 0;
  const ux = sim && sp > 1e-6 ? sim.ship.vx / sp : 0;
  const uy = sim && sp > 1e-6 ? sim.ship.vy / sp : 0;
  const driftX = cam.starDriftX ?? 0;
  const driftY = cam.starDriftY ?? 0;
  const px = cam.x + driftX + sx;
  const py = cam.y + driftY + sy;

  for (const layer of STAR_LAYERS) {
    drawStarLayer(
      ctx,
      layer,
      px * layer.par,
      py * layer.par,
      cssW,
      cssH,
      layerStreakLen(base, layer.par, full),
      ux,
      uy,
      1,
      dim,
    );
  }
  drawStarLayer(
    ctx,
    MILKY_LAYER,
    px * MILKY_LAYER.par,
    py * MILKY_LAYER.par,
    cssW,
    cssH,
    layerStreakLen(base, MILKY_LAYER.par, full),
    ux,
    uy,
    1,
    dim,
  );

  const len = layerStreakLen(base, BRIGHT_LAYER.par, full);
  const mix = len < 0.45 ? 0 : Math.min(1, (len - 0.45) / 7.5);
  if (mix < 0.98) {
    const spanB = BRIGHT_LAYER.span;
    const oxb = px * BRIGHT_LAYER.par;
    const oyb = py * BRIGHT_LAYER.par;
    const cx = cssW / 2 - spanB / 2;
    const cy = cssH / 2 - spanB / 2;
    let tint = -1;
    for (const s of BRIGHT_LAYER.stars) {
      const x = wrapSpan(s.gx - oxb, spanB) + cx;
      const y = wrapSpan(s.gy - oyb, spanB) + cy;
      if (s.tint !== tint) {
        tint = s.tint;
        ctx.fillStyle = STAR_TINT_CSS[tint]!;
      }
      ctx.globalAlpha = 0.08 * (1 - mix) * dim;
      ctx.beginPath();
      ctx.arc(x, y, s.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawStarLayer(
    ctx,
    BRIGHT_LAYER,
    px * BRIGHT_LAYER.par,
    py * BRIGHT_LAYER.par,
    cssW,
    cssH,
    len,
    ux,
    uy,
    1,
    dim,
  );

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSunBloom(ctx: CanvasRenderingContext2D, sim: Sim) {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star) return;
  const outer = star.radius * 3.15;
  const g = ctx.createRadialGradient(star.x, star.y, star.radius * 0.7, star.x, star.y, outer);
  g.addColorStop(0, "rgba(255, 196, 90, 0.16)");
  g.addColorStop(0.38, "rgba(255, 170, 70, 0.07)");
  g.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(star.x, star.y, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawStarCorona(ctx: CanvasRenderingContext2D, sim: Sim) {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star) return;
  const R = star.radius;
  const corona = R * STAR_ATMO_FACTOR;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(star.x, star.y, R * 0.92, star.x, star.y, corona);
  g.addColorStop(0, hexRgba(star.colorA, 0.34));
  g.addColorStop(0.28, hexRgba(star.colorB, 0.16));
  g.addColorStop(1, "rgba(255, 140, 40, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(star.x, star.y, corona, 0, Math.PI * 2);
  ctx.fill();

  const lobes = sim.reducedMotion ? 5 : 9;
  const t = sim.reducedMotion ? 0 : performance.now() * 0.00012;
  for (let i = 0; i < lobes; i++) {
    const a = t + i * ((Math.PI * 2) / lobes) + hash(i * 3.1) * 0.7;
    const reach = R * (1.12 + hash(i * 7.4) * 0.38);
    const w = R * (0.16 + hash(i * 2.2) * 0.12);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lg = ctx.createRadialGradient(
      star.x + c * R * 0.2,
      star.y + s * R * 0.2,
      R * 0.1,
      star.x + c * reach * 0.55,
      star.y + s * reach * 0.55,
      w,
    );
    lg.addColorStop(0, `rgba(255, 210, 120, ${sim.reducedMotion ? 0.07 : 0.11})`);
    lg.addColorStop(1, "rgba(255, 140, 40, 0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(
      star.x + c * (reach * 0.35),
      star.y + s * (reach * 0.35),
      w,
      reach * 0.42,
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function strokeLoop(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

function drawSolarFlares(ctx: CanvasRenderingContext2D, sim: Sim) {
  const star = sim.planets.find((p) => p.kind === "star");
  if (!star || !sim.flares.length) return;
  const now = performance.now();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const f of sim.flares) {
    if (flareApexNow(f, star.radius) <= star.radius + 8) continue;
    const age = 1 - Math.max(0, Math.min(1, f.life / f.max));
    const env = age < 0.2 ? age / 0.2 : age > 0.72 ? 1 - (age - 0.72) / 0.28 : 1;
    const glow = Math.max(0.2, env);
    const main = flareArcPoints(star, f, 28);
    if (main.length < 3) continue;

    ctx.strokeStyle = `rgba(255, 90, 40, ${0.1 * glow})`;
    ctx.lineWidth = f.baseW * 2.4;
    strokeLoop(ctx, main);
    ctx.strokeStyle = `rgba(255, 140, 55, ${0.22 * glow})`;
    ctx.lineWidth = f.baseW * 1.15;
    strokeLoop(ctx, main);

    const strands = sim.reducedMotion ? Math.min(3, f.strands) : f.strands;
    for (let i = 0; i < strands; i++) {
      const ghost: SolarFlare = {
        ...f,
        angle: f.angle + (hash(f.seed + i * 3.7) - 0.5) * 0.1,
        span: f.span * (0.82 + hash(f.seed + i * 1.9) * 0.28),
        reach: f.reach * (0.88 + hash(f.seed + i * 5.1) * 0.2),
      };
      const pts = flareArcPoints(star, ghost, 24);
      const bright = 0.28 + hash(f.seed + i) * 0.35;
      ctx.strokeStyle = `rgba(255, ${150 + Math.round(hash(i + 4) * 70)}, ${70 + Math.round(hash(i + 8) * 50)}, ${bright * glow})`;
      ctx.lineWidth = Math.max(1.4, f.baseW * (0.18 + hash(i * 2.4) * 0.22));
      strokeLoop(ctx, pts);
    }

    ctx.strokeStyle = `rgba(255, 220, 150, ${0.42 * glow})`;
    ctx.lineWidth = Math.max(1.2, f.baseW * 0.22);
    strokeLoop(ctx, main);

    if (!sim.reducedMotion && age > 0.28 && age < 0.92) {
      const rain = 7 + Math.floor(hash(f.seed) * 6);
      for (let i = 0; i < rain; i++) {
        const fall = (now * 0.00013 + hash(f.seed + i * 9) + age * 0.85) % 1;
        const side = hash(f.seed + i * 2) < 0.5 ? fall * 0.5 : 1 - fall * 0.5;
        const k = Math.min(main.length - 1, Math.max(0, Math.floor(side * (main.length - 1))));
        const p = main[k]!;
        const sz = 1.6 + hash(i * 6.1) * 2.2;
        ctx.fillStyle = `rgba(255, 190, 110, ${0.35 * glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawOrbitShell(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (!sim.showOrbitShell) return;
  if (sim.phase === "creating" || sim.phase === "crashed") return;
  const p =
    (sim.orbitLockId ? sim.planets.find((b) => b.id === sim.orbitLockId) : null) ?? sim.nearest;
  if (!p || isGhostBody(p) || p.radius <= 0) return;
  const { minAlt, maxAlt } = orbitShellAlts(p, sim.planets);
  const inner = p.radius + minAlt;
  const outer = p.radius + maxAlt;
  if (outer <= inner) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
  ctx.arc(p.x, p.y, inner, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(125, 155, 134, 0.14)";
  ctx.fill("evenodd");

  ctx.setLineDash([7, 9]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(125, 155, 134, 0.7)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(236, 234, 228, 0.4)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, inner, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawLockRing(ctx: CanvasRenderingContext2D, sim: Sim) {
  const ring = lockedOrbitPolyline(sim);
  if (ring.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "rgba(125, 155, 134, 0.22)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  strokeLoop(ctx, ring);
  ctx.strokeStyle = "rgba(236, 234, 228, 0.55)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([8, 10]);
  strokeLoop(ctx, ring);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[], sim: Sim) {
  if (path.length < 2 || sim.phase === "title") return;
  ctx.beginPath();
  ctx.moveTo(sim.ship.x, sim.ship.y);
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = "rgba(232, 230, 224, 0.22)";
  ctx.lineWidth = 1.1;
  ctx.setLineDash([5, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRelativePath(ctx: CanvasRenderingContext2D, sim: Sim) {
  const target = relativePathTarget(sim);
  if (!target) return;
  const path = predictRelativePath(sim, target, 24);
  if (path.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(sim.ship.x, sim.ship.y);
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = hexRgbaLift(target.colorA, 0.82);
  ctx.lineWidth = 1.55;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlanetPaths(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (
    sim.phase === "creating" ||
    sim.phase === "crashed" ||
    sim.phase === "title" ||
    sim.phase === "transit"
  )
    return;
  if (Math.hypot(sim.ship.vx, sim.ship.vy) > 400) return;
  ctx.save();
  ctx.lineWidth = 1.45;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([5, 7]);
  for (const { planet, path } of predictPlanetPaths(sim, 10)) {
    if (path.length < 2) continue;
    if (sim.landedId === planet.id) continue;
    const end = path[path.length - 1]!;
    if (Math.hypot(end.x - planet.x, end.y - planet.y) < 6) continue;
    ctx.beginPath();
    ctx.moveTo(planet.x, planet.y);
    for (const p of path) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = hexRgbaLift(planet.colorA, 0.72);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Accel that maps to a short readable tick. Absolute, not relative to the strongest well. */
const GRAVITY_ARROW_A0 = 0.08;
const GRAVITY_ARROW_K = 28;
const GRAVITY_ARROW_CAP = 80;
const GRAVITY_ARROW_FLOOR = 0.022;
const GRAVITY_ARROW_PAD = 11;

function gravityArrowLength(a: number) {
  if (a < GRAVITY_ARROW_FLOOR) return 0;
  return Math.min(GRAVITY_ARROW_CAP, GRAVITY_ARROW_K * Math.log(1 + a / GRAVITY_ARROW_A0));
}

function parseHex(hex: string) {
  const n = Number.parseInt(hex.trim().replace("#", ""), 16);
  if (!Number.isFinite(n)) return { r: 232, g: 230, b: 224 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexRgba(hex: string, alpha: number) {
  const raw = hex.trim();
  if (raw.startsWith("rgba") || raw.startsWith("rgb")) return raw;
  const { r, g, b } = parseHex(raw);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexRgbaLift(hex: string, alpha: number, lift = 0.42) {
  const { r, g, b } = parseHex(hex);
  const lr = Math.round(r + (236 - r) * lift);
  const lg = Math.round(g + (234 - g) * lift);
  const lb = Math.round(b + (228 - b) * lift);
  return `rgba(${lr}, ${lg}, ${lb}, ${alpha})`;
}

function drawGravityArrows(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (
    sim.phase === "landed" ||
    sim.phase === "crashed" ||
    sim.phase === "creating" ||
    sim.phase === "transit" ||
    sim.landedId ||
    sim.lagrangeLockKey
  )
    return;
  const ship = sim.ship;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const pull of gravityPulls(sim)) {
    const len = gravityArrowLength(pull.a);
    if (len < GRAVITY_ARROW_PAD + 3) continue;
    const mag = Math.hypot(pull.ax, pull.ay) || 1;
    const ux = pull.ax / mag;
    const uy = pull.ay / mag;
    const x0 = ship.x + ux * GRAVITY_ARROW_PAD;
    const y0 = ship.y + uy * GRAVITY_ARROW_PAD;
    const x1 = ship.x + ux * len;
    const y1 = ship.y + uy * len;
    const color = hexRgba(pull.planet.colorA, 0.78);
    const head = Math.min(7.2, Math.max(3.6, (len - GRAVITY_ARROW_PAD) * 0.22));
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head * 0.4, y1 - uy * head * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
    ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function haloOuter(p: Planet) {
  const a = atmoRadius(p);
  if (p.kind === "moon") return p.radius + (a - p.radius) * 0.42;
  if (p.kind === "gas") return a;
  if (p.kind === "star") return p.radius * STAR_ATMO_FACTOR;
  return p.radius + (a - p.radius) * 0.72;
}

function lightDir(p: Planet, star: Planet | null) {
  if (!star || star.id === p.id) return { x: -0.55, y: -0.62 };
  const x = star.x - p.x;
  const y = star.y - p.y;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function occluderAxis(occ: Planet, star: Planet) {
  const dx = occ.x - star.x;
  const dy = occ.y - star.y;
  const sep = Math.hypot(dx, dy) || 1;
  return { ux: dx / sep, uy: dy / sep, sep };
}

function umbraRadius(occ: Planet, star: Planet, along: number, sep: number) {
  return occ.radius - (along * (star.radius - occ.radius)) / sep;
}

function penumbraRadius(occ: Planet, star: Planet, along: number, sep: number) {
  return occ.radius + (along * (star.radius + occ.radius)) / sep;
}

function pointUmbra(x: number, y: number, occ: Planet, star: Planet) {
  if (Math.hypot(x - occ.x, y - occ.y) < occ.radius + 12) return 0;
  const { ux, uy, sep } = occluderAxis(occ, star);
  const rx = x - occ.x;
  const ry = y - occ.y;
  const along = rx * ux + ry * uy;
  if (along < occ.radius * 0.55) return 0;
  const perp = Math.abs(rx * uy - ry * ux);
  const umbra = umbraRadius(occ, star, along, sep);
  if (umbra > 0 && perp <= umbra) return 1;
  const pen = penumbraRadius(occ, star, along, sep);
  const inner = Math.max(0, umbra);
  if (perp >= pen || pen <= inner) return 0;
  return 1 - (perp - inner) / (pen - inner);
}

function pointUmbraMax(
  x: number,
  y: number,
  bodies: Planet[],
  star: Planet,
  skipId: string | null,
) {
  let m = 0;
  for (const o of bodies) {
    if (o.kind === "star" || o.id === skipId || isGhostBody(o) || o.radius <= 0) continue;
    m = Math.max(m, pointUmbra(x, y, o, star));
    if (m >= 1) return 1;
  }
  return m;
}

function stampBodyShadows(
  ctx: CanvasRenderingContext2D,
  p: Planet,
  star: Planet,
  bodies: Planet[],
) {
  const L = lightDir(p, star);
  const lit = Math.atan2(L.y, L.x);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(0, 0, p.radius + 2, lit - Math.PI / 2, lit + Math.PI / 2);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.clip();

  for (const o of bodies) {
    if (o.id === p.id || o.kind === "star" || isGhostBody(o) || o.radius <= 0) continue;
    if (Math.hypot(p.x - o.x, p.y - o.y) < o.radius + p.radius * 0.12) continue;
    const { ux, uy, sep } = occluderAxis(o, star);
    const rx = p.x - o.x;
    const ry = p.y - o.y;
    const along = rx * ux + ry * uy;
    if (along < o.radius * 0.45) continue;

    const umbra = umbraRadius(o, star, along, sep);
    const occAng = o.radius / Math.max(along, 1);
    const starAng = star.radius / Math.max(sep + along, 1);
    const peak = umbra > 0 ? 1 : Math.min(1, (occAng / Math.max(starAng, 1e-6)) ** 2);
    if (peak < 0.08) continue;

    const core = umbra > 0 ? umbra : o.radius * Math.sqrt(peak);
    const radius = Math.max(2.5, core * (umbra > 0 ? 1.4 : 1.55));
    const push = p.radius * 0.3;
    const cx = o.x + ux * along - p.x + L.x * push;
    const cy = o.y + uy * along - p.y + L.y * push;
    if (Math.hypot(cx, cy) > p.radius + radius) continue;

    const night = p.kind === "moon" ? 0.9 : p.kind === "gas" ? 0.78 : 0.84;
    const alpha = Math.min(night * 0.58, 0.5) * (0.4 + 0.6 * peak);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const coreT = Math.min(0.78, Math.max(0, umbra) / radius);
    if (umbra > 0 && peak > 0.85 && coreT > 0.08) {
      g.addColorStop(0, `rgba(7,8,12,${alpha})`);
      g.addColorStop(coreT, `rgba(7,8,12,${alpha * 0.9})`);
      g.addColorStop(1, "rgba(7,8,12,0)");
    } else {
      g.addColorStop(0, `rgba(7,8,12,${alpha})`);
      g.addColorStop(1, "rgba(7,8,12,0)");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dust and chips only. Named rocks stay in `planets`; these never enter physics. */
function drawBelts(ctx: CanvasRenderingContext2D, sim: Sim) {
  const bands = beltBands(sim.planets);
  if (!bands.length) return;
  const cam = sim.camera;
  const z = Math.max(1e-6, cam.zoom);
  const hx = ((sim.viewCssW || 1280) * 0.5) / z + 64 / z;
  const hy = ((sim.viewCssH || 800) * 0.5) / z + 64 / z;
  const byId = new Map(sim.planets.map((p) => [p.id, p]));
  ctx.save();
  for (const belt of bands) {
    const parent = byId.get(belt.parentId);
    const px = parent?.x ?? 0;
    const py = parent?.y ?? 0;
    const phase = beltPhase(sim.planets, belt.parentId);
    const n = belt.motes;
    for (let i = 0; i < n; i++) {
      const m = moteAt(belt, px, py, phase, i);
      if (m.sz * z < 0.3) continue;
      if (Math.abs(m.x - cam.x) > hx || Math.abs(m.y - cam.y) > hy) continue;
      ctx.globalAlpha = m.u < 0.58 ? 0.14 + m.v * 0.16 : 0.2 + m.v * 0.24;
      ctx.fillStyle = m.u > 0.9 ? "#b08a70" : m.u > 0.76 ? "#8a7a6a" : "#eceae4";
      ctx.beginPath();
      if (m.sz < 2.4) {
        ctx.arc(m.x, m.y, m.sz, 0, Math.PI * 2);
      } else {
        const k = 5;
        for (let j = 0; j < k; j++) {
          const ang = (j / k) * Math.PI * 2 + hash(i * 9.1 + j) * 0.6;
          const rChip = m.sz * (0.62 + hash(i * 4.4 + j * 3) * 0.55);
          const mx = m.x + Math.cos(ang) * rChip;
          const my = m.y + Math.sin(ang) * rChip;
          if (j === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        }
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function traceAsteroid(ctx: CanvasRenderingContext2D, p: Planet) {
  const pts = asteroidWorldPath(p);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]!;
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
}

const MINE_STEEL = "#8a847c";
const MINE_WRECK = "#5a5550";
const MINE_NIGHT = "#f0c878";
const MINE_PAD = "#ffe8b0";

function drawMineBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cam: Camera,
  on: boolean,
  kind: "beacon" | "flicker" | "off",
) {
  const z = Math.max(0.08, cam.zoom);
  const core = Math.max(1.35, 2.5 / z);
  const dim = kind !== "beacon";
  ctx.fillStyle = dim ? "#241614" : "#3a1612";
  ctx.beginPath();
  ctx.arc(x, y, core * 1.25, 0, Math.PI * 2);
  ctx.fill();
  if (!on || kind === "off") {
    ctx.fillStyle = "rgba(22, 8, 6, 0.94)";
    ctx.beginPath();
    ctx.arc(x, y, core * 0.62, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = core * (dim ? 3.4 : 8);
  const g = ctx.createRadialGradient(x, y, core * 0.12, x, y, halo);
  if (dim) {
    g.addColorStop(0, "rgba(180, 40, 28, 0.55)");
    g.addColorStop(0.28, "rgba(140, 16, 10, 0.18)");
    g.addColorStop(1, "rgba(60, 0, 0, 0)");
  } else {
    g.addColorStop(0, "rgba(255, 244, 238, 1)");
    g.addColorStop(0.1, "rgba(255, 86, 58, 0.95)");
    g.addColorStop(0.32, "rgba(220, 16, 12, 0.4)");
    g.addColorStop(0.65, "rgba(160, 0, 0, 0.12)");
    g.addColorStop(1, "rgba(80, 0, 0, 0)");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, Math.PI * 2);
  ctx.fill();
  if (!dim) {
    ctx.fillStyle = "#fff8f4";
    ctx.beginPath();
    ctx.arc(x, y, core * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAsteroidMine(
  ctx: CanvasRenderingContext2D,
  p: Planet,
  cam: Camera,
  star: Planet | null,
  now: number,
  reducedMotion: boolean,
) {
  const mine = asteroidMine(p);
  if (!mine) return;
  const pad = p.padAngle ?? 0;
  const lw = Math.max(1.05, 1.55 / Math.max(0.08, cam.zoom));
  const far = p.radius * cam.zoom < 7;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotate);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (mine.padLights && !far) {
    ctx.fillStyle = MINE_PAD;
    for (const d of [-0.14, 0.14]) {
      const a = pad + d;
      const sr = surfaceRadius(p, p.rotate + a);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * sr, Math.sin(a) * sr, Math.max(1.1, 2.1 / cam.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  mine.towers.forEach((t) => {
    const a = pad + t.dPad;
    const sr = surfaceRadius(p, p.rotate + a);
    const h = p.radius * 0.44;
    const base = p.radius * 0.13;
    const crown = p.radius * 0.03;
    const drill = p.radius * 0.1;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(sr, 0);
    ctx.strokeStyle = t.beacon === "beacon" ? MINE_STEEL : MINE_WRECK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(0, -base);
    ctx.lineTo(h, -crown);
    ctx.lineTo(h, crown);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    const mid = base * 0.55;
    ctx.moveTo(h * 0.38, -mid);
    ctx.lineTo(h * 0.38, mid);
    ctx.moveTo(h * 0.68, -crown * 2.2);
    ctx.lineTo(h * 0.68, crown * 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-drill, 0);
    ctx.lineTo(h * 0.12, 0);
    ctx.stroke();
    const phase = hash(p.shapeSeed ?? 0) * MINE_BEACON_PERIOD_MS;
    const on = mineBeaconLit(now, reducedMotion, phase, t.beacon);
    drawMineBeacon(ctx, h, 0, cam, on, t.beacon);
    ctx.restore();
  });
  ctx.restore();

  if (p.settlement !== "active" || p.radius * cam.zoom < 18) return;
  const L = lightDir(p, star);
  ctx.save();
  traceAsteroid(ctx, p);
  ctx.clip();
  ctx.fillStyle = MINE_NIGHT;
  for (let i = 0; i < 3; i++) {
    const a = hash((p.shapeSeed ?? 0) * 1.7 + i * 5.3) * Math.PI * 2;
    const rr = surfaceRadius(p, p.rotate + a) * (0.72 + hash(i * 2.9) * 0.18);
    const lx = Math.cos(p.rotate + a);
    const ly = Math.sin(p.rotate + a);
    if (lx * L.x + ly * L.y > -0.12) continue;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(p.x + lx * rr, p.y + ly * rr, Math.max(0.9, 1.6 / cam.zoom), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawAsteroid(
  ctx: CanvasRenderingContext2D,
  p: Planet,
  cam: Camera,
  star: Planet | null,
  now: number,
  reducedMotion: boolean,
) {
  const r = p.radius;
  const waste = p.settlement === "abandoned";
  ctx.fillStyle = p.colorA;
  traceAsteroid(ctx, p);
  ctx.fill();
  if (waste) {
    ctx.fillStyle = "rgba(10, 9, 8, 0.34)";
    traceAsteroid(ctx, p);
    ctx.fill();
  }

  ctx.save();
  traceAsteroid(ctx, p);
  ctx.clip();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotate);
  ctx.fillStyle = waste ? "#1a1612" : p.colorB;
  const n = waste ? 18 : 7;
  for (let i = 0; i < n; i++) {
    const a = hash(i * 3.1 + (p.shapeSeed ?? 0)) * Math.PI * 2;
    const cr = Math.sqrt(hash(i * 7.7 + p.mass)) * r * (waste ? 0.86 : 0.72);
    const s = r * (0.04 + hash(i * 2.2) * (waste ? 0.18 : 0.12));
    ctx.globalAlpha = waste ? 0.55 + hash(i * 5.9) * 0.3 : 0.4 + hash(i * 5.9) * 0.22;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * cr, Math.sin(a) * cr, s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (waste) {
    ctx.fillStyle = "#0e0c0a";
    ctx.strokeStyle = "rgba(6, 5, 4, 0.65)";
    ctx.lineWidth = Math.max(0.8, 1.2 / Math.max(0.08, cam.zoom));
    for (let i = 0; i < 6; i++) {
      const a = hash(i * 11.3 + (p.shapeSeed ?? 0) * 2.1) * Math.PI * 2;
      const cr = (0.22 + hash(i * 4.8) * 0.55) * r;
      const s = r * (0.08 + hash(i * 6.2) * 0.14);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * cr, Math.sin(a) * cr, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  traceAsteroid(ctx, p);
  ctx.clip();
  const L = lightDir(p, star);
  const shade = ctx.createLinearGradient(
    p.x - L.x * r,
    p.y - L.y * r,
    p.x + L.x * r,
    p.y + L.y * r,
  );
  shade.addColorStop(0, "rgba(7,8,12,0.88)");
  shade.addColorStop(0.44, "rgba(7,8,12,0.5)");
  shade.addColorStop(0.52, "rgba(7,8,12,0.16)");
  shade.addColorStop(0.6, "rgba(7,8,12,0)");
  shade.addColorStop(1, "rgba(7,8,12,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(p.x - r * 1.4, p.y - r * 1.4, r * 2.8, r * 2.8);
  ctx.restore();

  drawAsteroidMine(ctx, p, cam, star, now, reducedMotion);

  if (p.landable || cam.zoom >= 0.45) {
    ctx.save();
    ctx.translate(p.x + r + 12 / cam.zoom, p.y);
    ctx.scale(1 / cam.zoom, 1 / cam.zoom);
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = "rgba(236, 234, 228, 0.55)";
    ctx.textBaseline = "middle";
    ctx.fillText(p.name, 0, 0);
    ctx.restore();
  }
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  p: Planet,
  cam: Camera,
  star: Planet | null,
  bodies: Planet[],
  now: number,
  reducedMotion: boolean,
) {
  if (p.kind === "asteroid") {
    drawAsteroid(ctx, p, cam, star, now, reducedMotion);
    return;
  }
  const r = p.radius;
  const outer = haloOuter(p);
  if (p.kind !== "star") {
    const halo = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, outer);
    halo.addColorStop(0, p.atmo);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = p.colorA;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  if (p.kind === "gas" && p.bands) {
    const steps = 28;
    p.bands.forEach((c, i) => {
      const mid = -r + ((i + 0.5) / p.bands!.length) * r * 2;
      const h = r * 0.26;
      const amp = r * 0.04;
      const freq = 2.4 + i * 0.35;
      const phase = p.rotate * (1.15 + i * 0.12) + i * 0.9;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const x = -r + (2 * r * s) / steps;
        const y = mid - h / 2 + Math.sin((x / r) * freq + phase) * amp;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let s = steps; s >= 0; s--) {
        const x = -r + (2 * r * s) / steps;
        const y = mid + h / 2 + Math.sin((x / r) * freq + phase + 0.6) * amp * 0.7;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  } else if (p.kind !== "star") {
    ctx.rotate(p.rotate);
    ctx.fillStyle = p.colorB;
    const n = p.kind === "moon" ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = hash(i * 3.1 + p.radius) * Math.PI * 2;
      const cr = Math.sqrt(hash(i * 7.7 + p.mass)) * r * 0.78;
      const s = r * (0.035 + hash(i * 2.2) * 0.11);
      ctx.globalAlpha = 0.42 + hash(i * 5.9) * 0.2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * cr, Math.sin(a) * cr, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (p.kind === "star") {
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    core.addColorStop(0, p.colorA);
    core.addColorStop(0.5, hexRgba(p.colorA, 0.85));
    core.addColorStop(1, p.colorB);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const L = lightDir(p, star);
    const night = p.kind === "moon" ? 0.9 : p.kind === "gas" ? 0.78 : 0.84;
    const shade = ctx.createLinearGradient(-L.x * r, -L.y * r, L.x * r, L.y * r);
    shade.addColorStop(0, `rgba(7,8,12,${night})`);
    shade.addColorStop(0.44, `rgba(7,8,12,${night * 0.55})`);
    shade.addColorStop(0.5, "rgba(7,8,12,0.18)");
    shade.addColorStop(0.58, "rgba(7,8,12,0)");
    shade.addColorStop(1, "rgba(7,8,12,0)");
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.fill();
    if (star) stampBodyShadows(ctx, p, star, bodies);
  }

  ctx.restore();

  ctx.save();
  ctx.translate(p.x + r + 12 / cam.zoom, p.y);
  ctx.scale(1 / cam.zoom, 1 / cam.zoom);
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "rgba(236, 234, 228, 0.55)";
  ctx.textBaseline = "middle";
  ctx.fillText(p.name, 0, 0);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    if (!p.alive) continue;
    const t = p.life / p.max;
    ctx.globalAlpha = t * 0.85;
    ctx.fillStyle = `hsl(${p.hue} 80% 70%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function flameTri(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfW: number,
  fill: string,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * halfW;
  const py = (dx / len) * halfW;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x0 + px, y0 + py);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0 - px, y0 - py);
  ctx.closePath();
  ctx.fill();
}

function drawHullFire(
  ctx: CanvasRenderingContext2D,
  reducedMotion: boolean,
  layer: "back" | "front",
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const now = performance.now();
  const flick = reducedMotion ? 1 : 0.78 + hash(now * 0.017) * 0.45;
  const flick2 = reducedMotion ? 1 : 0.72 + hash(now * 0.029 + 3.1) * 0.5;
  const flick3 = reducedMotion ? 1 : 0.8 + hash(now * 0.023 + 7.4) * 0.4;

  if (layer === "back") {
    const g = ctx.createRadialGradient(0, 2, 1.5, 0, 3, 26 * flick);
    g.addColorStop(0, `rgba(255, 210, 130, ${0.62 * flick})`);
    g.addColorStop(0.32, `rgba(255, 110, 45, ${0.32 * flick})`);
    g.addColorStop(1, "rgba(255, 40, 10, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 2, 26 * flick, 0, Math.PI * 2);
    ctx.fill();

    flameTri(ctx, 0, 7, 0, 19 + flick * 9, 5.8, `rgba(255, 95, 40, ${0.5 * flick})`);
    flameTri(ctx, -6.2, 5, -12 - flick * 3, 15 + flick * 5, 3.4, `rgba(255, 110, 50, ${0.4 * flick2})`);
    flameTri(ctx, 6.2, 5, 12 + flick2 * 3, 15 + flick2 * 5, 3.4, `rgba(255, 110, 50, ${0.4 * flick})`);
    if (!reducedMotion) {
      flameTri(
        ctx,
        0,
        -7,
        (hash(now * 0.02) - 0.5) * 5,
        -19 - flick3 * 5,
        2.5,
        `rgba(255, 130, 60, ${0.32 * flick3})`,
      );
    }
  } else {
    flameTri(ctx, 0, 6.5, 0, 14 + flick2 * 6, 2.5, `rgba(255, 230, 170, ${0.72 * flick2})`);
    flameTri(ctx, -5.4, 4.5, -9 - flick * 2, 11 + flick * 3, 1.7, `rgba(255, 220, 150, ${0.55 * flick})`);
    flameTri(ctx, 5.4, 4.5, 9 + flick2 * 2, 11 + flick2 * 3, 1.7, `rgba(255, 220, 150, ${0.55 * flick2})`);
    if (!reducedMotion) {
      const sparks = 3;
      for (let i = 0; i < sparks; i++) {
        const a = hash(now * 0.008 + i * 5.2);
        const r = 6 + a * 10;
        const ang = (hash(i * 9.1 + now * 0.004) - 0.5) * Math.PI;
        ctx.fillStyle = `rgba(255, ${180 + Math.round(a * 50)}, 90, ${0.45 + a * 0.3})`;
        ctx.beginPath();
        ctx.arc(
          Math.sin(ang) * r * 0.45,
          4 + Math.cos(ang) * r * 0.35,
          0.7 + a * 1.1,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function pathPoly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]) {
  const first = pts[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
}

function drawWreck(ctx: CanvasRenderingContext2D, seed: number, umbra: number) {
  const dim = 1 - 0.72 * Math.max(0, Math.min(1, umbra));
  const fill = `rgb(${Math.round(198 * dim)}, ${Math.round(192 * dim)}, ${Math.round(184 * dim)})`;
  ctx.fillStyle = "rgba(7,8,12,0.32)";
  ctx.beginPath();
  ctx.ellipse(0.5, 5, 12, 5.2, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#07080c";
  ctx.lineWidth = 1.3;
  const pieces: {
    pts: readonly (readonly [number, number])[];
    ox: number;
    oy: number;
    rot: number;
    canopy?: boolean;
  }[] = [
    { pts: [[0, -13], [4.4, 1.2], [-4.4, 1.2]], ox: -2.4, oy: -3.6, rot: -0.4 },
    {
      pts: [
        [-8.5, 10],
        [0, 6],
        [-1.4, 3.2],
        [-6.2, 9.2],
      ],
      ox: -5.8,
      oy: 3.4,
      rot: -0.7,
    },
    {
      pts: [
        [8.5, 10],
        [0, 6],
        [1.4, 3.2],
        [6.2, 9.2],
      ],
      ox: 6.4,
      oy: 2.6,
      rot: 0.58,
    },
    { pts: [[0, -6], [3.2, 2], [-3.2, 2]], ox: 1.8, oy: 5.8, rot: 0.92, canopy: true },
  ];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const jx = (hash(seed + i * 3.1) - 0.5) * 3.2;
    const jy = (hash(seed + i * 7.7) - 0.5) * 3.2;
    const jr = (hash(seed + i * 11.3) - 0.5) * 0.28;
    ctx.save();
    ctx.translate(piece.ox + jx, piece.oy + jy);
    ctx.rotate(piece.rot + jr);
    pathPoly(ctx, piece.pts);
    ctx.fillStyle = piece.canopy ? "#12141a" : fill;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function warpGasPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rad: number,
  seed: number,
  age: number,
  scale = 1,
) {
  const n = 32;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wobble =
      1 +
      0.16 * Math.sin(t * 3 + seed + age * 1.4) +
      0.1 * Math.sin(t * 5 - seed * 1.7 + age * 2.2) +
      0.06 * Math.sin(t * 9 + seed * 0.5 - age * 0.8);
    const rr = rad * scale * wobble;
    const px = x + Math.cos(t) * rr;
    const py = y + Math.sin(t) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawWarpAims(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  if (sim.phase !== "flight" || sim.nearby.length === 0) return;
  if (Math.hypot(sim.ship.vx, sim.ship.vy) < WARP_BAR_SPEED && sim.status !== "warp") return;
  const dir = { x: sim.ship.vx, y: sim.ship.vy };
  const sp = Math.hypot(dir.x, dir.y) || 1;
  const hx = dir.x / sp;
  const hy = dir.y / sp;
  const locked = lockedNearby(dir.x, dir.y, sim.nearby, WARP_AIM_DEG);
  const origin = worldToScreen(sim.camera, sim.ship.x, sim.ship.y, cssW, cssH);
  const ring = Math.min(cssW, cssH) * 0.42;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(236, 234, 228, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, ring, 0, Math.PI * 2);
  ctx.stroke();

  const hd = { x: origin.x + hx * ring, y: origin.y + hy * ring };
  ctx.fillStyle = "rgba(236, 234, 228, 0.92)";
  ctx.strokeStyle = "rgba(236, 234, 228, 0.92)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(hd.x + hx * 6, hd.y + hy * 6);
  ctx.lineTo(hd.x - hx * 4 + hy * 4.2, hd.y - hy * 4 - hx * 4.2);
  ctx.lineTo(hd.x - hx * 4 - hy * 4.2, hd.y - hy * 4 + hx * 4.2);
  ctx.closePath();
  ctx.stroke();

  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
  for (const n of sim.nearby) {
    const v = headingVec(n.angle);
    const x = origin.x + v.x * ring;
    const y = origin.y + v.y * ring;
    const on = n === locked;
    const col = on ? "#7d9b86" : "#c45c4a";
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.rect(x - 3.5, y - 3.5, 7, 7);
    ctx.stroke();
    if (on) {
      ctx.beginPath();
      ctx.rect(x - 1.5, y - 1.5, 3, 3);
      ctx.fill();
    }
    const lx = x + v.x * 14;
    const ly = y + v.y * 14;
    ctx.fillStyle = col;
    ctx.globalAlpha = on ? 0.92 : 0.72;
    ctx.textAlign = v.x >= 0.2 ? "left" : v.x <= -0.2 ? "right" : "center";
    ctx.textBaseline = v.y >= 0.35 ? "top" : v.y <= -0.35 ? "bottom" : "middle";
    ctx.fillText(n.name, lx, ly);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawIonTrail(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (sim.ionTrail.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const byId = new Map(sim.planets.map((p) => [p.id, p]));
  for (const w of sim.ionTrail) {
    const host = byId.get(w.hostId);
    if (!host) continue;
    const u = Math.min(1, w.age / w.life);
    const fade = (1 - u) * (1 - u);
    const a = fade * (0.035 * w.glow + 0.16 * w.glow * w.glow);
    if (a < 0.01) continue;
    const x = host.x + w.ox;
    const y = host.y + w.oy;
    const len = 5.5 + w.glow * 11;
    ctx.strokeStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${a})`;
    ctx.lineWidth = 0.5 + w.glow * 1.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - w.ux * len, y - w.uy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWarpRings(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (sim.warpRings.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const ring of sim.warpRings) {
    const u = Math.min(1, ring.age / ring.life);
    const fade = (1 - u) * (1 - u);
    const hot = Math.max(0, 1 - u / 0.28);
    const launch = ring.kind === "launch";
    const r = launch
      ? Math.round(255 * hot + 214 * (1 - hot))
      : Math.round(255 * hot + 70 * (1 - hot));
    const gch = launch
      ? Math.round(196 * hot + 52 * (1 - hot))
      : Math.round(252 * hot + 160 * (1 - hot));
    const b = launch
      ? Math.round(72 * hot + 16 * (1 - hot))
      : Math.round(245 * hot + 255 * (1 - hot));
    const flash = launch ? 0.22 * hot : 0.55 * hot;
    const rad = launch ? 14 + u * 250 : 22 + u * 560;
    const ox = (hash(ring.seed * 1.3) - 0.5) * rad * 0.08;
    const oy = (hash(ring.seed * 2.1) - 0.5) * rad * 0.08;
    const cx = ring.x + ox;
    const cy = ring.y + oy;
    const core = launch ? 0.04 + flash * 0.22 : 0.05 + flash * 0.7;
    const mid = launch ? 0.06 + flash * 0.14 : 0.08 + flash * 0.25;
    const rim = launch ? 0.38 + flash * 0.55 : 0.4 + flash;
    const grad = ctx.createRadialGradient(cx, cy, rad * 0.12, cx, cy, rad * 1.12);
    grad.addColorStop(0, `rgba(${r}, ${gch}, ${b}, ${core * fade})`);
    grad.addColorStop(0.58, `rgba(${r}, ${gch}, ${b}, ${mid * fade})`);
    grad.addColorStop(0.84, `rgba(${r}, ${gch}, ${b}, ${rim * fade})`);
    grad.addColorStop(1, `rgba(${r}, ${gch}, ${b}, 0)`);
    ctx.fillStyle = grad;
    warpGasPath(ctx, cx, cy, rad, ring.seed, ring.age, 1);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r}, ${gch}, ${b}, ${(launch ? 0.82 : 0.72 + flash) * fade})`;
    ctx.lineWidth = launch ? 3.5 + 8 * (1 - u) : 6 + 16 * (1 - u);
    warpGasPath(ctx, cx, cy, rad, ring.seed, ring.age, 0.94);
    ctx.stroke();
    ctx.strokeStyle = launch
      ? `rgba(255, 214, 120, ${(0.22 + flash * 0.35) * fade})`
      : `rgba(255, 252, 248, ${(0.18 + flash * 0.45) * fade})`;
    ctx.lineWidth = launch ? 1.4 + 2 * hot : 2 + 3 * hot;
    warpGasPath(ctx, cx, cy, rad, ring.seed + 2.2, ring.age * 1.15, 0.68);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShipLightRay(ctx: CanvasRenderingContext2D, sim: Sim) {
  const ux = sim.transitDirX;
  const uy = sim.transitDirY;
  const x = sim.ship.x;
  const y = sim.ship.y;
  const zoom = Math.max(0.12, sim.camera.zoom);
  const full = Math.max(sim.viewCssW, sim.viewCssH) * 0.62 / zoom;
  const grow = sim.transitPunched ? 1 : Math.min(1, 0.12 + sim.transitAge / 0.28);
  const len = full * grow;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 220, 170, 0.18)";
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(x - ux * len, y - uy * len);
  ctx.lineTo(x + ux * 24, y + uy * 24);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 244, 220, 0.55)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x - ux * len * 0.82, y - uy * len * 0.82);
  ctx.lineTo(x + ux * 14, y + uy * 14);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 252, 245, 0.95)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - ux * len * 0.5, y - uy * len * 0.5);
  ctx.lineTo(x + ux * 8, y + uy * 8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 252, 245, 0.98)";
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function arrivalFlashAmount(sim: Sim) {
  if (sim.phase !== "transit" || !sim.transitBoomed) return 0;
  const boomAt = transitBoomAt(sim.reducedMotion);
  const t = sim.transitAge - boomAt;
  if (t < 0) return 0;
  if (t < WARP_FLASH) return 1 - t * 0.25;
  return Math.max(0, 1 - (t - WARP_FLASH) / 0.2);
}

function drawArrivalFlash(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  const amt = arrivalFlashAmount(sim);
  if (amt < 0.02) return;
  const p = worldToScreen(sim.camera, sim.ship.x, sim.ship.y, cssW, cssH);
  const r = Math.max(cssW, cssH) * (0.2 + amt * 0.5);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 7; i++) {
    const hx = hash(i * 4.17 + sim.transitBoomN * 3.1);
    const hy = hash(i * 7.9 + 1.4);
    const cx = p.x + (hx - 0.5) * r * 0.42;
    const cy = p.y + (hy - 0.5) * r * 0.42;
    const rx = r * (0.18 + hash(i * 2.6) * 0.5);
    const ry = rx * (0.45 + hash(i * 5.3) * 0.55);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((hash(i * 9.2) - 0.5) * Math.PI);
    ctx.scale(1, Math.max(0.35, ry / rx));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(255, 252, 245, ${0.42 * amt})`);
    g.addColorStop(0.35, `rgba(255, 236, 210, ${0.16 * amt})`);
    g.addColorStop(1, "rgba(236, 234, 228, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, sim: Sim, umbra = 0) {
  if ((sim.phase === "transit" || sim.warpLost) && !sim.transitBoomed) {
    drawShipLightRay(ctx, sim);
    return;
  }
  const ship = sim.ship;
  const crash = sim.phase === "crashed" ? sim.crashKind : null;
  const alpha = sinkAlpha(sim);
  if (alpha <= 0.02) return;
  const burned = crash === "burn";
  const reducedMotion = sim.reducedMotion;
  const thrusting = sim.phase !== "title" && ship.thrusting && !crash;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(-ship.yaw);
  if (alpha < 1) {
    ctx.globalAlpha *= alpha;
    const t = 1 - alpha;
    const s = 1 - 0.38 * t;
    ctx.scale(s, s);
  }

  if (crash === "wreck") {
    drawWreck(ctx, sim.wreckSeed, umbra);
    ctx.restore();
    return;
  }

  if (burned) drawHullFire(ctx, reducedMotion, "back");

  if (thrusting) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flicker = 0.75 + Math.random() * 0.35;
    ctx.fillStyle = `rgba(255, 210, 140, ${0.55 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(-4.5, 8);
    ctx.lineTo(0, 16 + flicker * 8);
    ctx.lineTo(4.5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 240, ${0.7 * flicker})`;
    ctx.beginPath();
    ctx.moveTo(-2, 8);
    ctx.lineTo(0, 13 + flicker * 4);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (burned) {
    ctx.fillStyle = "rgb(46, 34, 30)";
  } else {
    const dim = 1 - 0.72 * Math.max(0, Math.min(1, umbra));
    ctx.fillStyle = `rgb(${Math.round(236 * dim)}, ${Math.round(234 * dim)}, ${Math.round(228 * dim)})`;
  }
  ctx.strokeStyle = "#07080c";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(8.5, 10);
  ctx.lineTo(0, 6);
  ctx.lineTo(-8.5, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = burned ? "rgba(255, 140, 70, 0.78)" : "#12141a";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(3.2, 2);
  ctx.lineTo(-3.2, 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(7,8,12,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8.5, 10);
  ctx.lineTo(-4, 6);
  ctx.moveTo(8.5, 10);
  ctx.lineTo(4, 6);
  ctx.stroke();

  if (burned) drawHullFire(ctx, reducedMotion, "front");

  ctx.restore();
}

const LOCK_PIPS = 8;
const LOCK_PIP_W = 6;
const LOCK_PIP_H = 8;
const LOCK_PIP_GAP = 2;
const LOCK_BAR_PAD = 2;
const LOCK_BAR_W = LOCK_BAR_PAD * 2 + LOCK_PIPS * LOCK_PIP_W + (LOCK_PIPS - 1) * LOCK_PIP_GAP;
const LOCK_BAR_H = LOCK_BAR_PAD * 2 + LOCK_PIP_H;
const LOCK_BAR_CAUTION = 0.55;
const LOCK_BAR_WARN = 0.28;
const LOCK_LABEL_GAP = 4;
const LOCK_LABEL_PAD_X = 3;
const LOCK_LABEL_IDLE = "rgba(138, 141, 150, 0.78)";

function lockBarColor(remaining: number, healthy: string) {
  if (remaining > LOCK_BAR_CAUTION) return healthy;
  if (remaining > LOCK_BAR_WARN) return "#c4a05a";
  return "#c45c4a";
}

function lockLabelColor(remaining: number, charge = false) {
  if (charge) {
    if (remaining < 0.45) return LOCK_LABEL_IDLE;
    if (remaining < 0.72) return "#c4a05a";
    return "#c45c4a";
  }
  if (remaining > LOCK_BAR_CAUTION) return LOCK_LABEL_IDLE;
  if (remaining > LOCK_BAR_WARN) return "#c4a05a";
  return "#c45c4a";
}

function warpPipColor(index: number, pips: number) {
  const t = (index + 1) / pips;
  if (t < 0.45) return "#8a8d96";
  if (t < 0.72) return "#c4a05a";
  return "#c45c4a";
}

function drawLockBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  remaining: number,
  healthy: string,
  charge = false,
) {
  const t = Math.max(0, Math.min(1, remaining));
  const filled = Math.round(t * LOCK_PIPS);
  const color = lockBarColor(t, healthy);
  ctx.fillStyle = "#07080c";
  ctx.fillRect(x, y, LOCK_BAR_W, LOCK_BAR_H);
  for (let i = 0; i < LOCK_PIPS; i++) {
    const px = x + LOCK_BAR_PAD + i * (LOCK_PIP_W + LOCK_PIP_GAP);
    const py = y + LOCK_BAR_PAD;
    if (i < filled) {
      ctx.fillStyle = charge ? warpPipColor(i, LOCK_PIPS) : color;
      ctx.fillRect(px, py, LOCK_PIP_W, LOCK_PIP_H);
      ctx.fillStyle = "rgba(236, 234, 228, 0.45)";
      ctx.fillRect(px, py, LOCK_PIP_W, 2);
    } else {
      ctx.fillStyle = "#1a1d24";
      ctx.fillRect(px, py, LOCK_PIP_W, LOCK_PIP_H);
    }
  }
}

function drawLockBarLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  remaining: number,
  label: string,
  charge = false,
) {
  const color = lockLabelColor(remaining, charge);
  ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = x + LOCK_BAR_W + LOCK_LABEL_GAP + LOCK_LABEL_PAD_X;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(7, 8, 12, 0.72)";
  ctx.fillRect(
    x + LOCK_BAR_W + LOCK_LABEL_GAP,
    y,
    Math.ceil(tw + LOCK_LABEL_PAD_X * 2),
    LOCK_BAR_H,
  );
  ctx.fillStyle = color;
  ctx.fillText(label, textX, y + LOCK_BAR_H / 2);
}

function drawShipLockBars(ctx: CanvasRenderingContext2D, sim: Sim, cam: Camera) {
  if (
    sim.phase === "creating" ||
    sim.phase === "title" ||
    sim.phase === "crashed" ||
    sim.phase === "transit"
  )
    return;
  const zoom = Math.max(0.04, cam.zoom);
  ctx.save();
  ctx.translate(sim.ship.x, sim.ship.y);
  ctx.scale(1 / zoom, 1 / zoom);
  const x = -Math.round(LOCK_BAR_W / 2);
  const y = Math.round(13 * zoom + 10);
  if (sim.status === "warp" || sim.warpApproach > 0.04) {
    const t = sim.warpCharge;
    const fade = sim.status === "warp" ? 1 : sim.warpApproach;
    ctx.globalAlpha *= fade;
    drawLockBar(ctx, x, y, t, "#7d9b86", true);
    drawLockBarLabel(ctx, x, y, t, "Warp", true);
    ctx.restore();
    return;
  }
  if (!sim.orbitLockId && !sim.lagrangeLockKey) {
    ctx.restore();
    return;
  }
  const dragLeft = 1 - Math.min(1, atmoDrag(sim) / ORBIT_DRAG_BREAK);
  const gravLeft = 1 - Math.min(1, orbitPerturb(sim) / ORBIT_PERTURB_BREAK);
  const gravY = y + LOCK_BAR_H + 3;
  drawLockBar(ctx, x, y, dragLeft, "#7d9b86");
  drawLockBarLabel(ctx, x, y, dragLeft, "Atmo Lock");
  drawLockBar(ctx, x, gravY, gravLeft, "#b7c0cc");
  drawLockBarLabel(ctx, x, gravY, gravLeft, "Gravity Lock");
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, cssW: number, cssH: number) {
  const g = ctx.createRadialGradient(
    cssW / 2,
    cssH / 2,
    Math.min(cssW, cssH) * 0.35,
    cssW / 2,
    cssH / 2,
    Math.max(cssW, cssH) * 0.72,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(7,8,12,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawLagrangePoints(ctx: CanvasRenderingContext2D, sim: Sim, cam: Camera) {
  if (
    sim.phase === "creating" ||
    sim.phase === "crashed" ||
    sim.phase === "title" ||
    sim.phase === "transit"
  )
    return;
  const showAll = sim.showLagrange;
  const locked = sim.lagrangeLockKey;
  if (!showAll && !locked) return;
  const points = listLagrangePoints(sim);
  if (!points.length) return;
  const zoom = Math.max(0.12, cam.zoom);
  const label = zoom >= 0.28;

  ctx.save();
  for (const pt of points) {
    const isLocked = pt.key === locked;
    if (!showAll && !isLocked) continue;
    const near =
      isLocked || Math.hypot(sim.ship.x - pt.x, sim.ship.y - pt.y) < LAGRANGE_CAPTURE_R * 1.8;
    const ring = isLocked
      ? "rgba(183, 192, 204, 0.55)"
      : near
        ? "rgba(183, 192, 204, 0.34)"
        : "rgba(183, 192, 204, 0.16)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, LAGRANGE_CAPTURE_R, 0, Math.PI * 2);
    if (isLocked) {
      ctx.fillStyle = "rgba(183, 192, 204, 0.08)";
      ctx.fill();
    }
    ctx.strokeStyle = ring;
    ctx.lineWidth = isLocked ? 2.2 : 1.2;
    ctx.setLineDash(isLocked ? [] : [6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const arm = (isLocked ? 6.5 : 5.2) / zoom;
    ctx.strokeStyle = isLocked ? "rgba(236, 234, 228, 0.92)" : "rgba(183, 192, 204, 0.9)";
    ctx.lineWidth = (isLocked ? 1.55 : 1.15) / zoom;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(pt.x - arm, pt.y);
    ctx.lineTo(pt.x + arm, pt.y);
    ctx.moveTo(pt.x, pt.y - arm);
    ctx.lineTo(pt.x, pt.y + arm);
    ctx.stroke();

    if (label) {
      ctx.save();
      ctx.translate(pt.x + 10 / zoom, pt.y - 8 / zoom);
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = isLocked ? "rgba(236, 234, 228, 0.82)" : "rgba(183, 192, 204, 0.62)";
      ctx.textBaseline = "middle";
      ctx.fillText(pt.kind, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

function minimapLayout(cssW: number, cssH: number) {
  const desktop = cssW >= 1024;
  const size = Math.min(desktop ? 184 : 132, Math.max(96, cssW * 0.16));
  const pad = desktop ? 24 : 16;
  const x = cssW - size - pad;
  const y = cssH - size - pad - 8;
  return { desktop, size, pad, x, y };
}

function spectroLayout(cssW: number, cssH: number) {
  const map = minimapLayout(cssW, cssH);
  const gap = 8;
  if (!map.desktop) {
    const legendW = 148;
    const maxW = map.x - gap - (map.pad + legendW);
    const w = Math.max(72, Math.min(map.size, maxW));
    return { x: map.x - gap - w, y: map.y, w, h: map.size };
  }
  const w = map.size;
  const h = Math.round(map.size * 0.72);
  return { x: map.x, y: Math.max(map.pad, map.y - h - gap), w, h };
}

function spectroProgress(sim: Sim, body: Planet | null) {
  if (!body) return 0;
  if (sim.scannedIds.has(body.id)) return 1;
  if (sim.spectroScanId === body.id) {
    return Math.max(0, Math.min(1, sim.spectroScanT / SCAN_SECONDS));
  }
  return 0;
}

function peakReveal(progress: number, mz: number) {
  const u = progress * 1.14 - mz / MZ_MAX;
  const x = Math.max(0, Math.min(1, u / 0.2));
  return x * x * (3 - 2 * x);
}

function drawSpectrograph(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  const { x, y, w, h } = spectroLayout(cssW, cssH);
  const body = spectroFocus(sim);
  const progress = spectroProgress(sim, body);
  const now = performance.now();
  const noiseAmp = sim.reducedMotion ? 0.06 * (1 - progress) : 0.16 * (1 - progress * 0.85);
  // Old CRT scopes never sit perfectly steady: a slow, tiny brightness waver.
  const flicker = sim.reducedMotion
    ? 1
    : 0.95 + 0.05 * (0.5 + 0.5 * Math.sin(now * 0.011) * Math.sin(now * 0.0037 + 1.7));

  // CRT power envelopes. vx/vy squash the picture like beam deflection dying:
  // on = dot -> line -> full raster, off = raster -> line -> lingering dot.
  const c01 = (v: number) => Math.max(0, Math.min(1, v));
  const easeOut = (u: number) => 1 - (1 - u) ** 3;
  const onAge = now - sim.spectroOnAt;
  const offAge = sim.showSpectro ? -1 : now - sim.spectroOffAt;
  let vx = 1;
  let vy = 1;
  let boost = 1;
  let flash = 0;
  let dotA = 0;
  let fade = 1;
  if (!sim.reducedMotion && offAge >= 0) {
    const a = offAge;
    vy = Math.max(0.03, 1 - c01(a / 140) ** 2);
    vx = a <= 140 ? 1 : Math.max(0.02, 1 - c01((a - 140) / 170) ** 2);
    boost = 1 + c01(a / 140) * 1.6;
    dotA = c01((a - 230) / 60) * c01(1 - (a - 300) / 340);
    fade = a < 360 ? 1 : c01(1 - (a - 360) / 290);
    if (fade <= 0.01) return;
  } else if (!sim.reducedMotion && onAge >= 0 && onAge < 480) {
    const a = onAge;
    vx = a < 60 ? 0.02 : Math.max(0.02, easeOut(c01((a - 60) / 140)));
    vy = a < 190 ? 0.03 : Math.max(0.03, easeOut(c01((a - 190) / 250)));
    flash = a < 90 ? c01(a / 90) : c01(1 - (a - 90) / 320);
    boost = 1 + c01(1 - a / 480) * 1.2;
    dotA = a < 130 ? c01(1 - a / 130) * 0.9 : 0;
  }
  const lineA = c01((0.4 - vy) / 0.37) * c01((vx - 0.02) * 3);

  ctx.save();
  ctx.globalAlpha = 0.94 * fade;

  // Instrument casing around the tube.
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "rgba(22, 23, 22, 0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(236, 234, 228, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const padL = 10;
  const padR = 10;
  const padT = 22;
  const padB = 22;
  const innerX = x + padL;
  const innerY = y + padT;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const baseY = innerY + innerH;

  // CRT glass inset.
  const gx = x + 4;
  const gy = y + 4;
  const gw = w - 8;
  const gh = h - 8;
  const cgx = gx + gw / 2;
  const cgy = gy + gh / 2;

  ctx.save();
  roundRect(ctx, gx, gy, gw, gh, 9);
  ctx.clip();

  // Tube: near-black with a whisper of green, brighter toward the middle.
  ctx.fillStyle = "rgb(6, 14, 9)";
  ctx.fillRect(gx, gy, gw, gh);

  // Everything emitted by the beam collapses with the deflection field.
  ctx.save();
  ctx.translate(cgx, cgy);
  ctx.scale(Math.max(0.002, vx), Math.max(0.002, vy));
  ctx.translate(-cgx, -cgy);

  const tubeGlow = ctx.createRadialGradient(cgx, cgy, 4, cgx, cgy, Math.max(gw, gh) * 0.62);
  tubeGlow.addColorStop(0, "rgba(92, 190, 122, 0.09)");
  tubeGlow.addColorStop(1, "rgba(92, 190, 122, 0)");
  ctx.fillStyle = tubeGlow;
  ctx.fillRect(gx, gy, gw, gh);

  // Graticule, etched in the same dull phosphor green.
  ctx.strokeStyle = "rgba(112, 200, 142, 0.1)";
  ctx.lineWidth = 1;
  for (const tick of [0, 25, 50, 75, 100]) {
    const tx = innerX + (tick / MZ_MAX) * innerW;
    ctx.beginPath();
    ctx.moveTo(tx, innerY);
    ctx.lineTo(tx, baseY);
    ctx.stroke();
  }
  for (const f of [0.25, 0.5, 0.75]) {
    const ty = baseY - innerH * f;
    ctx.beginPath();
    ctx.moveTo(innerX, ty);
    ctx.lineTo(innerX + innerW, ty);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.strokeStyle = "rgba(120, 210, 150, 0.26)";
  ctx.moveTo(innerX, baseY);
  ctx.lineTo(innerX + innerW, baseY);
  ctx.stroke();

  // Single continuous beam trace: baseline noise and peaks are one line,
  // like an oscilloscope sweep, not filled bars.
  const peaks = body ? bodyPeaks(body) : [];
  const vis: { px: number; v: number; half: number; reveal: number; peak: SpectrumPeak }[] = [];
  for (const peak of peaks) {
    const reveal = peakReveal(progress, peak.mz);
    if (reveal < 0.04) continue;
    vis.push({
      px: innerX + (peak.mz / MZ_MAX) * innerW,
      v: peak.height * reveal,
      half: peak.layer === "atmosphere" ? 1.6 : 2.4,
      reveal,
      peak,
    });
  }
  const buildTrace = () => {
    ctx.beginPath();
    const n = Math.max(60, Math.floor(innerW));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const px = innerX + u * innerW;
      let v = 0;
      for (const pk of vis) {
        const d = Math.abs(px - pk.px);
        if (d < pk.half) v = Math.max(v, pk.v * (1 - d / pk.half));
      }
      const seed = sim.reducedMotion ? u * 71.3 : u * 71.3 + now * 0.0017;
      const nse = (hash(seed) - 0.5) * 2 * noiseAmp * innerH * (1 - v * 0.8);
      const py = baseY - 2 - v * innerH + nse;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  };
  ctx.save();
  ctx.globalAlpha = Math.min(1, flicker * boost) * fade;
  // Wide, soft pass: the phosphor bloom around the beam.
  ctx.shadowColor = "rgba(88, 215, 130, 0.85)";
  ctx.shadowBlur = 7 * boost;
  ctx.strokeStyle = "rgba(86, 185, 118, 0.38)";
  ctx.lineWidth = 2.4;
  buildTrace();
  ctx.stroke();
  // Tight core: the beam itself. Dull green, not neon.
  ctx.shadowBlur = 3;
  ctx.strokeStyle = "rgba(158, 232, 182, 0.85)";
  ctx.lineWidth = 1.1;
  buildTrace();
  ctx.stroke();
  ctx.restore();

  // Peak labels, burned into the phosphor above each spike.
  ctx.font = '500 8px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const pk of vis) {
    if (pk.reveal <= 0.62 || innerW < 160) continue;
    ctx.globalAlpha = Math.min(1, (pk.reveal - 0.62) / 0.25) * 0.95 * fade;
    ctx.fillStyle = pk.peak.fuel ? "rgba(188, 250, 208, 0.95)" : "rgba(136, 216, 164, 0.8)";
    ctx.fillText(SUBSTANCES[pk.peak.id].hud, pk.px, baseY - pk.v * innerH - 3);
  }
  ctx.globalAlpha = fade;

  // On-screen readouts, same phosphor.
  ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(140, 218, 168, 0.7)";
  ctx.fillText("MASS SPEC", x + 10, y + 8);

  if (w >= 170) {
    ctx.textAlign = "right";
    const caption = !body
      ? "NO LOCK"
      : progress >= 1
        ? body.name
        : progress > 0
          ? "SCAN"
          : "IDLE";
    ctx.fillStyle =
      progress >= 1
        ? "rgba(182, 248, 204, 0.9)"
        : progress > 0
          ? "rgba(152, 228, 178, 0.8)"
          : "rgba(104, 176, 132, 0.6)";
    ctx.fillText(caption, x + w - 10, y + 8);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.font = '500 8px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "rgba(104, 176, 132, 0.6)";
  ctx.fillText("m/z", x + 10, y + h - 6);

  // End of beam-deflected content.
  ctx.restore();
  ctx.globalAlpha = fade;

  // Power-on flash: the whole tube blooms for an instant.
  if (flash > 0.01) {
    const fg = ctx.createRadialGradient(cgx, cgy, 2, cgx, cgy, Math.max(gw, gh) * 0.55);
    fg.addColorStop(0, `rgba(214, 255, 228, ${0.5 * flash})`);
    fg.addColorStop(0.5, `rgba(150, 240, 180, ${0.22 * flash})`);
    fg.addColorStop(1, "rgba(120, 220, 150, 0)");
    ctx.fillStyle = fg;
    ctx.fillRect(gx, gy, gw, gh);
  }

  // Collapsed raster: a hot horizontal line across the middle.
  if (lineA > 0.02) {
    const halfW = (gw / 2 - 4) * Math.max(0.02, vx);
    ctx.save();
    ctx.shadowColor = "rgba(160, 255, 195, 0.9)";
    ctx.shadowBlur = 9;
    ctx.strokeStyle = `rgba(222, 255, 234, ${Math.min(1, lineA) * fade})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cgx - halfW, cgy);
    ctx.lineTo(cgx + halfW, cgy);
    ctx.stroke();
    ctx.restore();
  }

  // The dying (or waking) beam dot at dead center.
  if (dotA > 0.02) {
    const dg = ctx.createRadialGradient(cgx, cgy, 0, cgx, cgy, 9);
    dg.addColorStop(0, `rgba(238, 255, 243, ${0.95 * dotA * fade})`);
    dg.addColorStop(0.35, `rgba(170, 248, 200, ${0.6 * dotA * fade})`);
    dg.addColorStop(1, "rgba(120, 220, 150, 0)");
    ctx.fillStyle = dg;
    ctx.fillRect(cgx - 10, cgy - 10, 20, 20);
  }

  // Slow refresh band drifting down the tube.
  if (!sim.reducedMotion && sim.showSpectro) {
    const bandY = gy + (((now * 0.018) % (gh + 36)) - 18);
    const band = ctx.createLinearGradient(0, bandY - 14, 0, bandY + 14);
    band.addColorStop(0, "rgba(120, 220, 150, 0)");
    band.addColorStop(0.5, "rgba(120, 220, 150, 0.045)");
    band.addColorStop(1, "rgba(120, 220, 150, 0)");
    ctx.fillStyle = band;
    ctx.fillRect(gx, bandY - 14, gw, 28);
  }

  // Scanlines over everything on the glass.
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let sy = gy + 1; sy < gy + gh; sy += 3) {
    ctx.fillRect(gx, sy, gw, 1);
  }

  // Curved-tube vignette: corners fall off into the glass.
  const vig = ctx.createRadialGradient(
    cgx,
    cgy,
    Math.min(gw, gh) * 0.36,
    cgx,
    cgy,
    Math.max(gw, gh) * 0.74,
  );
  vig.addColorStop(0, "rgba(0, 8, 3, 0)");
  vig.addColorStop(1, "rgba(0, 8, 3, 0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(gx, gy, gw, gh);

  ctx.restore();

  // Faint glass rim.
  roundRect(ctx, gx, gy, gw, gh, 9);
  ctx.strokeStyle = "rgba(170, 245, 195, 0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  const { desktop, size, x, y } = minimapLayout(cssW, cssH);
  ctx.save();
  ctx.globalAlpha = 0.92;
  roundRect(ctx, x, y, size, size, 12);
  ctx.fillStyle = "rgba(18, 20, 26, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(236, 234, 228, 0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const worldR = getMinimapWorldR();
  const cx = x + size / 2;
  const cy = y + size / 2;
  // Desktop: fill more of the square, leaving a thin ring for nearby names.
  const scale = (size * (desktop ? 0.47 : 0.42)) / worldR;

  const radius = 12;
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();

  const byId = new Map(sim.planets.map((p) => [p.id, p]));
  const drawnPair = new Set<string>();
  ctx.lineWidth = 1;
  for (const p of sim.planets) {
    if (p.kind === "star" || p.kind === "asteroid" || p.orbitR == null) continue;
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (parent && isGhostBody(parent)) {
      if (drawnPair.has(parent.id)) continue;
      drawnPair.add(parent.id);
    }
    const a = p.orbitR;
    const e = p.orbitE ?? 0;
    const peri = p.orbitPeri ?? 0;
    const px = parent?.x ?? 0;
    const py = parent?.y ?? 0;
    const nested = p.kind === "moon" || (parent != null && isGhostBody(parent));
    ctx.strokeStyle = nested ? "rgba(236, 234, 228, 0.12)" : "rgba(236, 234, 228, 0.18)";
    if (e < 0.008) {
      ctx.beginPath();
      ctx.arc(cx + px * scale, cy + py * scale, a * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      const ox = px - Math.cos(peri) * a * e;
      const oy = py - Math.sin(peri) * a * e;
      ctx.save();
      ctx.translate(cx + ox * scale, cy + oy * scale);
      ctx.rotate(peri);
      ctx.beginPath();
      ctx.ellipse(0, 0, a * scale, b * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "rgba(236, 234, 228, 0.22)";
  ctx.lineWidth = 1;
  for (const belt of beltBands(sim.planets)) {
    const parent = byId.get(belt.parentId);
    const px = parent?.x ?? 0;
    const py = parent?.y ?? 0;
    const a = belt.orbitR;
    const e = belt.orbitE;
    const peri = belt.orbitPeri;
    if (e < 0.008) {
      ctx.beginPath();
      ctx.arc(cx + px * scale, cy + py * scale, a * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const b = a * Math.sqrt(Math.max(0, 1 - e * e));
      const ox = px - Math.cos(peri) * a * e;
      const oy = py - Math.sin(peri) * a * e;
      ctx.save();
      ctx.translate(cx + ox * scale, cy + oy * scale);
      ctx.rotate(peri);
      ctx.beginPath();
      ctx.ellipse(0, 0, a * scale, b * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.setLineDash([]);

  for (const p of sim.planets) {
    if (isGhostBody(p)) continue;
    const px = cx + p.x * scale;
    const py = cy + p.y * scale;
    ctx.beginPath();
    ctx.fillStyle = p.kind === "star" ? "#f0d48a" : p.colorA;
    const pipR =
      p.kind === "asteroid"
        ? Math.max(p.landable ? 1.15 : 0.7, p.radius * scale * 0.9)
        : Math.max(p.kind === "moon" ? 1.2 : 1.6, p.radius * scale * 0.9);
    ctx.arc(px, py, pipR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const pip = sinkAlpha(sim);
  if (pip > 0.05) drawMinimapShip(ctx, sim, cx, cy, scale, x, y, size, radius, pip);

  const name = getSystemName();
  ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(236, 234, 228, 0.62)";
  ctx.fillText(name, x + 10, y + 8);

  drawMinimapNearby(ctx, sim, cx, cy, x, y, size, radius);
  ctx.restore();
}

function drawMinimapEdgeArrow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  ux: number,
  uy: number,
  color: string,
) {
  const tipX = sx + ux * 4;
  const tipY = sy + uy * 4;
  const hx = ux * 4.8;
  const hy = uy * 4.8;
  const wx = uy * 3.6;
  const wy = -ux * 3.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(sx - ux * 3.5, sy - uy * 3.5);
  ctx.lineTo(tipX, tipY);
  ctx.moveTo(tipX - hx + wx, tipY - hy + wy);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - hx - wx, tipY - hy - wy);
  ctx.stroke();
}

function drawMinimapNearby(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cx: number,
  cy: number,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  if (sim.nearby.length === 0) return;
  const inset = 8;
  ctx.font = '500 8px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = "rgba(140, 142, 148, 0.88)";
  for (const n of sim.nearby) {
    const v = headingVec(n.angle);
    const hit = rayHitRoundedRect(
      v.x * 1000,
      v.y * 1000,
      size / 2 - inset,
      size / 2 - inset,
      Math.max(1, radius - inset),
    );
    const px = cx + hit.x;
    const py = cy + hit.y;
    drawMinimapEdgeArrow(ctx, px, py, hit.ux, hit.uy, "rgba(140, 142, 148, 0.88)");
    const lx = px - hit.ux * 9;
    const ly = py - hit.uy * 9;
    ctx.textAlign = hit.ux > 0.35 ? "right" : hit.ux < -0.35 ? "left" : "center";
    ctx.textBaseline = hit.uy > 0.35 ? "bottom" : hit.uy < -0.35 ? "top" : "middle";
    ctx.fillText(n.name, lx, ly);
  }
}

function roundedRectContains(
  px: number,
  py: number,
  left: number,
  top: number,
  w: number,
  h: number,
  r: number,
) {
  const x = px - left;
  const y = py - top;
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const rr = Math.max(0, r);
  if (x >= rr && x <= w - rr) return true;
  if (y >= rr && y <= h - rr) return true;
  const cx = x < rr ? rr : w - rr;
  const cy = y < rr ? rr : h - rr;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr * rr;
}

/** Intersection of a ray from the rect center with the rounded-rect boundary. */
function rayHitRoundedRect(dx: number, dy: number, halfW: number, halfH: number, r: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tx = Math.abs(ux) < 1e-8 ? Infinity : halfW / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-8 ? Infinity : halfH / Math.abs(uy);
  const tBox = Math.min(tx, ty);
  const hx = ux * tBox;
  const hy = uy * tBox;
  const innerW = Math.max(0, halfW - r);
  const innerH = Math.max(0, halfH - r);
  if (Math.abs(hx) <= innerW + 1e-6 || Math.abs(hy) <= innerH + 1e-6) {
    return { x: hx, y: hy, ux, uy };
  }
  const ccx = (ux < 0 ? -1 : 1) * innerW;
  const ccy = (uy < 0 ? -1 : 1) * innerH;
  const dot = ux * ccx + uy * ccy;
  const disc = Math.max(0, dot * dot - (ccx * ccx + ccy * ccy) + r * r);
  const t = dot - Math.sqrt(disc);
  if (!Number.isFinite(t) || t <= 0) return { x: hx, y: hy, ux, uy };
  return { x: ux * t, y: uy * t, ux, uy };
}

function drawMinimapShipPip(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  yaw: number,
  scale: number,
) {
  const f = forwardOf(yaw);
  ctx.beginPath();
  ctx.moveTo(sx + f.x * 6 * scale, sy + f.y * 6 * scale);
  ctx.lineTo(sx - f.x * 4 * scale + f.y * 3 * scale, sy - f.y * 4 * scale - f.x * 3 * scale);
  ctx.lineTo(sx - f.x * 4 * scale - f.y * 3 * scale, sy - f.y * 4 * scale + f.x * 3 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawMinimapShip(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cx: number,
  cy: number,
  scale: number,
  x: number,
  y: number,
  size: number,
  radius: number,
  pip: number,
) {
  const inset = 8;
  const mx = cx + sim.ship.x * scale;
  const my = cy + sim.ship.y * scale;
  const inside = roundedRectContains(mx, my, x + inset, y + inset, size - inset * 2, size - inset * 2, Math.max(0, radius - inset));
  ctx.save();
  ctx.globalAlpha *= pip;
  ctx.fillStyle = "#eceae4";
  if (inside) {
    drawMinimapShipPip(ctx, mx, my, sim.ship.yaw, 1);
    ctx.restore();
    return;
  }
  const hit = rayHitRoundedRect(
    sim.ship.x * scale,
    sim.ship.y * scale,
    size / 2 - inset,
    size / 2 - inset,
    Math.max(1, radius - inset),
  );
  drawMinimapEdgeArrow(ctx, cx + hit.x, cy + hit.y, hit.ux, hit.uy, "#eceae4");
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { worldToScreen };
