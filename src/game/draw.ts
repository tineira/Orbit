import type { Camera, FlightStatus, Particle, Planet, Ship } from "./types";
import type { Sim } from "./sim";
import { atmoRadius, forwardOf, predictPath } from "./sim";
import { G, getMinimapWorldR } from "./world";

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
  drawParticles(ctx, sim.particles);
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

function drawStars(ctx: CanvasRenderingContext2D, cam: Camera, cssW: number, cssH: number, sx: number, sy: number) {
  const layers = [
    { n: 90, par: 0.12, size: 0.7, a: 0.35 },
    { n: 70, par: 0.28, size: 1.05, a: 0.55 },
    { n: 40, par: 0.55, size: 1.4, a: 0.8 },
  ];
  for (const layer of layers) {
    const span = 2800;
    const ox = cam.x * layer.par;
    const oy = cam.y * layer.par;
    ctx.fillStyle = `rgba(232, 230, 224, ${layer.a})`;
    for (let i = 0; i < layer.n; i++) {
      const gx = hash(i * 19.17 + layer.par * 8) * span;
      const gy = hash(i * 47.3 + layer.par * 3) * span;
      const x = ((gx - ox) % span) + cssW / 2 - span / 2 + sx * layer.par;
      const y = ((gy - oy) % span) + cssH / 2 - span / 2 + sy * layer.par;
      const tw = 0.65 + 0.35 * Math.sin(performance.now() * 0.0012 + i);
      ctx.globalAlpha = layer.a * tw;
      ctx.beginPath();
      ctx.arc(x, y, layer.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
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

function drawLockRing(ctx: CanvasRenderingContext2D, sim: Sim) {
  if (!sim.orbitLockId) return;
  const p = sim.planets.find((b) => b.id === sim.orbitLockId);
  if (!p) return;
  const e = sim.orbitLockE;
  const mu = G * p.mass;
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
  g.addColorStop(1, "rgba(7,8,12,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawMinimap(ctx: CanvasRenderingContext2D, sim: Sim, cssW: number, cssH: number) {
  const size = Math.min(132, Math.max(96, cssW * 0.16));
  const pad = 16;
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

  for (const p of sim.planets) {
    const px = cx + p.x * scale;
    const py = cy + p.y * scale;
    ctx.beginPath();
    ctx.fillStyle = p.kind === "star" ? "#f0d48a" : p.colorA;
    ctx.arc(px, py, Math.max(1.6, p.radius * scale * 0.9), 0, Math.PI * 2);
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
