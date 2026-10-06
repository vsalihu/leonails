import { storage } from "@/lib/server/storage";

// Serves processed image variants (<prefix>/<yyyy-mm>/<id>/<width>.webp) and
// hero videos (site/<yyyy-mm>/<id>/video.mp4|webm, with byte-range support,
// which Safari needs to play video).
const IMAGE = /^(gallery|site|testimonial)\/\d{4}-\d{2}\/[a-f0-9]{24}\/\d{2,4}\.webp$/;
const VIDEO = /^site\/\d{4}-\d{2}\/[a-f0-9]{24}\/video\.(mp4|webm)$/;

const COMMON = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
};

// Keys contain 96 random bits, so unpublished uploads (pending reviews) are
// not discoverable; they are only linked from the admin dashboard.
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const path = key.join("/");
  const video = VIDEO.exec(path);
  if (!IMAGE.test(path) && !video) return new Response("Not found", { status: 404 });
  const body = await storage().get(path);
  if (!body) return new Response("Not found", { status: 404 });
  if (!video) {
    return new Response(new Uint8Array(body), { headers: { ...COMMON, "Content-Type": "image/webp" } });
  }
  const type = video[1] === "mp4" ? "video/mp4" : "video/webm";
  const size = body.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1]) end = size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...COMMON, "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(body), { headers: { ...COMMON, "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": String(size) } });
}
