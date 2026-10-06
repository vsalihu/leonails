/* Regenerates static decorative assets in public/textures. Output is committed. */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { leopardSvg } from "./lib/placeholder-art";

(async () => {
  mkdirSync("public/textures", { recursive: true });
  const variants = [
    { name: "leopard-light", ground: "#E9DCCB", ink: "#3A2A22", centre: "#C2A28A", seed: 11 },
    { name: "leopard-dark", ground: "#231B17", ink: "#0F0B09", centre: "#5A4334", seed: 23 },
  ];
  for (const v of variants) {
    const png = await sharp(Buffer.from(leopardSvg({ ground: v.ground, ink: v.ink, centre: v.centre, seed: v.seed, size: 640 }))).webp({ quality: 82 }).toBuffer();
    writeFileSync(`public/textures/${v.name}.webp`, png);
    console.log(`public/textures/${v.name}.webp ${png.length} bytes`);
  }
})();
