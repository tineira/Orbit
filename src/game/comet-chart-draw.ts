import { COMET_RED } from "./comet";
import { COMET_SCENES, COMET_SCENE_DEFAULT, NUCLEUS_R, type CometSceneKind } from "./comet-scene";
import { drawCometAtmosphere, drawNucleusSprite } from "./comet-scene-draw";
import type { Sim } from "./sim";
import { cometBlendWeight, hudShowsCues, hudShowsPaths, predictCometPath } from "./sim";
import type { Comet } from "./types";

type Draw = CanvasRenderingContext2D;

function sceneParams(c: Comet) {
  const kind = c.parked?.kind;
  return kind && kind in COMET_SCENES ? COMET_SCENES[kind as CometSceneKind] : COMET_SCENES[COMET_SCENE_DEFAULT];
}

/**
 * The comet on the chart is the scene seen from further out: the same nucleus,
 * coma, faint dust tail and the shadow column the star throws behind it. Near
 * a parked comet the sunlit sky comes in with the camera handover.
 */
export function drawChartComet(ctx: Draw, sim: Sim) {
  const c = sim.comet;
  if (!c) return;
  const z = Math.max(1e-4, sim.camera.zoom);
  const star = sim.planets.find((p) => p.kind === "star") ?? null;
  const lx0 = (star?.x ?? 0) - c.x;
  const ly0 = (star?.y ?? 0) - c.y;
  const lm = Math.hypot(lx0, ly0) || 1;
  const L = { x: lx0 / lm, y: ly0 / lm };
  const r = c.radius;
  const px = 1 / z;
  const p = sceneParams(c);
  const dpr = Math.abs(ctx.getTransform().a) / z;
  drawCometAtmosphere(ctx, c.x, c.y, r / NUCLEUS_R, L, p.sun, cometBlendWeight(sim), dpr);
  // Off screen, the rock itself has nothing to draw (and no relight to pay for).
  const cam = sim.camera;
  if (
    Math.abs(c.x - cam.x) > ((sim.viewCssW || 1280) * 0.5) / z + r * 2 ||
    Math.abs(c.y - cam.y) > ((sim.viewCssH || 800) * 0.5) / z + r * 2
  )
    return;

  // The nucleus: the scene's rock, or a dim point when it is too small to have a shape.
  if (r * z < 2.5) {
    ctx.fillStyle = "rgba(176,166,150,0.95)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 1.4 * px, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const rot = c.parked?.rot ?? c.rot ?? 0;
    // Small on screen, relight less often: a few pixels hide the difference.
    const tol = r * z > 40 ? 0.004 : r * z > 12 ? 0.03 : 0.08;
    drawNucleusSprite(ctx, c.x, c.y, r / NUCLEUS_R, { rot, sun: L, p: { sun: p.sun, cave: p.cave } }, tol);
  }
}

/**
 * How deep the ship sits in the comet's shadow column on the chart, as the
 * scene darkens it (0.82 inside, like the scene's ship), so crossing over
 * keeps the ship as dark as it was.
 */
export function chartCometShipShade(sim: Sim) {
  const c = sim.comet;
  if (!c) return 0;
  const star = sim.planets.find((b) => b.kind === "star");
  const lx = (star?.x ?? 0) - c.x;
  const ly = (star?.y ?? 0) - c.y;
  const lm = Math.hypot(lx, ly) || 1;
  const k = c.radius / NUCLEUS_R;
  const x = (sim.ship.x - c.x) / k;
  const y = (sim.ship.y - c.y) / k;
  const behind = -(x * lx + y * ly) / lm;
  const side = Math.abs(-x * ly + y * lx) / lm;
  return behind > 0 && behind < 1400 && side < NUCLEUS_R * 0.95 ? 0.82 : 0;
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
