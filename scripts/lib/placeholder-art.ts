/**
 * Generates the site's placeholder artwork locally (no third-party images):
 * - a seamless, muted leopard texture used as a decorative accent;
 * - abstract "polish swatch" compositions that stand in for photography.
 * Every placeholder photo carries a visible "Placeholder" mark so it is never
 * mistaken for Rugile's work. Replace them from Admin > Gallery.
 */
import sharp from "sharp";

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

/**
 * One leopard rosette: a tawny centre ringed by 2-5 irregular, tapered dark
 * blobs (filled shapes, not strokes) with uneven gaps, like real pelage.
 */
function rosette(rand: () => number, cx: number, cy: number, r: number, ink: string, centre: string) {
  const parts: string[] = [];
  const squash = 0.7 + rand() * 0.25;
  const tilt = rand() * Math.PI;
  const ringR = (a: number) => r * (0.92 + 0.18 * Math.sin(a * 3 + tilt) + rand() * 0.04);
  const pt = (a: number, rad: number) => {
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad * squash;
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
  };
  // centre: smooth irregular blob (quadratic curves through edge midpoints)
  const cp: number[][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    cp.push(pt(a, ringR(a) * (0.78 + rand() * 0.14)));
  }
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(cp[cp.length - 1], cp[0]);
  let d = `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`;
  for (let i = 0; i < cp.length; i++) {
    const m = mid(cp[i], cp[(i + 1) % cp.length]);
    d += ` Q${cp[i][0].toFixed(1)} ${cp[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  parts.push(`<path d="${d} Z" fill="${centre}" opacity="0.85"/>`);
  const segments = 2 + Math.floor(rand() * 4);
  let angle = rand() * Math.PI * 2;
  for (let i = 0; i < segments; i++) {
    const slot = (Math.PI * 2) / segments;
    const span = slot * (0.45 + rand() * 0.35);
    const thick = r * (0.26 + rand() * 0.22);
    const outer: string[] = [];
    const inner: string[] = [];
    const steps = 8;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const a = angle + span * t;
      const w = thick * Math.sin(Math.PI * t) ** 0.6 * (0.8 + rand() * 0.35);
      const base = ringR(a);
      const [ox, oy] = pt(a, base + w * 0.55);
      const [ix, iy] = pt(a, base - w * 0.45);
      outer.push(`${ox.toFixed(1)},${oy.toFixed(1)}`);
      inner.unshift(`${ix.toFixed(1)},${iy.toFixed(1)}`);
    }
    parts.push(`<polygon points="${outer.concat(inner).join(" ")}" fill="${ink}" stroke="${ink}" stroke-width="${(thick * 0.18).toFixed(1)}" stroke-linejoin="round"/>`);
    angle += slot + (rand() - 0.5) * slot * 0.3;
  }
  return parts.join("");
}

export function leopardSvg(opts: { size?: number; ground: string; ink: string; centre: string; seed?: number; density?: number }) {
  const size = opts.size ?? 640;
  const rand = prng(opts.seed ?? 7);
  // Jittered grid for even, natural spacing; drawn with wrap-around so the tile is seamless.
  const cells = opts.density ?? 7;
  const step = size / cells;
  const shapes: string[] = [];
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = gx * step + step * (0.2 + rand() * 0.6) + (gy % 2 ? step / 2 : 0);
      const cy = gy * step + step * (0.2 + rand() * 0.6);
      const r = step * (0.3 + rand() * 0.12);
      const state = rand();
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < -step || x > size + step || y < -step || y > size + step) continue;
          shapes.push(rosette(prng(Math.floor(state * 1e9)), Number(x.toFixed(1)), Number(y.toFixed(1)), r, opts.ink, opts.centre));
        }
      }
      // small solitary spots between rosettes
      if (rand() > 0.45) {
        const sx = gx * step + rand() * step;
        const sy = gy * step + rand() * step;
        const sr = step * (0.04 + rand() * 0.05);
        for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size])
          shapes.push(`<ellipse cx="${(sx + dx).toFixed(1)}" cy="${(sy + dy).toFixed(1)}" rx="${sr.toFixed(1)}" ry="${(sr * 0.75).toFixed(1)}" fill="${opts.ink}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="100%" height="100%" fill="${opts.ground}"/>
<g>${shapes.join("")}</g>
</svg>`;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export type SwatchStyle = {
  backdrop: [string, string];
  polishes: string[];
  tip?: string; // french tip colour
  accent?: string; // fine detail line (nail art)
  leopardAccent?: boolean;
};

/**
 * Abstract placeholder: a fan of almond-shaped nails over a soft backdrop,
 * with a visible "Placeholder" mark.
 */
export function swatchSvg(w: number, h: number, style: SwatchStyle, seed: number, label = "Placeholder image") {
  const rand = prng(seed);
  const cx = w * (0.45 + rand() * 0.15);
  const count = 5;
  const nailW = Math.min(w, h) * 0.13;
  const nailH = nailW * 2.3;
  // centre the fan vertically: nails span [cy - R - nailH, cy - R]
  const R0 = Math.min(w, h) * 0.32;
  const cy = h * 0.5 + R0 + nailH / 2 - nailH * 0.15 + (rand() - 0.5) * h * 0.04;
  const spread = 70 + rand() * 25;
  const nails: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = -spread / 2 + (spread / (count - 1)) * i + (rand() - 0.5) * 6;
    const radius = Math.min(w, h) * (0.3 + (i === 2 ? 0.04 : 0) + rand() * 0.02);
    const colour = style.polishes[i % style.polishes.length];
    const id = `n${i}`;
    const path = `M0 ${nailH} C ${-nailW * 0.62} ${nailH * 0.7}, ${-nailW * 0.55} ${nailH * 0.12}, 0 0 C ${nailW * 0.55} ${nailH * 0.12}, ${nailW * 0.62} ${nailH * 0.7}, 0 ${nailH} Z`;
    nails.push(`<g transform="translate(${cx} ${cy}) rotate(${a.toFixed(1)}) translate(0 ${(-radius - nailH).toFixed(1)})">
  <clipPath id="${id}"><path d="${path}"/></clipPath>
  <path d="${path}" fill="${colour}"/>
  ${style.tip ? `<rect x="${-nailW}" y="-2" width="${nailW * 2}" height="${(nailH * 0.24).toFixed(1)}" fill="${style.tip}" clip-path="url(#${id})"/>` : ""}
  ${style.accent ? `<path d="M${(-nailW * 0.6).toFixed(1)} ${(nailH * 0.3).toFixed(1)} Q 0 ${(nailH * 0.16).toFixed(1)} ${(nailW * 0.6).toFixed(1)} ${(nailH * 0.3).toFixed(1)}" stroke="${style.accent}" stroke-width="${(nailW * 0.05).toFixed(1)}" fill="none" stroke-linecap="round" clip-path="url(#${id})"/>` : ""}
  <path d="M${(-nailW * 0.18).toFixed(1)} ${(nailH * 0.18).toFixed(1)} C ${(-nailW * 0.3).toFixed(1)} ${(nailH * 0.4).toFixed(1)}, ${(-nailW * 0.28).toFixed(1)} ${(nailH * 0.62).toFixed(1)}, ${(-nailW * 0.16).toFixed(1)} ${(nailH * 0.8).toFixed(1)}" stroke="#FFFFFF" stroke-opacity="0.38" stroke-width="${(nailW * 0.09).toFixed(1)}" fill="none" stroke-linecap="round"/>
</g>`);
  }
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.026));
  const dark = luminance(style.backdrop[0]) < 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${style.backdrop[0]}"/><stop offset="1" stop-color="${style.backdrop[1]}"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(Math.min(w, h) * 0.02).toFixed(1)}"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.09 0"/></filter>
</defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
<rect width="100%" height="100%" fill="url(#glow)"/>
${nails.join("\n")}
<rect width="100%" height="100%" filter="url(#grain)"/>
<text x="${Math.round(w * 0.04)}" y="${Math.round(h - h * 0.045)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" letter-spacing="2" fill="${dark ? "#F7F3EC" : "#2B211D"}" fill-opacity="0.6">${label.toUpperCase()}</text>
</svg>`;
}

/** Abstract studio interior placeholder: arches and soft light. */
export function studioSvg(w: number, h: number, seed: number, label = "Placeholder image") {
  const rand = prng(seed);
  const archW = w * (0.34 + rand() * 0.08);
  const archX = w * (0.52 + rand() * 0.1);
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.026));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EFE6DA"/><stop offset="1" stop-color="#DCCBB8"/></linearGradient>
  <linearGradient id="light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8EE"/><stop offset="1" stop-color="#E8D8C4"/></linearGradient>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.08 0"/></filter>
</defs>
<rect width="100%" height="100%" fill="url(#wall)"/>
<path d="M${archX - archW / 2} ${h * 0.82} V ${h * 0.34} A ${archW / 2} ${archW / 2} 0 0 1 ${archX + archW / 2} ${h * 0.34} V ${h * 0.82} Z" fill="url(#light)"/>
<rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="#C9B29C"/>
<rect x="${w * 0.08}" y="${h * 0.66}" width="${w * 0.38}" height="${h * 0.035}" fill="#2B211D" opacity="0.85"/>
<rect x="${w * 0.12}" y="${h * 0.695}" width="${w * 0.018}" height="${h * 0.125}" fill="#2B211D" opacity="0.85"/>
<rect x="${w * 0.4}" y="${h * 0.695}" width="${w * 0.018}" height="${h * 0.125}" fill="#2B211D" opacity="0.85"/>
<ellipse cx="${w * 0.2}" cy="${h * 0.645}" rx="${w * 0.03}" ry="${h * 0.018}" fill="#A88958"/>
<rect width="100%" height="100%" filter="url(#grain)"/>
<text x="${Math.round(w * 0.04)}" y="${Math.round(h - h * 0.045)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" letter-spacing="2" fill="#2B211D" fill-opacity="0.55">${label.toUpperCase()}</text>
</svg>`;
}

export async function svgToJpeg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

export async function svgToWebp(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}
