import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const fontDir = join(process.cwd(), "node_modules/@fontsource/bodoni-moda/files");

export async function brandFonts() {
  const [regular, italic] = await Promise.all([
    readFile(join(fontDir, "bodoni-moda-latin-400-normal.woff")),
    readFile(join(fontDir, "bodoni-moda-latin-400-italic.woff")),
  ]);
  return [
    { name: "Bodoni", data: regular, style: "normal" as const, weight: 400 as const },
    { name: "Bodoni", data: italic, style: "italic" as const, weight: 400 as const },
  ];
}

/** Leopard texture as a PNG data URL (the OG renderer doesn't read WebP). */
export async function leopardDataUrl(size = 320) {
  const png = await sharp(join(process.cwd(), "public/textures/leopard-light.webp")).resize(size, size).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function businessName(): Promise<string> {
  try {
    const { getSettings } = await import("./settings");
    return (await getSettings()).businessName;
  } catch {
    return "Rugile Nail Atelier";
  }
}
