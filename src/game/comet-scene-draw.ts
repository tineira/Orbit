import type { Sim } from "./sim";
import type { CometCave } from "./comet-scene";
import {
  COMET_HOLD_S,
  COMET_TRAVEL,
  NUCLEUS_GRAV_K,
  NUCLEUS_LOBES,
  NUCLEUS_R,
  IMPACT_LIFE_S,
  inUmbra,
  caveFloorR,
  inCave,
  nearCave,
  nucleusRadiusAt,
  sceneHash,
  siteLit,
  surfacePoint,
  surfaceRadiusAt,
  type CometScene,
} from "./comet-scene";

/**
 * The comet scene's look, closed by Tomás on 12 Oct 2026: "Día y noche" with
 * "Hielo" jets. A charcoal, two-lobed nucleus raked by a low sun, a near-black
 * night side and a soft shadow column; vents spray glittering frost (no
 * concentrated spike); outbursts warn with a pulsing point, then flash dry
 * and open a frost arc. The engine plume is the only light at night.
 * Drawing only: the simulation lives in comet-scene.ts.
 */

type Draw = CanvasRenderingContext2D;

const WARP = COMET_TRAVEL;
const TAU = Math.PI * 2;

let stars: { x: number; y: number; z: number; len: number }[] | null = null;
function starfield() {
  if (stars) return stars;
  let seed = 5;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  stars = Array.from({ length: 170 }, () => ({ x: rnd(), y: rnd(), z: 0.25 + rnd() * 0.75, len: 0.4 + rnd() * 0.9 }));
  return stars;
}

/** Background stars as streaks crossing the screen: the comet and the ship move together faster than warp. */
function drawStreaks(ctx: Draw, flown: number, travel: number, cssW: number, cssH: number, reduced: boolean) {
  const sp = reduced ? 0.02 : 1.9;
  const t = flown;
  const k = Math.min(cssW, cssH) / 640;
  ctx.save();
  ctx.lineCap = "round";
  for (const s of starfield()) {
    const x = ((((s.x - t * sp * s.z * WARP.x * 0.35) % 1) + 1) % 1) * (cssW + 240) - 120;
    const y = ((((s.y - t * sp * s.z * WARP.y * 0.35) % 1) + 1) % 1) * (cssH + 240) - 120;
    // Arrived: the streaks shrink back to points as the comet stops.
    const len = Math.max(1.2, (reduced ? 2 : 70 + s.len * 150) * s.z * k * travel);
    ctx.strokeStyle = `rgba(190,196,204,${s.z * 0.16})`;
    ctx.lineWidth = 0.6 + s.z * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + WARP.x * len, y + WARP.y * len);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- nucleus: a shaded height field, re-lit every frame ----

type Nucleus = {
  n: number;
  ext: number;
  cv: HTMLCanvasElement;
  cx: CanvasRenderingContext2D;
  img: ImageData;
  /** Rotation and sun the texels were last lit for; relight only when they move. */
  litRot: number;
  litSun: number;
  litDir: number;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
  alb: Float32Array;
  mask: Uint8Array;
  /** How much engine light each texel returns (alpha): dark rock and the cave take little. */
  bounce: HTMLCanvasElement;
  /** Scratch layer the engine light is painted on, in texel space. */
  plume: HTMLCanvasElement;
};
let nucleus: Nucleus | null = null;
let nucleusCave: CometCave | undefined;

function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (i: number, j: number) => sceneHash(i * 57.13 + j * 311.71);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

/**
 * How much darker this texel is for the cave: 0 outside, up to 1 over it. The
 * shaft runs under a rock roof, so from above it is only a slightly darker,
 * sunken patch with ragged edges, like a lava tube or a collapsed vent.
 */
function caveShade(cave: CometCave | undefined, x: number, y: number, rr: number) {
  if (!cave) return 0;
  const a = Math.atan2(y, x);
  const g = Math.abs(Math.atan2(Math.sin(a - cave.a), Math.cos(a - cave.a)));
  const rag = (vnoise(rr / 6, 2.3) - 0.5) * 0.12 + (vnoise(x / 3, y / 3) - 0.5) * 0.05;
  const across = 1 - Math.max(0, Math.min(1, (g - cave.half * 0.75 - rag) / (cave.half * 0.5)));
  const floor = caveFloorR(cave) - 4;
  const along = Math.max(0, Math.min(1, (rr - floor) / 8));
  return across * along;
}

function buildNucleus(cave?: CometCave): Nucleus {
  const n = 220;
  const ext = 130;
  const cell = (ext * 2) / n;
  const H = new Float32Array(n * n);
  const mask = new Uint8Array(n * n);
  const alb = new Float32Array(n * n);
  const roof = new Float32Array(n * n);
  const lit = new Float32Array(n * n);
  const pits = Array.from({ length: 9 }, (_, i) => ({
    x: (sceneHash(i * 4.1) - 0.5) * 150,
    y: (sceneHash(i * 6.7) - 0.5) * 100,
    r: 4 + sceneHash(i * 8.3) ** 2 * 18,
  }));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -ext + (i + 0.5) * cell;
      const y = -ext + (j + 0.5) * cell;
      const rr = Math.hypot(x, y);
      const edge = nucleusRadiusAt(Math.atan2(y, x));
      const k = j * n + i;
      if (rr >= edge) continue;
      mask[k] = 1;
      const shade = caveShade(cave, x, y, rr);
      roof[k] = shade;
      let h = 0;
      for (const L of NUCLEUS_LOBES) {
        const d = Math.hypot(x - L.x, y - L.y) / L.r;
        if (d < 1) h = Math.max(h, Math.sqrt(1 - d * d) * L.r * 0.55);
      }
      h *= Math.min(1, (edge - rr) / 10 + 0.35);
      h += (vnoise(x / 26, y / 26) - 0.5) * 14 + (vnoise(x / 9, y / 9) - 0.5) * 5 + (vnoise(x / 3.5, y / 3.5) - 0.5) * 1.6;
      // The neck between the lobes.
      if (Math.abs(x - 14) < 12) h -= (1 - Math.abs(x - 14) / 12) * 9;
      for (const p of pits) {
        const d = Math.hypot(x - p.x, y - p.y) / (p.r * (0.85 + vnoise(x / 6, y / 6) * 0.3));
        if (d < 1) h -= (1 - d * d) ** 2 * p.r * 0.28;
        else if (d < 1.2) h += (1.2 - d) * p.r * 0.12;
      }
      // The roof over the cave sags a little.
      H[k] = h - shade * 5;
      // Charcoal albedo, with rare ice glints; the cave roof is darker and never glints.
      // The mouth: a ragged near-black gap where the shaft breaks the surface.
      const mouth = shade > 0.4 && edge - rr < 10 + (vnoise(x / 4, y / 4) - 0.5) * 8 ? (shade - 0.4) / 0.6 : 0;
      const rock = 0.75 + vnoise(x / 14 + 9, y / 14) * 0.35;
      lit[k] = rock;
      alb[k] = rock * (1 - shade * 0.4) * (1 - mouth * 0.35) + (shade < 0.1 && sceneHash(k * 0.37) < 0.004 ? 1.6 : 0);
    }
  }
  const nx = new Float32Array(n * n);
  const ny = new Float32Array(n * n);
  const nz = new Float32Array(n * n);
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      if (!mask[k]) continue;
      const hv = (q: number) => (mask[q] ? H[q]! : H[k]! - 2);
      const dx = (hv(k + 1) - hv(k - 1)) / (2 * cell);
      const dy = (hv(k + n) - hv(k - n)) / (2 * cell);
      const m = Math.hypot(dx, dy, 1);
      nx[k] = -dx / m;
      ny[k] = -dy / m;
      nz[k] = 1 / m;
    }
  }
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const img = cv.getContext("2d")!.createImageData(n, n);
  const bounce = document.createElement("canvas");
  bounce.width = n;
  bounce.height = n;
  const bc = bounce.getContext("2d")!;
  const bi = bc.createImageData(n, n);
  for (let k = 0; k < n * n; k++) {
    if (!mask[k]) continue;
    const o = k * 4;
    bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = 255;
    // Under the roof the plume still reaches the floor, but dimmer than the open rock.
    bi.data[o + 3] = 255 * Math.min(1, lit[k]! / 1.1) * (1 - roof[k]! * 0.55);
  }
  bc.putImageData(bi, 0, 0);
  const plume = document.createElement("canvas");
  plume.width = n;
  plume.height = n;
  return { n, ext, cv, cx: cv.getContext("2d")!, img, nx, ny, nz, alb, mask, bounce, plume, litRot: NaN, litSun: NaN, litDir: NaN };
}

/**
 * Rubble on the ground side of the ship: a row of rounded boulders across its
 * middle, closed off below. Shape only; the caller clips, fills or strokes.
 */
function rubblePath(ctx: Draw, x: number, y: number, closed: boolean) {
  const r = Math.hypot(x, y) || 1;
  const ux = x / r;
  const uy = y / r;
  const W = 9;
  const at = (t: number, j: number) => [x - uy * t + ux * j, y + ux * t + uy * j] as const;
  ctx.beginPath();
  let t = -W;
  const [sx, sy] = at(t, (sceneHash(0.7) - 0.5) * 2);
  ctx.moveTo(sx, sy);
  for (let i = 1; t < W; i++) {
    // Each boulder: a bump 3-7 wide that rises 1-3 above the line between them.
    const w = 2.5 + sceneHash(i * 5.3) * 2.5;
    const nt = Math.min(W, t + w);
    const [qx, qy] = at(nt, (sceneHash(i * 2.9 + 0.4) - 0.5) * 2);
    const [cx, cy] = at((t + nt) / 2, 0.8 + sceneHash(i * 7.1) * 1.6 + (sceneHash(i * 2.9 - 0.6) - 0.5) * 2);
    ctx.quadraticCurveTo(cx, cy, qx, qy);
    t = nt;
  }
  if (!closed) return;
  // Down past the tail and the flame, widening as it goes.
  const D = 70;
  const B = W * 2.2;
  ctx.lineTo(x - uy * B - ux * D, y + ux * B - uy * D);
  ctx.lineTo(x + uy * B - ux * D, y - ux * B - uy * D);
  ctx.closePath();
}

/** The hollow the ship sits in: a soft dark pool under it. */
function drawHollow(ctx: Draw, x: number, y: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
  g.addColorStop(0, "rgba(0,0,0,0.6)");
  g.addColorStop(0.55, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - 20, y - 20, 40, 40);
}

function drawNucleus(ctx: Draw, scene: CometScene) {
  if (!nucleus || nucleusCave !== scene.p.cave) {
    nucleus = buildNucleus(scene.p.cave);
    nucleusCave = scene.p.cave;
  }
  const nuc = nucleus;
  const { cv, ext } = nuc;
  // Half a texel at the rim is ~0.004 rad: below that a relight changes nothing you can see.
  const dir = Math.atan2(scene.sun.y, scene.sun.x);
  if (!(Math.abs(scene.rot - nuc.litRot) < 0.004 && nuc.litSun === scene.p.sun && Math.abs(dir - nuc.litDir) < 0.004)) {
    relightNucleus(nuc, scene);
  }
  ctx.save();
  ctx.rotate(scene.rot);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, -ext, -ext, ext * 2, ext * 2);
  ctx.restore();
}

function relightNucleus(nuc: Nucleus, scene: CometScene) {
  const { n, nx, ny, nz, alb, mask, img } = nuc;
  nuc.litRot = scene.rot;
  nuc.litSun = scene.p.sun;
  nuc.litDir = Math.atan2(scene.sun.y, scene.sun.x);
  const d = img.data;
  // Sun in the nucleus frame, low over the horizon.
  const c = Math.cos(-scene.rot);
  const sn = Math.sin(-scene.rot);
  let lx = scene.sun.x * c - scene.sun.y * sn;
  let ly = scene.sun.x * sn + scene.sun.y * c;
  let lz = 0.32;
  const m = Math.hypot(lx, ly, lz);
  lx /= m;
  ly /= m;
  lz /= m;
  const gain = 0.85 + scene.p.sun * 0.35;
  for (let k = 0; k < n * n; k++) {
    const o = k * 4;
    if (!mask[k]) {
      d[o + 3] = 0;
      continue;
    }
    const lam = Math.max(0, nx[k]! * lx + ny[k]! * ly + nz[k]! * lz);
    const v = alb[k]! * (0.025 + lam * lam * 0.72 * gain + lam * 0.18);
    d[o] = Math.min(255, 255 * v * 0.98);
    d[o + 1] = Math.min(255, 255 * v * 0.93);
    d[o + 2] = Math.min(255, 255 * v * 0.86);
    d[o + 3] = 255;
  }
  nuc.cx.putImageData(img, 0, 0);
}

// ---- glare, coma, dust tail and umbra: fixed on screen, painted once ----

let atmo: HTMLCanvasElement | null = null;
let atmoKey = "";
function atmosphere(scene: CometScene, cssW: number, cssH: number, dpr: number, zoom: number) {
  // The glare and tail follow the star; while it swings round, repaint in steps.
  const qa = Math.round(Math.atan2(scene.sun.y, scene.sun.x) / 0.05) * 0.05;
  const toSun = { x: Math.cos(qa), y: Math.sin(qa) };
  const key = `${cssW}x${cssH}x${dpr}x${zoom}x${scene.kind}x${qa.toFixed(2)}`;
  if (atmo && atmoKey === key) return atmo;
  atmoKey = key;
  atmo = atmo ?? document.createElement("canvas");
  atmo.width = Math.round(cssW * dpr);
  atmo.height = Math.round(cssH * dpr);
  const c = atmo.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cssW, cssH);
  const S = zoom;
  const sun = scene.p.sun;
  const cx = cssW / 2;
  const cy = cssH / 2;
  const px = -toSun.y;
  const py = toSun.x;
  const sl = c.createLinearGradient(cx + toSun.x * 700 * S, cy + toSun.y * 700 * S, cx, cy);
  sl.addColorStop(0, `rgba(214,220,228,${0.05 * sun})`);
  sl.addColorStop(1, "rgba(214,220,228,0)");
  c.fillStyle = sl;
  c.fillRect(0, 0, cssW, cssH);
  const coma = c.createRadialGradient(cx + toSun.x * 30 * S, cy + toSun.y * 30 * S, NUCLEUS_R * 0.6 * S, cx, cy, 300 * S);
  coma.addColorStop(0, `rgba(170,170,166,${0.07 * sun})`);
  coma.addColorStop(1, "rgba(170,170,166,0)");
  c.fillStyle = coma;
  c.fillRect(0, 0, cssW, cssH);
  const L = 900 * S;
  const tg = c.createLinearGradient(cx, cy, cx - toSun.x * L, cy - toSun.y * L);
  tg.addColorStop(0, `rgba(150,148,142,${0.07 * sun})`);
  tg.addColorStop(1, "rgba(150,148,142,0)");
  c.save();
  c.filter = `blur(${22 * S}px)`;
  c.fillStyle = tg;
  c.beginPath();
  c.moveTo(cx + px * NUCLEUS_R * 0.7 * S, cy + py * NUCLEUS_R * 0.7 * S);
  c.lineTo(cx - toSun.x * L + px * NUCLEUS_R * 2.6 * S, cy - toSun.y * L + py * NUCLEUS_R * 2.6 * S);
  c.lineTo(cx - toSun.x * L - px * NUCLEUS_R * 2.6 * S, cy - toSun.y * L - py * NUCLEUS_R * 2.6 * S);
  c.lineTo(cx - px * NUCLEUS_R * 0.7 * S, cy - py * NUCLEUS_R * 0.7 * S);
  c.closePath();
  c.fill();
  c.restore();
  // Umbra: a soft-edged shadow column behind the nucleus.
  const U = 1400 * S;
  const w0 = NUCLEUS_R * 0.95 * S;
  c.save();
  c.filter = `blur(${7 * S}px)`;
  const ug = c.createLinearGradient(cx, cy, cx - toSun.x * U, cy - toSun.y * U);
  ug.addColorStop(0, "rgba(0,0,0,0.8)");
  ug.addColorStop(1, "rgba(0,0,0,0.45)");
  c.fillStyle = ug;
  c.beginPath();
  c.moveTo(cx + px * w0, cy + py * w0);
  c.lineTo(cx + px * w0 * 0.8 - toSun.x * U, cy + py * w0 * 0.8 - toSun.y * U);
  c.lineTo(cx - px * w0 * 0.8 - toSun.x * U, cy - py * w0 * 0.8 - toSun.y * U);
  c.lineTo(cx - px * w0, cy - py * w0);
  c.closePath();
  c.fill();
  c.restore();
  return atmo;
}

let grainCv: HTMLCanvasElement | null = null;
function grain(ctx: Draw, cssW: number, cssH: number, alpha: number) {
  if (!grainCv) {
    grainCv = document.createElement("canvas");
    grainCv.width = grainCv.height = 160;
    const g = grainCv.getContext("2d")!;
    const im = g.createImageData(160, 160);
    for (let k = 0; k < 160 * 160; k++) {
      const v = Math.random() * 255;
      im.data[k * 4] = im.data[k * 4 + 1] = im.data[k * 4 + 2] = v;
      im.data[k * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const ox = -Math.random() * 160;
  const oy = -Math.random() * 160;
  for (let y = oy; y < cssH; y += 160) for (let x = ox; x < cssW; x += 160) ctx.drawImage(grainCv, x, y);
  ctx.restore();
}

// ---- engine light ----

function exhaust(sim: Sim) {
  const s = sim.ship;
  return { x: s.x + Math.sin(s.yaw) * 14, y: s.y + Math.cos(s.yaw) * 14 };
}

/** The engine plume is the only light on the night side: it lights what is near it. */
function engineLight(sim: Sim, scene: CometScene, x: number, y: number) {
  if (scene.glow < 0.02 || sim.phase !== "flight") return 0;
  const e = exhaust(sim);
  return scene.glow * Math.max(0, 1 - Math.hypot(x - e.x, y - e.y) / 160) ** 1.4;
}

// ---- gas, vents, outbursts (Hielo) ----

const FROST = "rgb(222,236,248)";
const FROST_PLUME = "rgb(255,210,165)";
const FROST_GLINT = "rgb(240,248,255)";

function drawFrost(ctx: Draw, sim: Sim, scene: CometScene) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const g of scene.gas) {
    const tw = 0.35 + 0.65 * Math.max(0, Math.sin(scene.t * 14 + g.k * 7));
    let vis = 1;
    let L = 0;
    if (inUmbra(scene, g.x, g.y)) {
      // Unlit in the shadow, except a rare starlit glint, or the plume.
      L = engineLight(sim, scene, g.x, g.y);
      vis = Math.max(L * 1.6, tw > 0.985 ? 0.5 : 0);
      if (vis < 0.02) continue;
    }
    const u = g.age / g.life;
    const a = (1 - u) * (g.b === 1 ? 0.55 : 0.32) * tw * Math.min(1, vis);
    const z = g.b === 1 ? 1.6 : 1.1;
    // One fixed color per kind and alpha on the context: no style string per particle.
    ctx.globalAlpha = a;
    ctx.fillStyle = L > 0.05 ? FROST_PLUME : FROST;
    ctx.fillRect(g.x - z / 2, g.y - z / 2, z, z);
    if (tw > 0.96 && u < 0.6) {
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = FROST_GLINT;
      ctx.fillRect(g.x - z * 1.6, g.y - 0.4, z * 3.2, 0.8);
      ctx.fillRect(g.x - 0.4, g.y - z * 1.6, 0.8, z * 3.2);
    }
  }
  ctx.globalAlpha = 1;
  for (const j of scene.jets) {
    if (!j.on || j.fade < 1) continue;
    const { x, y } = surfacePoint(scene, j.a);
    const fl = 0.75 + 0.25 * Math.sin(scene.t * 23 + j.a * 9);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, `rgba(235,244,255,${0.22 * fl})`);
    g.addColorStop(1, "rgba(235,244,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawBursts(ctx: Draw, scene: CometScene) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of scene.bursts) {
    const { x, y, w } = surfacePoint(scene, b.a, 1);
    if (b.t < b.warn) {
      // The tell: a pulsing point at the vent, always before it blows.
      const u = b.t / b.warn;
      const pulse = 0.5 + 0.5 * Math.sin(b.t * (8 + u * 18));
      const r = 6 + u * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(214,236,255,${0.35 + pulse * 0.5})`);
      g.addColorStop(1, "rgba(214,236,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      continue;
    }
    const k = b.t - b.warn;
    if (k < 0.25) {
      // Dry flash.
      const r = 20 + k * 300;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k / 0.25)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    if (k < 1.6) {
      // Frost front: an arc opening outward.
      ctx.strokeStyle = `rgba(220,236,250,${0.45 * (1 - k / 1.6)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 24 + k * 250, w - 1.15, w + 1.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function rockPath(ctx: Draw, r: CometScene["rocks"][number]) {
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * TAU + r.spin;
    const rr = r.r * (0.75 + sceneHash(r.k + i) * 0.45);
    const x = r.x + Math.cos(a) * rr;
    const y = r.y + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Charcoal rocks: a hard sliver of light on the sun side; in the shadow only a silhouette, or the plume's glow. */
function drawRocks(ctx: Draw, sim: Sim, scene: CometScene) {
  for (const r of scene.rocks) {
    rockPath(ctx, r);
    ctx.fillStyle = "#0c0c0d";
    ctx.fill();
    if (inUmbra(scene, r.x, r.y)) {
      if (r.fall) {
        ctx.strokeStyle = "rgba(64,66,72,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const L = engineLight(sim, scene, r.x, r.y);
      if (L > 0.03) {
        const dx = sim.ship.x - r.x;
        const dy = sim.ship.y - r.y;
        const m = Math.hypot(dx, dy) || 1;
        ctx.save();
        rockPath(ctx, r);
        ctx.clip();
        ctx.fillStyle = `rgba(214,150,100,${Math.min(1, L * 1.4)})`;
        ctx.beginPath();
        ctx.arc(r.x + (dx / m) * r.r * 1.15, r.y + (dy / m) * r.r * 1.15, r.r * 1.05, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      continue;
    }
    ctx.save();
    rockPath(ctx, r);
    ctx.clip();
    ctx.fillStyle = "#8c8780";
    ctx.beginPath();
    ctx.arc(r.x + scene.sun.x * r.r * 1.15, r.y + scene.sun.y * r.r * 1.15, r.r * 1.05, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** A rock landing on the nucleus: a dust puff that rises and thins, and grit thrown out. */
function drawImpacts(ctx: Draw, scene: CometScene) {
  for (const im of scene.impacts) {
    const u = im.t / IMPACT_LIFE_S;
    const dark = inUmbra(scene, im.x, im.y);
    const tone = dark ? "52,52,56" : "158,151,142";
    const tx = -im.ny;
    const ty = im.nx;
    // Dust: lifts off the surface and spreads.
    const lift = im.r * (0.6 + u * 3.2);
    const px = im.x + im.nx * lift;
    const py = im.y + im.ny * lift;
    const R = im.r * (1.3 + u * 4.5);
    const a = (dark ? 0.3 : 0.55) * (1 - u) * (1 - u);
    const g = ctx.createRadialGradient(px, py, 0, px, py, R);
    g.addColorStop(0, `rgba(${tone},${a})`);
    g.addColorStop(0.6, `rgba(${tone},${a * 0.45})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - R, py - R, R * 2, R * 2);
    // Grit: a few chips thrown out in a fan, falling back as they fade.
    ctx.fillStyle = `rgba(${tone},${(dark ? 0.5 : 0.85) * (1 - u)})`;
    const n = 5 + Math.round(im.r);
    for (let i = 0; i < n; i++) {
      const h = sceneHash(im.k * 5.1 + i * 3.3);
      const s = (h - 0.5) * 2.2;
      const sp = im.r * (4 + sceneHash(im.k + i * 1.9) * 7);
      const out = Math.cos(s) * sp * im.t - 0.5 * 40 * im.t * im.t;
      const side = Math.sin(s) * sp * im.t;
      const gx = im.x + im.nx * Math.max(0, out) + tx * side;
      const gy = im.y + im.ny * Math.max(0, out) + ty * side;
      const z = 0.6 + h * 0.9;
      ctx.fillRect(gx - z / 2, gy - z / 2, z, z);
    }
  }
}

function drawPlumeOnGround(ctx: Draw, sim: Sim, scene: CometScene) {
  if (scene.glow <= 0.02 || sim.phase !== "flight") return;
  const nuc = nucleus;
  if (!nuc) return;
  const e = exhaust(sim);
  const R = 140;
  // Paint the light in the nucleus frame, then keep only what the rock sends back.
  const c = Math.cos(-scene.rot);
  const sn = Math.sin(-scene.rot);
  const ex = e.x * c - e.y * sn;
  const ey = e.x * sn + e.y * c;
  const pc = nuc.plume.getContext("2d")!;
  const k = nuc.n / (nuc.ext * 2);
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.globalCompositeOperation = "source-over";
  pc.clearRect(0, 0, nuc.n, nuc.n);
  pc.setTransform(k, 0, 0, k, nuc.ext * k, nuc.ext * k);
  const g = pc.createRadialGradient(ex, ey, 0, ex, ey, R);
  g.addColorStop(0, `rgba(255,170,105,${0.34 * scene.glow})`);
  g.addColorStop(0.5, `rgba(255,150,90,${0.12 * scene.glow})`);
  g.addColorStop(1, "rgba(255,150,90,0)");
  pc.fillStyle = g;
  pc.fillRect(ex - R, ey - R, R * 2, R * 2);
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.globalCompositeOperation = "destination-in";
  pc.drawImage(nuc.bounce, 0, 0);
  ctx.save();
  ctx.rotate(scene.rot);
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(nuc.plume, -nuc.ext, -nuc.ext, nuc.ext * 2, nuc.ext * 2);
  ctx.restore();
}

/** Dotted path relative to the nucleus, nucleus gravity only. */
function drawTrajectory(ctx: Draw, sim: Sim, scene: CometScene, zoom: number) {
  if (sim.phase !== "flight") return;
  const s = sim.ship;
  ctx.save();
  ctx.setLineDash([3 / zoom, 6 / zoom]);
  ctx.strokeStyle = "rgba(200,198,192,0.38)";
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  let x = s.x;
  let y = s.y;
  let vx = s.vx;
  let vy = s.vy;
  ctx.moveTo(x, y);
  for (let i = 0; i < 70; i++) {
    const d = Math.hypot(x, y) || 1;
    if (d < surfaceRadiusAt(scene, x, y) + 8) break;
    const g = NUCLEUS_GRAV_K / (d * d);
    vx -= (x / d) * g * 0.05;
    vy -= (y / d) * g * 0.05;
    x += vx * 0.05;
    y += vy * 0.05;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

let shipDark = 0;
let lastT = 0;

/** Scene readout: which comet, and while landed how long is left and whether the site is in day or night. */
function drawReadout(ctx: Draw, sim: Sim, scene: CometScene, cssW: number, cssH: number) {
  const lines: [string, string][] = [[scene.p.label, "rgba(205,204,198,0.85)"]];
  if (sim.phase === "landed" || scene.held > 0) {
    const left = Math.max(0, Math.ceil(COMET_HOLD_S - scene.held));
    if (!scene.done) lines.push([`HOLD ${String(left).padStart(4)} s`, "rgba(205,204,198,0.85)"]);
    if (sim.phase === "landed") {
      const day = siteLit(scene, scene.site);
      const cave = nearCave(scene, scene.site);
      lines.push([`SITE ${cave ? " CAVE" : day ? "  DAY" : "NIGHT"}`, day ? "#c9543f" : "rgba(205,204,198,0.85)"]);
    }
  }
  ctx.save();
  ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach(([t, c], i) => {
    ctx.fillStyle = c;
    ctx.fillText(t, cssW / 2, 16 + i * 17);
  });
  if (scene.done && (!scene.arrived || (scene.arriveT >= 0 && sim.phase === "landed"))) {
    ctx.font = '500 15px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = "rgba(205,204,198,0.9)";
    ctx.fillText(scene.arrived ? "COMET IN ORBIT" : "COMET DECELERATING", cssW / 2, cssH - 64);
  } else if (scene.msgT > 0) {
    ctx.font = '500 15px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = "#c9543f";
    ctx.fillText(scene.msg.toUpperCase(), cssW / 2, cssH - 64);
  }
  ctx.restore();
}

export type CometSceneDrawHooks = {
  drawShip: (ctx: Draw, umbra: number) => void;
  drawParticles: (ctx: Draw) => void;
};

export function drawCometScene(
  ctx: Draw,
  sim: Sim,
  scene: CometScene,
  view: { cssW: number; cssH: number; dpr: number; shakeX: number; shakeY: number },
  hooks: CometSceneDrawHooks,
) {
  const { cssW, cssH, dpr, shakeX, shakeY } = view;
  const zoom = sim.camera.zoom;
  ctx.fillStyle = "#030405";
  ctx.fillRect(0, 0, cssW, cssH);
  drawStreaks(ctx, scene.flown, scene.travel, cssW, cssH, sim.reducedMotion);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The layer is painted at a stepped zoom (4% steps) and scaled to the live one,
  // so zooming in on approach does not re-blur it every frame.
  const zq = Math.exp(Math.floor(Math.log(zoom) / 0.04) * 0.04); // never above zoom: the layer overscans
  const layer = atmosphere(scene, cssW, cssH, dpr, zq);
  const sc = zoom / zq;
  const lw = cssW * dpr * sc;
  const lh = cssH * dpr * sc;
  ctx.drawImage(layer, (cssW * dpr - lw) / 2 + shakeX * dpr, (cssH * dpr - lh) / 2 + shakeY * dpr, lw, lh);
  ctx.restore();

  ctx.save();
  ctx.translate(cssW / 2 + shakeX, cssH / 2 + shakeY);
  ctx.scale(zoom, zoom);
  drawFrost(ctx, sim, scene);
  const buried = inCave(scene, sim.ship.x, sim.ship.y);
  // Exhaust in the cave stays under the rock; only its light reaches the walls.
  if (buried) hooks.drawParticles(ctx);
  drawNucleus(ctx, scene);
  drawPlumeOnGround(ctx, sim, scene);
  drawRocks(ctx, sim, scene);
  drawImpacts(ctx, scene);
  drawBursts(ctx, scene);
  drawTrajectory(ctx, sim, scene, zoom);
  if (!buried) hooks.drawParticles(ctx);
  const dt = Math.max(0, Math.min(0.1, scene.t - lastT));
  lastT = scene.t;
  const want = inUmbra(scene, sim.ship.x, sim.ship.y, 0.95) ? 1 : 0;
  shipDark += (want - shipDark) * Math.min(1, dt * 4);
  if (buried) drawHollow(ctx, sim.ship.x, sim.ship.y);
  hooks.drawShip(ctx, shipDark * 0.82);
  // Down in the cave, loose rock hides the lower half of the ship.
  if (buried) {
    ctx.save();
    rubblePath(ctx, sim.ship.x, sim.ship.y, true);
    ctx.clip();
    drawNucleus(ctx, scene);
    drawPlumeOnGround(ctx, sim, scene);
    drawHollow(ctx, sim.ship.x, sim.ship.y);
    // Each boulder rounds off into shadow at its top edge.
    rubblePath(ctx, sim.ship.x, sim.ship.y, false);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  const v = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.3, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cssW, cssH);
  if (!sim.reducedMotion) grain(ctx, cssW, cssH, 0.07);
  drawReadout(ctx, sim, scene, cssW, cssH);
}
