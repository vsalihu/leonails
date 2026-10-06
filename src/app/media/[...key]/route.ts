import { storage } from "@/lib/server/storage";

// Serves processed image variants: /media/<prefix>/<yyyy-mm>/<id>/<width>.webp
const PATTERN = /^(gallery|site|testimonial)\/\d{4}-\d{2}\/[a-f0-9]{24}\/\d{2,4}\.webp$/;

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.join("/");
  if (!PATTERN.test(path)) return new Response("Not found", { status: 404 });
  // Keys contain 96 random bits, so unpublished uploads (pending reviews) are
  // not discoverable; they are only linked from the admin dashboard.
  const body = await storage().get(path);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
