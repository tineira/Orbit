import type { Camera, FlightStatus, Particle, Planet, Ship } from "./types";
import type { Sim } from "./sim";
import {
  atmoRadius,
  bodyMu,
  forwardOf,
  gravityPulls,
  LAGRANGE_CAPTURE_R,
  listLagrangePoints,
  predictPath,
  predictPlanetPaths,
  predictRelativePath,
  relativePathTarget,
} from "./sim";
import { getMinimapWorldR, orbitShellAlts } from "./world";

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
  const shakeY = sim.reducedMotion ? 0 : (hash(performance.now() * 0.09 + 9) - 0.5) * cam.shake * 18;

  drawStars(ctx, cam, cssW, cssH, shakeX, shakeY);
  ctx.save();
  ctx.translate(cssW / 2 + shakeX, cssH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawSunBloom(ctx, sim);
  drawLockRing(ctx, sim);
  const path = predictPath(sim, 10);
  drawPath(ctx, path, sim);
  for (const p of sim.planets) drawPlanet(ctx, p, cam);
  drawOrbitShell(ctx, sim);
  drawLagrangePoints(ctx, sim, cam);
  drawRelativePath(ctx, sim);
  drawPlanetPaths(ctx, sim);
  drawParticles(ctx, sim.particles);
  drawGravityArrows(ctx, sim);
  drawShip(ctx, sim.ship, sim.phase !== "title" && sim.ship.thrusting);

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

function drawStarDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rgb: [number, number, number], a: number) {
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

function drawStars(ctx: CanvasRenderingContext2D, cam: Camera, cssW: number, cssH: number, sx: number, sy: number) {
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
  const g = ctx.createRadialGradient(star.x, star.y, star.radius * 0.2, star.x, star.y, star.radius * 3.4);
  g.addColorStop(0, "rgba(255, 210, 120, 0.18)");
  g.addColorStop(0.35, "rgba(255, 170, 70, 0.07)");
  g.addColorStop(1, "rgba(255, 170, 70, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(star.x, star.y, star.radius * 3.4, 0, Math.PI * 2);
  ctx.fill();
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
  if (!sim.orbitLockId) return;
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) return;
  const e = sim.orbitLockE;
  const mu = bodyMu(p, sim.gravityScale);
  if (mu <= 0) return;
  const pParam = sim.orbitLockH === 0 ? sim.orbitLockR : (sim.orbitLockH * sim.orbitLockH) / mu;

  ctx.strokeStyle = "rgba(125, 155, 134, 0.22)";
  ctx.lineWidth = 6;
  if (e < 0.05) {
    const r = Math.max(8, pParam);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(236, 234, 228, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([8, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  const a = pParam / (1 - e * e);
  const b = a * Math.sqrt(Math.max(0, 1 - e * e));
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(sim.orbitLockPeri);
  ctx.translate(-a * e, 0);
  ctx.beginPath();
  ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(236, 234, 228, 0.55)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([8, 10]);
  ctx.stroke();
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
  if (sim.phase === "creating" || sim.phase === "crashed") return;
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
  if (sim.phase === "landed" || sim.phase === "crashed" || sim.phase === "creating" || sim.landedId || sim.lagrangeLockKey) return;
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

function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, cam: Camera) {
  const atmo = atmoRadius(p);
  const halo = ctx.createRadialGradient(p.x, p.y, p.radius * 0.9, p.x, p.y, atmo);
  halo.addColorStop(0, p.atmo);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, p.y, atmo, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotate);
  const body = ctx.createRadialGradient(-p.radius * 0.35, -p.radius * 0.4, p.radius * 0.15, 0, 0, p.radius);
  body.addColorStop(0, p.colorA);
  body.addColorStop(1, p.colorB);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.clip();

  if (p.kind === "gas" && p.bands) {
    p.bands.forEach((c, i) => {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = c;
      const y = -p.radius + ((i + 0.5) / p.bands!.length) * p.radius * 2;
      ctx.fillRect(-p.radius, y, p.radius * 2, p.radius * 0.22);
    });
    ctx.globalAlpha = 1;
  } else if (p.kind !== "star") {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = p.colorB;
    for (let i = 0; i < 5; i++) {
      const a = hash(i * 3.1 + p.radius) * Math.PI * 2;
      const r = hash(i * 7.7 + p.mass) * p.radius * 0.55;
      const s = p.radius * (0.12 + hash(i * 2.2) * 0.22);
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, s * 1.4, s * 0.7, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const shade = ctx.createLinearGradient(-p.radius, 0, p.radius, p.radius * 0.4);
  shade.addColorStop(0, "rgba(0,0,0,0.18)");
  shade.addColorStop(0.45, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = shade;
  ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (p.kind === "star") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    core.addColorStop(0, "rgba(255, 248, 220, 0.95)");
    core.addColorStop(0.45, "rgba(255, 196, 90, 0.7)");
    core.addColorStop(1, "rgba(210, 110, 30, 0.15)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(p.x + p.radius + 12 / cam.zoom, p.y);
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

function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, thrusting: boolean) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(-ship.yaw);

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
  ctx.fillStyle = "#eceae4";
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

  ctx.fillStyle = "#12141a";
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

  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, cssW: number, cssH: number) {
  const g = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.35, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(7,8,12,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawLagrangePoints(ctx: CanvasRenderingContext2D, sim: Sim, cam: Camera) {
  if (sim.phase === "creating" || sim.phase === "crashed" || sim.phase === "title") return;
  const points = listLagrangePoints(sim);
  if (!points.length) return;
  const showAll = sim.showLagrange;
  const locked = sim.lagrangeLockKey;
  if (!showAll && !locked) return;
  const zoom = Math.max(0.12, cam.zoom);
  const label = zoom >= 0.28;

  ctx.save();
  for (const pt of points) {
    const isLocked = pt.key === locked;
    if (!showAll && !isLocked) continue;
    const near =
      isLocked || Math.hypot(sim.ship.x - pt.x, sim.ship.y - pt.y) < LAGRANGE_CAPTURE_R * 1.8;
    const ring = isLocked ? "rgba(183, 192, 204, 0.55)" : near ? "rgba(183, 192, 204, 0.34)" : "rgba(183, 192, 204, 0.16)";
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

    ctx.fillStyle = isLocked ? "rgba(236, 234, 228, 0.92)" : "rgba(183, 192, 204, 0.85)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.4 / zoom, 0, Math.PI * 2);
    ctx.fill();

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
    // Star-centric rails only. Moon orbits collapse to a few pixels around the giant.
    if (p.kind === "star" || p.kind === "moon" || p.orbitR == null) continue;
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    ctx.beginPath();
    ctx.arc(cx + (parent?.x ?? 0) * scale, cy + (parent?.y ?? 0) * scale, p.orbitR * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(236, 234, 228, 0.18)";
    ctx.stroke();
  }

  for (const p of sim.planets) {
    const px = cx + p.x * scale;
    const py = cy + p.y * scale;
    ctx.beginPath();
    ctx.fillStyle = p.kind === "star" ? "#f0d48a" : p.colorA;
    ctx.arc(px, py, Math.max(p.kind === "moon" ? 1.2 : 1.6, p.radius * scale * 0.9), 0, Math.PI * 2);
    ctx.fill();
  }

  const sx = cx + sim.ship.x * scale;
  const sy = cy + sim.ship.y * scale;
  const f = forwardOf(sim.ship.yaw);
  ctx.fillStyle = "#eceae4";
  ctx.beginPath();
  ctx.moveTo(sx + f.x * 6, sy + f.y * 6);
  ctx.lineTo(sx - f.x * 4 + f.y * 3, sy - f.y * 4 - f.x * 3);
  ctx.lineTo(sx - f.x * 4 - f.y * 3, sy - f.y * 4 + f.x * 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { worldToScreen };
