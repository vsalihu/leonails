/**
 * Seamless, muted leopard texture (SVG) used for decorative accents and as the
 * printed silk in placeholder still lifes (see still-life.ts).
 */

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
