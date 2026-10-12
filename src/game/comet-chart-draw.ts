import { COMET_RED } from "./comet";
import { COMET_SCENES, COMET_SCENE_DEFAULT, NUCLEUS_R, type CometSceneKind } from "./comet-scene";
import { drawNucleusSprite } from "./comet-scene-draw";
import type { Sim } from "./sim";
import { hudShowsCues, hudShowsPaths, predictCometPath } from "./sim";
import type { Comet } from "./types";
import { getMinimapWorldR } from "./world";

type Draw = CanvasRenderingContext2D;

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * How awake the comet is, 0..1: from the star's distance, like a real one.
 * Close in it is the scene at perihelion; parked far out it barely trails dust.
 */
export function chartCometActivity(sim: Sim, c: Comet) {
  const star = sim.planets.find((p) => p.kind === "star");
  const r = Math.hypot(c.x - (star?.x ?? 0), c.y - (star?.y ?? 0));
  const u = r / Math.max(1, getMinimapWorldR());
  return Math.max(0.15, Math.min(1, 1.3 - u));
}

function sceneParams(c: Comet) {
  const kind = c.parked?.kind;
  return kind && kind in COMET_SCENES ? COMET_SCENES[kind as CometSceneKind] : COMET_SCENES[COMET_SCENE_DEFAULT];
}

/**
 * The comet on the chart: the scene's own nucleus at chart scale, a faint coma,
 * a warm grey dust fan that lags behind its path, frost jets on the lit side
 * when it is close to the star, and a gas tail you can barely see.
 */
export function drawChartComet(ctx: Draw, sim: Sim, now: number) {
  const c = sim.comet;
  if (!c) return;
  const z = Math.max(1e-4, sim.camera.zoom);
  const t = sim.reducedMotion ? 0 : now / 1000;
  const star = sim.planets.find((p) => p.kind === "star") ?? null;
  const lx0 = (star?.x ?? 0) - c.x;
  const ly0 = (star?.y ?? 0) - c.y;
  const lm = Math.hypot(lx0, ly0) || 1;
  const L = { x: lx0 / lm, y: ly0 / lm };
  const T = { x: -L.x, y: -L.y };
  const sp = Math.hypot(c.vx - (star?.vx ?? 0), c.vy - (star?.vy ?? 0));
  const V = sp > 1e-6 ? { x: (c.vx - (star?.vx ?? 0)) / sp, y: (c.vy - (star?.vy ?? 0)) / sp } : { x: L.y, y: -L.x };
  const a = chartCometActivity(sim, c);
  const hot = a * a;
  const r = c.radius;
  const px = 1 / z;
  // Off screen: nothing to draw (the tail is the longest reach).
  const reach = Math.max(110 * px, r * 66, 70 * px * 2.3) + r * 12;
  const cam = sim.camera;
  if (
    Math.abs(c.x - cam.x) > ((sim.viewCssW || 1280) * 0.5) / z + reach ||
    Math.abs(c.y - cam.y) > ((sim.viewCssH || 800) * 0.5) / z + reach
  )
    return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Gas tail: straight away from the star, barely there.
  const ionLen = Math.max(110 * px, r * (26 + 40 * a));
  const ion = ctx.createLinearGradient(c.x, c.y, c.x + T.x * ionLen, c.y + T.y * ionLen);
  ion.addColorStop(0, `rgba(160,184,206,${(0.07 + 0.12 * hot) * a})`);
  ion.addColorStop(1, "rgba(160,184,206,0)");
  ctx.strokeStyle = ion;
  ctx.lineWidth = Math.max(0.8 * px, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + T.x * ionLen, c.y + T.y * ionLen);
  ctx.stroke();

  // Dust: a broad fan that bends back along the orbit.
  const len = Math.max(70 * px, r * (14 + 34 * a)) * (1 + 1.3 * hot);
  const wid = Math.max(5 * px, r * 0.9) * (1 + 0.9 * hot);
  const alpha = (0.05 + 0.07 * hot) * (0.35 + 0.65 * a);
  const N = 24;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const bend = s * s * 0.45;
    const dx = T.x - V.x * bend;
    const dy = T.y - V.y * bend;
    const m = Math.hypot(dx, dy) || 1;
    const qx = c.x + (dx / m) * len * s;
    const qy = c.y + (dy / m) * len * s;
    const rr = wid * (0.6 + s * 3.2);
    const al = Math.pow(1 - s, 1.5) * alpha * 1.6;
    const g = ctx.createRadialGradient(qx, qy, 0, qx, qy, rr);
    g.addColorStop(0, `rgba(196,186,168,${al})`);
    g.addColorStop(1, "rgba(196,186,168,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(qx, qy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  const grains = 20 + Math.round(36 * hot);
  for (let i = 0; i < grains; i++) {
    const u = (hash(i * 2.9) + t * 0.03) % 1;
    const bend = u * u * 0.45;
    const dx = T.x - V.x * bend;
    const dy = T.y - V.y * bend;
    const m = Math.hypot(dx, dy) || 1;
    const side = (hash(i * 7.3) - 0.5) * wid * (2 + u * 7);
    const gx = c.x + (dx / m) * len * u * 0.8 + (-dy / m) * side;
    const gy = c.y + (dy / m) * len * u * 0.8 + (dx / m) * side;
    ctx.fillStyle = `rgba(220,212,196,${(1 - u) * 0.5 * a})`;
    ctx.beginPath();
    ctx.arc(gx, gy, (0.6 + (1 - u) * 0.8) * px, 0, Math.PI * 2);
    ctx.fill();
  }

  // Coma, offset toward the star.
  const comaR = Math.max(10 * px, r * (3 + 3 * a + 6 * hot));
  const comaA = 0.07 * (0.4 + a) + 0.16 * hot;
  const cx = c.x + L.x * r * 0.5;
  const cy = c.y + L.y * r * 0.5;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, comaR);
  cg.addColorStop(0, `rgba(214,214,212,${comaA})`);
  cg.addColorStop(0.35, `rgba(196,194,188,${comaA * 0.4})`);
  cg.addColorStop(1, "rgba(180,176,168,0)");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, comaR, 0, Math.PI * 2);
  ctx.fill();

  // Frost jets on the lit side, only when close to the star.
  const jk = Math.max(0, (a - 0.45) / 0.55);
  if (jk > 0 && r * z > 3) {
    const base = Math.atan2(L.y, L.x);
    for (let i = 0; i < 5; i++) {
      const on = sim.reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t * (0.7 + i * 0.37) + i * 1.9);
      const ang = base + (hash(i * 4.4) - 0.5) * 1.7;
      const ox = c.x + Math.cos(ang) * r * 0.62;
      const oy = c.y + Math.sin(ang) * r * 0.62;
      const jl = r * (1.4 + 2.4 * jk) * (0.6 + 0.4 * on);
      const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(ang) * jl, oy + Math.sin(ang) * jl);
      g.addColorStop(0, `rgba(236,244,250,${0.32 * jk * on})`);
      g.addColorStop(1, "rgba(220,230,240,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(ang - 0.32) * jl, oy + Math.sin(ang - 0.32) * jl);
      ctx.lineTo(ox + Math.cos(ang + 0.32) * jl, oy + Math.sin(ang + 0.32) * jl);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // The nucleus: the scene's rock, or a dim point when it is too small to have a shape.
  if (r * z < 2.5) {
    ctx.fillStyle = "rgba(176,166,150,0.95)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 1.4 * px, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const p = sceneParams(c);
    const rot = c.parked?.rot ?? c.rot ?? 0;
    // Small on screen, relight less often: a few pixels hide the difference.
    const tol = r * z > 40 ? 0.004 : r * z > 12 ? 0.03 : 0.08;
    drawNucleusSprite(ctx, c.x, c.y, r / NUCLEUS_R, { rot, sun: L, p: { sun: p.sun, cave: p.cave } }, tol);
  }
}

/** The comet's next ten seconds, dashed like the planets' paths, in its own red. */
export function drawChartCometPath(ctx: Draw, sim: Sim) {
  const c = sim.comet;
  if (!c || !hudShowsPaths(sim.hudMode)) return;
  if (sim.phase !== "flight" && sim.phase !== "landed") return;
  const path = predictCometPath(sim, 10);
  if (path.length < 2) return;
  ctx.save();
  ctx.lineWidth = 1.45;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = "rgba(226, 75, 58, 0.72)";
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  for (const p of path) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

const MONO = '500 10px "IBM Plex Mono", ui-monospace, monospace';

/**
 * The HUD picks the comet out, unlike anything else on the chart: red corner
 * brackets and its name on screen, or a red pointer at the edge when it is out
 * of view. Screen space.
 */
export function drawChartCometMark(ctx: Draw, sim: Sim, cssW: number, cssH: number) {
  const c = sim.comet;
  if (!c || !hudShowsCues(sim.hudMode)) return;
  if (sim.phase !== "flight" && sim.phase !== "landed") return;
  const cam = sim.camera;
  const x = (c.x - cam.x) * cam.zoom + cssW / 2;
  const y = (c.y - cam.y) * cam.zoom + cssH / 2;
  const m = 26;
  ctx.save();
  ctx.strokeStyle = COMET_RED;
  ctx.fillStyle = COMET_RED;
  ctx.font = MONO;
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.9;
  if (x >= 0 && x <= cssW && y >= 0 && y <= cssH) {
    const h = Math.max(11, c.radius * cam.zoom * 1.7);
    const q = Math.max(4, h * 0.35);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x + sx * h, y + sy * (h - q));
      ctx.lineTo(x + sx * h, y + sy * h);
      ctx.lineTo(x + sx * (h - q), y + sy * h);
      ctx.stroke();
    }
    ctx.textBaseline = "top";
    ctx.fillText("COMET", x + h + 6, y - h);
  } else {
    // Out of view: a chevron on the screen edge, pointing at it.
    const dx = x - cssW / 2;
    const dy = y - cssH / 2;
    const k = Math.min((cssW / 2 - m) / Math.max(1e-6, Math.abs(dx)), (cssH / 2 - m) / Math.max(1e-6, Math.abs(dy)));
    const ex = cssW / 2 + dx * k;
    const ey = cssH / 2 + dy * k;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    ctx.beginPath();
    ctx.moveTo(ex + ux * 7, ey + uy * 7);
    ctx.lineTo(ex - ux * 4 + uy * 5, ey - uy * 4 - ux * 5);
    ctx.lineTo(ex - ux * 4 - uy * 5, ey - uy * 4 + ux * 5);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = ux > 0.3 ? "right" : ux < -0.3 ? "left" : "center";
    ctx.textBaseline = uy > 0.3 ? "bottom" : uy < -0.3 ? "top" : "middle";
    ctx.fillText("COMET", ex - ux * 14, ey - uy * 14);
  }
  ctx.restore();
}
