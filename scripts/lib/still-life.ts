/**
 * Raster still-life renderer for placeholder imagery: draped satin with glossy
 * nail-polish swatches, shaded per pixel in floating point (no banding).
 * Output is clearly a placeholder (a "Placeholder image" mark is added by the
 * caller); it exists so layouts can be judged with tasteful imagery until
 * Rugile's own photography replaces it.
 */
import sharp from "sharp";

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Swatch = { cx: number; cy: number; rx: number; ry: number; angle: number; color: string; tip?: string; accent?: string; metallic?: boolean };

export type StillLife = {
  width: number;
  height: number;
  seed: number;
  fabric: string; // base satin colour
  sheen: string; // specular tint
  swatches?: Swatch[]; // positions as fractions of width/height; radii as fractions of min(w,h)
  lightAzimuth?: number; // degrees, 0 = from the right, 90 = from the top
  /** Optional printed pattern on the fabric (e.g. a leopard tile), sampled as albedo. */
  print?: { rgb: Buffer; width: number; height: number; scale: number; strength: number };
  /** Fold calmness: lower = broader, softer drape. Default 1. */
  foldFrequency?: number;
};

export async function renderStillLife(o: StillLife): Promise<Buffer> {
  const { width: W, height: H } = o;
  const rand = prng(o.seed);
  // Draped folds: a few long, slightly warped waves at different angles.
  const waves = Array.from({ length: 5 }, (_, i) => ({
    angle: -0.35 + rand() * 0.5 + (i % 2) * 0.15,
    freq: ((2.2 + rand() * 3.2) * (o.foldFrequency ?? 1)) / Math.max(W, H),
    amp: (1 - i * 0.15) * (0.9 + rand() * 0.3),
    phase: rand() * Math.PI * 2,
    warpF: (0.6 + rand() * 1.2) / Math.max(W, H),
    warpA: 18 + rand() * 40,
  }));
  const S = Math.min(W, H);
  const sw = (o.swatches ?? []).map((s) => {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    return {
      ...s, x: s.cx * W, y: s.cy * H, a: s.rx * S, b: s.ry * S, c, sn,
      col: hex(s.color).map(toLin) as RGB,
      tipCol: s.tip ? (hex(s.tip).map(toLin) as RGB) : null,
      accCol: s.accent ? (hex(s.accent).map(toLin) as RGB) : null,
    };
  });
  const fabric = hex(o.fabric).map(toLin) as RGB;
  const sheen = hex(o.sheen).map(toLin) as RGB;
  const az = ((o.lightAzimuth ?? 125) * Math.PI) / 180;
  const L = normalize([Math.cos(az) * 0.6, -Math.sin(az) * 0.6, 0.8]);
  const V: RGB = [0, 0, 1];
  const Hv = normalize([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);

  const fold = (x: number, y: number) => {
    let h = 0;
    for (const w of waves) {
      const u = x * Math.cos(w.angle) + y * Math.sin(w.angle);
      const v = -x * Math.sin(w.angle) + y * Math.cos(w.angle);
      h += w.amp * Math.sin(u * w.freq * Math.PI * 2 + w.phase + Math.sin(v * w.warpF * Math.PI * 2) * (w.warpA / 20));
    }
    return h * S * 0.012;
  };
  // Swatch: elliptical dome; returns local coords (0..1 inside) or null.
  const inSwatch = (x: number, y: number) => {
    for (const s of sw) {
      const dx = x - s.x, dy = y - s.y;
      const v = (-dx * s.sn + dy * s.c) / s.b;
      // almond: narrow towards the free edge (v < 0)
      const taper = 1 - 0.42 * Math.max(0, -v) ** 1.6;
      const u = (dx * s.c + dy * s.sn) / (s.a * taper);
      const r2 = u * u + v * v;
      if (r2 < 1) return { s, u, v, r2 };
    }
    return null;
  };

  const buf = Buffer.alloc(W * H * 3);
  const e = 1.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col: RGB;
      const hit = inSwatch(x, y);
      if (hit) {
        // Glossy dome: normal from ellipsoid height, strong tight specular.
        const { s, u, v, r2 } = hit;
        const z = Math.sqrt(1 - r2);
        const nLocal = normalize([u / s.a * S * 0.08, v / s.b * S * 0.08, z + 0.15]);
        const n: RGB = [nLocal[0] * s.c - nLocal[1] * s.sn, nLocal[0] * s.sn + nLocal[1] * s.c, nLocal[2]];
        const nn = normalize(n);
        const diff = Math.max(0, dot(nn, L));
        const spec = Math.max(0, dot(nn, Hv)) ** (s.metallic ? 30 : 90);
        const rim = Math.max(0, 1 - nn[2]) ** 3;
        let base = s.tipCol && v < -0.55 ? s.tipCol : s.col; // French tip at the free edge
        if (s.accCol && Math.abs(v + 0.25 + u * 0.18) < 0.035) base = s.accCol; // fine line art
        const specStrength = s.metallic ? 0.9 : 1.15;
        col = [0, 1, 2].map((i) => base[i] * (0.35 + 0.75 * diff) + spec * specStrength * (s.metallic ? base[i] * 2.2 : 1) + rim * 0.04) as RGB;
      } else {
        const h = fold(x, y);
        const dx = (fold(x + e, y) - fold(x - e, y)) / (2 * e);
        const dy = (fold(x, y + e) - fold(x, y - e)) / (2 * e);
        const n = normalize([-dx, -dy, 1]);
        const diff = Math.max(0, dot(n, L));
        // satin: broad, soft anisotropic-looking sheen
        const spec = Math.max(0, dot(n, Hv)) ** 14;
        // contact shadow from swatches, offset away from the light
        let shade = 1;
        for (const s of sw) {
          const ox = x + L[0] * S * 0.035, oy = y + L[1] * S * 0.035;
          const dx2 = ox - s.x, dy2 = oy - s.y;
          const u = (dx2 * s.c + dy2 * s.sn) / (s.a * 1.12);
          const v = (-dx2 * s.sn + dy2 * s.c) / (s.b * 1.12);
          const d = Math.sqrt(u * u + v * v);
          if (d < 1.6) shade *= 0.55 + 0.45 * smooth(0.7, 1.6, d);
        }
        let albedo = fabric;
        if (o.print) {
          const p = o.print;
          // the print follows the drape slightly (offset by fold height)
          const px = Math.floor(((x + h * 0.6) / p.scale) % p.width + p.width) % p.width;
          const py = Math.floor(((y + h * 0.4) / p.scale) % p.height + p.height) % p.height;
          const j = (py * p.width + px) * 3;
          const t: RGB = [toLin(p.rgb[j] / 255), toLin(p.rgb[j + 1] / 255), toLin(p.rgb[j + 2] / 255)];
          albedo = [0, 1, 2].map((k) => fabric[k] * (1 - p.strength) + t[k] * p.strength) as RGB;
        }
        col = [0, 1, 2].map((i) => (albedo[i] * (0.42 + 0.7 * diff) + sheen[i] * spec * 0.55) * shade) as RGB;
      }
      // vignette
      const vx = x / W - 0.48, vy = y / H - 0.42;
      const vig = 1 - 0.38 * smooth(0.25, 0.85, Math.sqrt(vx * vx + vy * vy));
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        const g = (rand() - 0.5) * 0.018; // fine film grain
        buf[i + k] = Math.round(255 * clamp(toSrgb(clamp(col[k] * vig)) + g));
      }
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

/** Adds the visible placeholder mark. */
export async function markPlaceholder(img: Buffer, W: number, H: number, dark: boolean, label = "Placeholder image") {
  const fs = Math.max(14, Math.round(Math.min(W, H) * 0.024));
  // Centred near the top so it survives any crop (object-fit: cover trims the sides).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="${Math.round(W / 2)}" y="${Math.round(H * 0.1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" letter-spacing="3" fill="${dark ? "#F7F3EC" : "#2B211D"}" fill-opacity="0.55">${label.toUpperCase()}</text></svg>`;
  return sharp(img).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toBuffer();
}

function dot(a: RGB, b: RGB) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v: number[]): RGB {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function clamp(v: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}
function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Rasterises an SVG tile (e.g. leopardSvg output) for use as a fabric print. */
export async function rasterTile(svg: string, size: number, blur = 1.2) {
  const { data, info } = await sharp(Buffer.from(svg)).resize(size, size).blur(blur).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}
