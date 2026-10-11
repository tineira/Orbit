/**
 * Planet surfaces, level 2 (docs/art/README.md, fase 4). Pure pixel work:
 * albedo, clouds, night lights, gas bands and the lighting layers, as RGBA
 * buffers the renderer puts on cached canvases. The world is top-down, so a
 * rocky body's texture turns in the screen plane with `p.rotate` (like its
 * pads and sites do); only the lighting is recomputed, and only when the star
 * direction moves a bucket. Gas giants keep their bands horizontal and flow
 * them by sampling an equirect strip at the body's spin.
 */

export type Rgb = readonly [number, number, number];

export function hash01(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** Integer lattice hash, 0..1. Cheaper than the sin hash; the lattice is all integers. */
export function latticeHash(ix: number, iy: number) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise, smoothstep-interpolated. */
export function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = latticeHash(xi, yi);
  const b = latticeHash(xi + 1, yi);
  const c = latticeHash(xi, yi + 1);
  const d = latticeHash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, octaves = 5) {
  let s = 0;
  let f = 1;
  let amp = 0.5;
  for (let i = 0; i < octaves; i++) {
    s += amp * noise2(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

export function parseHexRgb(hex: string): Rgb {
  const raw = hex.trim();
  const m = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = raw.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rim light from a body's own tint, lifted toward white. */
export function rimFrom(colorA: string): Rgb {
  const [r, g, b] = parseHexRgb(colorA);
  return [Math.round((r + 90) * 0.5), Math.round((g + 90) * 0.5), Math.round((b + 90) * 0.5)];
}

/**
 * Texture radius in pixels, fixed per body and built once: the GPU scales it
 * to any zoom. Big rocks (the pad close-up) get the most; moons the least.
 */
export function surfaceResolution(kind: string, radius: number) {
  if (kind === "gas") return 160;
  if (kind === "moon") return 128;
  return radius >= 60 ? 256 : 160;
}

/** The lighting layers are smooth, so one modest size serves every body. */
export const SHADE_R = 128;

export const LIGHT_STEPS = 96;
export function lightAngleQ(lx: number, ly: number) {
  const a = Math.atan2(ly, lx);
  return ((Math.round((a / (Math.PI * 2)) * LIGHT_STEPS) % LIGHT_STEPS) + LIGHT_STEPS) % LIGHT_STEPS;
}
export function lightFromQ(q: number) {
  const a = (q / LIGHT_STEPS) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Gas giants re-render their bands in steps of this many radians of spin (≈ 4–10 times a second). */
export const GAS_SPIN_Q = 0.05;
export function gasSpinQ(rotate: number, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  return Math.round(rotate / GAS_SPIN_Q);
}

/** About half the giants carry rings, fixed per body. */
export function hasRings(p: { kind: string; radius: number; mass: number }) {
  if (p.kind !== "gas") return false;
  return hash01(p.radius * 1.7 + p.mass * 0.013) > 0.5;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Orthographic disk → mild equidistant stretch, so features bunch toward the limb like on a ball. */
function sphereUV(nx: number, ny: number, d: number) {
  if (d < 1e-6) return { u: 0, v: 0 };
  const s = (Math.asin(Math.min(1, d)) / (Math.PI / 2)) * 1.3;
  return { u: (nx / d) * s, v: (ny / d) * s };
}

function edgeAlpha(d2: number) {
  return d2 > 0.98 ? Math.round(255 * clamp01(1 - (d2 - 0.98) / 0.02)) : 255;
}

export type AlbedoOpts = {
  kind: "rocky" | "moon";
  colorA: string;
  colorB: string;
  seed: number;
  craters: boolean;
};

/** Rock or moon surface: two-tone fbm, grain, craters. Size is 2R, RGBA. */
export function albedoDisk(R: number, o: AlbedoOpts): Uint8ClampedArray<ArrayBuffer> {
  const sz = R * 2;
  const out = new Uint8ClampedArray(sz * sz * 4);
  const A = parseHexRgb(o.colorA);
  const B = parseHexRgb(o.colorB);
  const craters: { x: number; y: number; r: number }[] = [];
  if (o.craters) {
    const n = o.kind === "moon" ? 11 : 8;
    for (let i = 0; i < n; i++) {
      const a = hash01(i * 3.3 + o.seed) * Math.PI * 2;
      const rr = Math.sqrt(hash01(i * 5.1 + o.seed)) * 0.85;
      craters.push({
        x: Math.cos(a) * rr * 1.3,
        y: Math.sin(a) * rr * 1.3,
        r: 0.07 + hash01(i * 1.9 + o.seed) * 0.16,
      });
    }
  }
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const { u, v } = sphereUV(nx, ny, Math.sqrt(d2));
      const n = fbm2(u * 2.2 + o.seed, v * 2.2 + 7);
      const n2 = fbm2(u * 8 + o.seed * 0.3, v * 8, 4);
      const k = clamp01((n - 0.38) * 2);
      const grain = 0.82 + n2 * 0.36;
      let r = (A[0] * (1 - k) + B[0] * k) * grain;
      let g = (A[1] * (1 - k) + B[1] * k) * grain;
      let b = (A[2] * (1 - k) + B[2] * k) * grain;
      for (const c of craters) {
        const dd = Math.hypot(u - c.x, v - c.y) / c.r;
        if (dd < 1) {
          const m = dd > 0.8 ? 1.12 : 0.78;
          r *= m;
          g *= m;
          b *= m;
        }
      }
      const i = (y * sz + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = edgeAlpha(d2);
    }
  }
  return out;
}

/** Cloud deck as straight-alpha RGBA; drawn over the albedo before the shade. */
export function cloudDisk(R: number, seed: number, color: Rgb = [236, 232, 224]): Uint8ClampedArray<ArrayBuffer> {
  const sz = R * 2;
  const out = new Uint8ClampedArray(sz * sz * 4);
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const { u, v } = sphereUV(nx, ny, Math.sqrt(d2));
      const cl = fbm2(u * 3 + 9 + seed, v * 5 + seed * 0.7);
      const ca = clamp01((cl - 0.56) * 2.2);
      if (ca <= 0) continue;
      const i = (y * sz + x) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = Math.round(ca * 255 * (edgeAlpha(d2) / 255));
    }
  }
  return out;
}

/**
 * Night lights (Tomás: few and dim). Sparse hash grid on `lon * 110` inside
 * noise clusters; the texture is upscaled a lot on the pad, so the grid is
 * thinned past the mockup's 0.95 / 0.6 and the intensity sits under 0.45.
 * Drawn with `lighter`, masked to the night side by the shade's night layer.
 */
export function lightsDisk(R: number, seed: number): Uint8ClampedArray<ArrayBuffer> {
  const sz = R * 2;
  const out = new Uint8ClampedArray(sz * sz * 4);
  const f = 0.3;
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 > 0.96) continue;
      const { u, v } = sphereUV(nx, ny, Math.sqrt(d2));
      const cx = Math.floor(u * 110);
      const cy = Math.floor(v * 110);
      if (latticeHash(cx + Math.floor(seed * 13), cy) <= 0.985) continue;
      if (noise2(u * 3 + 2 + seed, v * 3 + 5) <= 0.66) continue;
      const i = (y * sz + x) * 4;
      out[i] = 250;
      out[i + 1] = 180;
      out[i + 2] = 100;
      out[i + 3] = Math.round(255 * f);
    }
  }
  return out;
}

/** Equirect band strip for a gas giant, periodic in longitude. RGBA, w × h. */
export function gasStrip(w: number, h: number, bands: readonly string[], seed: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4);
  const pal = bands.map(parseHexRgb);
  const sample = (lon: number, lat: number): Rgb => {
    const band = lat * 3.4 + Math.sin(lon * 2 + lat * 6) * 0.1 + fbm2(lon * 1.3 + seed, lat * 9) * 0.35;
    const idx = Math.floor((((band % 1) + 1) % 1) * pal.length);
    let [r, g, b] = pal[Math.min(pal.length - 1, idx)]!;
    const st = Math.exp(-(((lon - 0.3) ** 2) / 0.02 + ((lat - 0.25) ** 2) / 0.006));
    if (st > 0.05) {
      r = r * (1 - st * 0.7) + 190 * st * 0.7;
      g = g * (1 - st * 0.7) + 110 * st * 0.7;
      b = b * (1 - st * 0.7) + 80 * st * 0.7;
    }
    return [r, g, b];
  };
  const seam = Math.max(1, Math.floor(w * 0.08));
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w - 0.5) * Math.PI * 2;
      let c = sample(lon, lat);
      if (x >= w - seam) {
        // Crossfade the strip's tail into its head so the wrap has no seam.
        const t = seam > 1 ? (x - (w - seam)) / (seam - 1) : 1;
        const wrapped = sample(lon - Math.PI * 2, lat);
        c = [
          c[0] * (1 - t) + wrapped[0] * t,
          c[1] * (1 - t) + wrapped[1] * t,
          c[2] * (1 - t) + wrapped[2] * t,
        ];
      }
      const i = (y * w + x) * 4;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }
  return out;
}

/** The giant's visible disk at `spin`, sampled from its strip. RGBA, size 2R. */
export function gasDisk(R: number, strip: Uint8ClampedArray<ArrayBuffer>, w: number, h: number, spin: number): Uint8ClampedArray<ArrayBuffer> {
  const sz = R * 2;
  const out = new Uint8ClampedArray(sz * sz * 4);
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const lon = Math.atan2(nx, nz) + spin;
      const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
      // Bilinear sample, wrapping in longitude, so the bands do not stair-step when upscaled.
      const fx = ((((lon / (Math.PI * 2) + 0.5) % 1) + 1) % 1) * w - 0.5;
      const fy = Math.max(0, Math.min(h - 1, (lat / Math.PI + 0.5) * (h - 1)));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const xa = ((x0 % w) + w) % w;
      const xb = (xa + 1) % w;
      const ya = y0;
      const yb = Math.min(h - 1, y0 + 1);
      const i00 = (ya * w + xa) * 4;
      const i10 = (ya * w + xb) * 4;
      const i01 = (yb * w + xa) * 4;
      const i11 = (yb * w + xb) * 4;
      const i = (y * sz + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = strip[i00 + c]! * (1 - tx) + strip[i10 + c]! * tx;
        const bot = strip[i01 + c]! * (1 - tx) + strip[i11 + c]! * tx;
        out[i + c] = top * (1 - ty) + bot * ty;
      }
      out[i + 3] = edgeAlpha(d2);
    }
  }
  return out;
}

export type ShadeLayers = {
  /** Grey multiply layer: star-facing side bright, terminator, limb darkening. */
  shade: Uint8ClampedArray<ArrayBuffer>;
  /** Additive rim light along the lit limb. */
  rim: Uint8ClampedArray<ArrayBuffer>;
  /** Alpha mask of the night side, for the lights. */
  night: Uint8ClampedArray<ArrayBuffer>;
};

/** Lighting for a disk lit from the in-plane direction (lx, ly). Size 2R each. */
export function shadeLayers(R: number, lx: number, ly: number, rimColor: Rgb): ShadeLayers {
  const sz = R * 2;
  const shade = new Uint8ClampedArray(sz * sz * 4);
  const rim = new Uint8ClampedArray(sz * sz * 4);
  const night = new Uint8ClampedArray(sz * sz * 4);
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const nx = (x + 0.5 - R) / R;
      const ny = (y + 0.5 - R) / R;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const plane = nx * lx + ny * ly;
      const ndl = plane * 0.92 + nz * 0.42;
      const lit = clamp01(ndl * 1.15 + 0.04);
      const g = (0.08 + 0.92 * lit) * (0.72 + 0.28 * Math.pow(nz, 0.35));
      const i = (y * sz + x) * 4;
      const gv = Math.round(255 * g);
      const a = edgeAlpha(d2);
      shade[i] = gv;
      shade[i + 1] = gv;
      shade[i + 2] = gv;
      shade[i + 3] = a;
      const rimK = Math.pow(1 - nz, 3) * Math.max(0, plane + 0.3);
      if (rimK > 0.004) {
        rim[i] = rimColor[0];
        rim[i + 1] = rimColor[1];
        rim[i + 2] = rimColor[2];
        rim[i + 3] = Math.round(Math.min(255, rimK * 255) * (a / 255));
      }
      const nightK = clamp01(1 - lit / 0.06);
      if (nightK > 0) {
        night[i + 3] = Math.round(nightK * a);
      }
    }
  }
  return { shade, rim, night };
}

/** Abandoned tower: visible on the night side only, fading at the terminator, pulsing. */
export function beaconAlpha(day: number, nowMs: number, reducedMotion: boolean) {
  if (day > -0.08) return 0;
  const depth = clamp01((-day - 0.08) / 0.3);
  const pulse = reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(nowMs * 0.004);
  return depth * pulse;
}
