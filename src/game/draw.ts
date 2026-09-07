import type { Camera, FlightStatus, Particle, Planet, SolarFlare } from "./types";
import type { Sim } from "./sim";
import {
  atmoDrag,
  atmoRadius,
  forwardOf,
  gravityAt,
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
} from "./sim";
import {
  getMinimapWorldR,
  ORBIT_DRAG_BREAK,
  ORBIT_PERTURB_BREAK,
  orbitShellAlts,
  STAR_ATMO_FACTOR,
} from "./world";

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
  const shakeX = sim.reducedMotion ? 0 : (hash(performance.now() * 0.08) - 0.5) * cam.shake * 18;
  const shakeY = sim.reducedMotion
    ? 0
    : (hash(performance.now() * 0.09 + 9) - 0.5) * cam.shake * 18;

  if (!sim.showGravityGrid) drawStars(ctx, cam, cssW, cssH, shakeX, shakeY);
  ctx.save();
  ctx.translate(cssW / 2 + shakeX, cssH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  if (sim.showGravityGrid) drawGravityGrid(ctx, sim, cam, cssW, cssH);
  drawSunBloom(ctx, sim);
  drawStarCorona(ctx, sim);
  drawLockRing(ctx, sim);
  if (sim.phase === "flight") drawPath(ctx, predictPath(sim, 10), sim);
  const star = sim.planets.find((b) => b.kind === "star") ?? null;
  for (const p of sim.planets) drawPlanet(ctx, p, cam, star, sim.planets);
  drawSolarFlares(ctx, sim);
  drawOrbitShell(ctx, sim);
  drawLagrangePoints(ctx, sim, cam);
  drawRelativePath(ctx, sim);
  drawPlanetPaths(ctx, sim);
  const particlesOver = sim.burned || sim.crashKind === "sink";
  if (!particlesOver) drawParticles(ctx, sim.particles);
  drawGravityArrows(ctx, sim);
  const shipUmbra = star ? pointUmbraMax(sim.ship.x, sim.ship.y, sim.planets, star, null) : 0;
  drawShip(ctx, sim, shipUmbra);
  if (particlesOver) drawParticles(ctx, sim.particles);
  drawOrbitLockBars(ctx, sim, cam);

  ctx.restore();
  drawVignette(ctx, cssW, cssH);
  drawMinimap(ctx, sim, cssW, cssH);
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

function starRgb(i: number): [number, number, number] {
  const t = hash(i * 3.17);
  if (t < 0.52) return [210, 224, 255];
  if (t < 0.8) return [248, 248, 252];
  if (t < 0.93) return [255, 232, 196];
  return [255, 186, 138];
}

/** World units of mesh slide per unit of acceleration. Linear so the star's gradient reads at planet distance. */
const GRID_WARP_K = 280;

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
    if (Math.hypot(x - p.x, y - p.y) < p.radius * 0.88) return true;
  }
  return false;
}

function warpGridPoint(x: number, y: number, sim: Sim, cellCap: number) {
  const g = gravityAt(x, y, sim.planets, sim.gravityScale);
  const mag = Math.hypot(g.ax, g.ay);
  if (mag < 1e-8) return { x, y };
  let dist = GRID_WARP_K * mag;
  const room = Math.max(0, g.dist - g.nearest.radius * 0.9);
  dist = Math.min(dist, room * 0.84);
  dist = dist / (1 + dist / cellCap);
  return { x: x + (g.ax / mag) * dist, y: y + (g.ay / mag) * dist };
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
  const { fine: step, coarse, fade, target } = gridLod(zoom);
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
  const cellCap = target * 8;

  for (let j = 0; j < rows; j++) {
    const gy = y0 + j * step;
    for (let i = 0; i < cols; i++) {
      const gx = x0 + i * step;
      const k = j * cols + i;
      hide[k] = gridBuried(gx, gy, sim.planets) ? 1 : 0;
      const w = warpGridPoint(gx, gy, sim, cellCap);
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

function drawStarDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rgb: [number, number, number],
  a: number,
) {
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  if (size <= 1.05) {
    const s = Math.max(0.7, size);
    ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cssW: number,
  cssH: number,
  sx: number,
  sy: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const layers = [
    { n: 1400, par: 0.018, size: 0.5, a: 0.28, span: 2400 },
    { n: 900, par: 0.028, size: 0.72, a: 0.44, span: 2100 },
    { n: 420, par: 0.04, size: 1.0, a: 0.62, span: 1800 },
    { n: 160, par: 0.055, size: 1.25, a: 0.78, span: 1600 },
  ];

  for (const layer of layers) {
    const { span } = layer;
    const ox = cam.x * layer.par + sx * layer.par;
    const oy = cam.y * layer.par + sy * layer.par;
    for (let i = 0; i < layer.n; i++) {
      const gx = hash(i * 19.17 + layer.par * 8) * span;
      const gy = hash(i * 47.3 + layer.par * 3) * span;
      const x = wrapSpan(gx - ox, span) + cssW / 2 - span / 2;
      const y = wrapSpan(gy - oy, span) + cssH / 2 - span / 2;
      const mag = hash(i * 11.9 + layer.par);
      const size = layer.size * (0.65 + mag * 0.7);
      const a = layer.a * (0.55 + mag * 0.45);
      drawStarDot(ctx, x, y, size, starRgb(i), a);
    }
  }

  const milky = { n: 1600, par: 0.022, span: 2600 };
  const oxm = cam.x * milky.par + sx * milky.par;
  const oym = cam.y * milky.par + sy * milky.par;
  const ca = Math.cos(-0.48);
  const sa = Math.sin(-0.48);
  for (let i = 0; i < milky.n; i++) {
    const along = (hash(i * 2.13) - 0.5) * milky.span * 1.35;
    const u = hash(i * 8.41) * 2 - 1;
    const across = u * u * u * 520;
    const gx = milky.span * 0.5 + along * ca - across * sa;
    const gy = milky.span * 0.5 + along * sa + across * ca;
    const x = wrapSpan(gx - oxm, milky.span) + cssW / 2 - milky.span / 2;
    const y = wrapSpan(gy - oym, milky.span) + cssH / 2 - milky.span / 2;
    const mag = hash(i * 4.6);
    drawStarDot(ctx, x, y, 0.4 + mag * 0.55, starRgb(i + 400), 0.14 + mag * 0.24);
  }

  const brights = 36;
  const spanB = 2000;
  const parB = 0.06;
  const oxb = cam.x * parB + sx * parB;
  const oyb = cam.y * parB + sy * parB;
  for (let i = 0; i < brights; i++) {
    const gx = hash(i * 13.7 + 2) * spanB;
    const gy = hash(i * 29.1 + 4) * spanB;
    const x = wrapSpan(gx - oxb, spanB) + cssW / 2 - spanB / 2;
    const y = wrapSpan(gy - oyb, spanB) + cssH / 2 - spanB / 2;
    const rgb = starRgb(i + 90);
    const size = 1.25 + hash(i * 6.2) * 0.55;
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.08)`;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.82)`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

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
  if (!p) return;
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
  if (sim.phase === "creating" || sim.phase === "crashed" || sim.phase === "title") return;
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
    if (o.kind === "star" || o.id === skipId) continue;
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
    if (o.id === p.id || o.kind === "star") continue;
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

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  p: Planet,
  cam: Camera,
  star: Planet | null,
  bodies: Planet[],
) {
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

function drawShip(ctx: CanvasRenderingContext2D, sim: Sim, umbra = 0) {
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

function lockLabelColor(remaining: number) {
  if (remaining > LOCK_BAR_CAUTION) return LOCK_LABEL_IDLE;
  if (remaining > LOCK_BAR_WARN) return "#c4a05a";
  return "#c45c4a";
}

function drawLockBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  remaining: number,
  healthy: string,
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
      ctx.fillStyle = color;
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
) {
  const color = lockLabelColor(remaining);
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

function drawOrbitLockBars(ctx: CanvasRenderingContext2D, sim: Sim, cam: Camera) {
  if (!sim.orbitLockId && !sim.lagrangeLockKey) return;
  const zoom = Math.max(0.04, cam.zoom);
  const dragLeft = 1 - Math.min(1, atmoDrag(sim) / ORBIT_DRAG_BREAK);
  const gravLeft = 1 - Math.min(1, orbitPerturb(sim) / ORBIT_PERTURB_BREAK);
  ctx.save();
  ctx.translate(sim.ship.x, sim.ship.y);
  ctx.scale(1 / zoom, 1 / zoom);
  const x = -Math.round(LOCK_BAR_W / 2);
  const y = Math.round(13 * zoom + 10);
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
  if (sim.phase === "creating" || sim.phase === "crashed" || sim.phase === "title") return;
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

function drawMinimap(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  const desktop = cssW >= 1024;
  const size = Math.min(desktop ? 184 : 132, Math.max(96, cssW * 0.16));
  const pad = desktop ? 24 : 16;
  const x = cssW - size - pad;
  const y = cssH - size - pad - 8;
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
  const scale = (size * 0.42) / worldR;

  roundRect(ctx, x, y, size, size, 12);
  ctx.clip();

  const byId = new Map(sim.planets.map((p) => [p.id, p]));
  ctx.lineWidth = 1;
  for (const p of sim.planets) {
    if (p.kind === "star" || p.orbitR == null) continue;
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    const a = p.orbitR;
    const e = p.orbitE ?? 0;
    const peri = p.orbitPeri ?? 0;
    const px = parent?.x ?? 0;
    const py = parent?.y ?? 0;
    ctx.strokeStyle = p.kind === "moon" ? "rgba(236, 234, 228, 0.12)" : "rgba(236, 234, 228, 0.18)";
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

  for (const p of sim.planets) {
    const px = cx + p.x * scale;
    const py = cy + p.y * scale;
    ctx.beginPath();
    ctx.fillStyle = p.kind === "star" ? "#f0d48a" : p.colorA;
    ctx.arc(
      px,
      py,
      Math.max(p.kind === "moon" ? 1.2 : 1.6, p.radius * scale * 0.9),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  const pip = sinkAlpha(sim);
  if (pip > 0.05) {
    const sx = cx + sim.ship.x * scale;
    const sy = cy + sim.ship.y * scale;
    const f = forwardOf(sim.ship.yaw);
    ctx.globalAlpha *= pip;
    ctx.fillStyle = "#eceae4";
    ctx.beginPath();
    ctx.moveTo(sx + f.x * 6, sy + f.y * 6);
    ctx.lineTo(sx - f.x * 4 + f.y * 3, sy - f.y * 4 - f.x * 3);
    ctx.lineTo(sx - f.x * 4 - f.y * 3, sy - f.y * 4 + f.x * 3);
    ctx.closePath();
    ctx.fill();
  }
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
